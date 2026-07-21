"""
流程导出 — 编译 & 打包 API
===========================
- POST /api/v1/export/bundle:   返回 ZIP（含 .py .json .bat .txt），秒返回
- POST /api/v1/export/compile:  接收 .py 源码，编译为 .exe（默认关；需鉴权+开关）
- POST /api/v1/export/compile-bundle: 编译 .exe 并打包为 ZIP
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
import threading
import time
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from fangyu.core.pyinstaller_util import compile_python_to_exe, find_pyinstaller_output

router = APIRouter(prefix="/api/v1/export", tags=["流程导出"])

_compile_lock = threading.Lock()
_compile_times: list[float] = []


def allow_export_compile() -> bool:
    """S0-B6：服务端 PyInstaller 默认关；生产 REQUIRE_AUTH 时须显式开启。"""
    raw = (os.getenv("FANGYU_ALLOW_EXPORT_COMPILE") or "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    from fangyu.core.auth_gate import require_auth

    # 本地无强制鉴权时可编译；生产默认只允许 source ZIP
    return not require_auth()


def _compile_rate_ok() -> None:
    window = float(os.getenv("FANGYU_EXPORT_COMPILE_WINDOW_SEC") or "300")
    limit = int(os.getenv("FANGYU_EXPORT_COMPILE_RATE") or "2")
    now = time.time()
    with _compile_lock:
        alive = [t for t in _compile_times if now - t < window]
        if len(alive) >= max(1, limit):
            raise HTTPException(
                429,
                f"导出编译限流：{limit} 次 / {int(window)}s（FANGYU_EXPORT_COMPILE_RATE）",
            )
        alive.append(now)
        _compile_times[:] = alive


def _safe_rel_path(name: str, *, field: str = "filename") -> Path:
    raw = (name or "").strip().replace("\\", "/")
    if not raw or raw.startswith("/") or ":" in raw.split("/")[0]:
        raise HTTPException(400, f"{field} invalid")
    p = Path(raw)
    if p.is_absolute() or ".." in p.parts or any(part.startswith("..") for part in p.parts):
        raise HTTPException(400, f"{field} path escape rejected")
    return p


def _write_extra_files(tmp_dir: Path, extra_files: list[dict]) -> None:
    for ef in extra_files or []:
        if not isinstance(ef, dict):
            raise HTTPException(400, "extraFiles entry must be object")
        rel = _safe_rel_path(str(ef.get("filename") or ""), field="extraFiles.filename")
        fpath = (tmp_dir / rel).resolve()
        if not fpath.is_relative_to(tmp_dir.resolve()):
            raise HTTPException(400, "extraFiles path escape rejected")
        fpath.parent.mkdir(parents=True, exist_ok=True)
        fpath.write_text(str(ef.get("content", "")), encoding="utf-8")


def _assert_compile_allowed() -> None:
    if not allow_export_compile():
        raise HTTPException(
            403,
            "服务端编译已禁用（默认仅允许 source ZIP）。"
            "设置 FANGYU_ALLOW_EXPORT_COMPILE=1 后重启可开启。",
        )
    _compile_rate_ok()


class CompileBody(BaseModel):
    code: str
    filename: str = "flow_export.py"
    console: bool = True


class BundleBody(BaseModel):
    pyCode: str
    buildBat: str = ""
    requirements: str = "pyinstaller>=6.0.0"
    flowConfig: dict = {}
    extraFiles: list[dict] = []
    console: bool = True


@router.post("/bundle")
async def export_bundle(body: BundleBody):
    """返回 ZIP（源码 + 配置 + 构建脚本，不含 .exe），秒级响应。"""
    tmp_dir = Path(tempfile.mkdtemp(prefix="fangyu_bundle_"))
    try:
        (tmp_dir / "flow_export.py").write_text(body.pyCode, encoding="utf-8")
        bat = body.buildBat or _default_bat()
        (tmp_dir / "build_exe.bat").write_text(bat, encoding="utf-8")
        (tmp_dir / "requirements.txt").write_text(
            body.requirements or "pyinstaller>=6.0.0", encoding="utf-8"
        )
        (tmp_dir / "flow_config.json").write_text(
            json.dumps(body.flowConfig, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        _write_extra_files(tmp_dir, body.extraFiles)

        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for fpath in tmp_dir.rglob("*"):
                if fpath.is_file():
                    zf.write(fpath, str(fpath.relative_to(tmp_dir)))
        buf.seek(0)
        return StreamingResponse(
            buf, media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="flow_export.zip"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@router.post("/compile")
async def compile_to_exe(body: CompileBody):
    """接收 Python 源码，用 PyInstaller 编译为单文件可执行程序。"""
    _assert_compile_allowed()
    safe_name = _safe_rel_path(body.filename or "flow_export.py", field="filename")
    if safe_name.suffix.lower() != ".py" or len(safe_name.parts) != 1:
        raise HTTPException(400, "filename 须为单层 .py 文件名")
    tmp_dir = Path(tempfile.mkdtemp(prefix="fangyu_export_"))
    try:
        # 必须进线程：PyInstaller 会堵死事件循环，导致整站 /api 超时
        exe_path, log = await asyncio.to_thread(
            compile_python_to_exe,
            body.code,
            filename=str(safe_name),
            exe_name=safe_name.stem,
            work_dir=tmp_dir,
            console=body.console,
            extra_pyinstaller_args=["--hidden-import", "tkinter"],
        )
        if not exe_path:
            raise HTTPException(status_code=500, detail=f"编译失败:\n{log[-2000:]}")

        out_name = exe_path.name
        return FileResponse(
            path=str(exe_path), filename=out_name,
            media_type="application/octet-stream",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


def _compile_bundle_sync(body: BundleBody, tmp_dir: Path) -> tuple[BytesIO, bool]:
    """同步编译打包（供 to_thread 调用）。返回 (zip_buf, compile_ok)。"""
    build_dir = tmp_dir / "build"
    build_dir.mkdir(parents=True, exist_ok=True)
    src_name = "flow_export.py"
    exe_name = "flow_export"
    (tmp_dir / src_name).write_text(body.pyCode, encoding="utf-8")
    (tmp_dir / "build_exe.bat").write_text(body.buildBat or _default_bat(), encoding="utf-8")
    (tmp_dir / "requirements.txt").write_text(
        body.requirements or "pyinstaller>=6.0.0\ncryptography>=41.0.0\n", encoding="utf-8"
    )
    (tmp_dir / "flow_config.json").write_text(
        json.dumps(body.flowConfig, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _write_extra_files(tmp_dir, body.extraFiles)

    exe_path, compile_log = compile_python_to_exe(
        body.pyCode,
        filename=src_name,
        exe_name=exe_name,
        work_dir=build_dir,
        console=body.console,
        extra_pyinstaller_args=["--hidden-import", "tkinter"],
        timeout=900,
    )

    readme = _flow_readme(exe_path is not None)
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.txt", readme)
        zf.writestr("compile.log", compile_log)
        for fpath in tmp_dir.rglob("*"):
            if fpath.is_file() and "build" not in fpath.parts:
                zf.write(fpath, str(fpath.relative_to(tmp_dir)))
        if exe_path and exe_path.is_file():
            zf.write(exe_path, exe_path.name)
        elif build_dir.exists():
            fallback = find_pyinstaller_output(build_dir / "dist", exe_name)
            if fallback and fallback.is_file():
                zf.write(fallback, fallback.name)
    buf.seek(0)
    return buf, exe_path is not None


@router.post("/compile-bundle")
async def compile_and_bundle(body: BundleBody):
    """编译 .exe 并打包为 ZIP（含源码 + .exe + compile.log）。"""
    _assert_compile_allowed()
    tmp_dir = Path(tempfile.mkdtemp(prefix="fangyu_bundle_"))
    try:
        buf, ok = await asyncio.to_thread(_compile_bundle_sync, body, tmp_dir)
        return StreamingResponse(
            buf, media_type="application/zip",
            headers={
                "Content-Disposition": 'attachment; filename="flow_export_bundle.zip"',
                "X-Fangyu-Compile-Ok": "true" if ok else "false",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _flow_readme(has_exe: bool) -> str:
    run = "双击 flow_export.exe 运行（Windows）" if has_exe else "exe 编译失败 — 请查看 compile.log，或运行 build_exe.bat 手动编译"
    return f"""Fangyu Flow 导出包
==================

{run}

文件说明：
  flow_export.exe     流程可执行程序（含 GUI 时需配置 LLM_API_KEY 环境变量）
  flow_export.py      Python 源码
  build_exe.bat       手动重新编译脚本
  compile.log         PyInstaller 编译日志
  flow_config.json    画布配置备份

LLM 节点运行前请设置：
  set LLM_API_KEY=你的密钥
  set LLM_ENDPOINT=https://api.deepseek.com/v1/chat/completions
"""


def _default_bat() -> str:
    return '''@echo off
chcp 65001 >nul
echo ========================================
echo  AI Flow Canvas — 编译为可执行文件
echo ========================================
python --version >nul 2>&1
if %errorlevel% neq 0 ( echo [ERROR] 请先安装 Python & pause & exit /b 1 )
pip install -r requirements.txt
if %errorlevel% neq 0 ( echo [ERROR] 依赖安装失败 & pause & exit /b 1 )
pyinstaller --onefile --console --name flow_export --hidden-import tkinter flow_export.py
if %errorlevel% neq 0 ( echo [ERROR] 编译失败 & pause & exit /b 1 )
echo.
echo OK: dist\\flow_export.exe
pause
'''
