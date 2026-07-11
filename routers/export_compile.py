"""
流程导出 — 编译 & 打包 API
===========================
- POST /api/v1/export/bundle:   返回 ZIP（含 .py .json .bat .txt），秒返回
- POST /api/v1/export/compile:  接收 .py 源码，编译为 .exe（首次较慢）
"""

import os
import sys
import json
import zipfile
import shutil
import tempfile
import subprocess
from pathlib import Path
from io import BytesIO
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/export", tags=["流程导出"])


class CompileBody(BaseModel):
    code: str
    filename: str = "flow_export.py"


class BundleBody(BaseModel):
    pyCode: str
    buildBat: str = ""
    requirements: str = "pyinstaller>=6.0.0"
    flowConfig: dict = {}
    extraFiles: list[dict] = []  # [{"filename": "a2a/protocol.py", "content": "..."}]


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
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for name in ("flow_export.py", "build_exe.bat", "requirements.txt", "flow_config.json"):
                zf.write(tmp_dir / name, name)
        buf.seek(0)
        return StreamingResponse(
            buf, media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="flow_export.zip"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@router.post("/compile")
async def compile_to_exe(body: CompileBody):
    """接收 Python 源码，用 PyInstaller 编译为单文件 .exe（首次需下载，可能 1-2 分钟）。"""
    tmp_dir = Path(tempfile.mkdtemp(prefix="fangyu_export_"))
    try:
        source_path = tmp_dir / body.filename
        source_path.write_text(body.code, encoding="utf-8")
        req_path = tmp_dir / "requirements.txt"
        req_path.write_text("pyinstaller>=6.0.0\n", encoding="utf-8")

        # 装依赖
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(req_path)],
            capture_output=True, text=True, cwd=str(tmp_dir), timeout=120,
        )

        # 编译
        result = subprocess.run(
            [sys.executable, "-m", "PyInstaller",
             "--onefile", "--noconsole",
             "--name", body.filename.replace(".py", ""),
             str(source_path)],
            capture_output=True, text=True, cwd=str(tmp_dir), timeout=600,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"编译失败: {result.stderr[:500]}")

        dist = tmp_dir / "dist"
        exes = list(dist.glob("*.exe"))
        if not exes:
            raise HTTPException(status_code=500, detail="未找到编译产物")

        return FileResponse(
            path=str(exes[0]), filename=exes[0].name,
            media_type="application/octet-stream",
        )
    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="编译超时（超过 10 分钟）")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        def cleanup():
            import time; time.sleep(30)
            shutil.rmtree(tmp_dir, ignore_errors=True)
        import threading
        threading.Thread(target=cleanup, daemon=True).start()


@router.post("/compile-bundle")
async def compile_and_bundle(body: BundleBody):
    """编译 .exe 并打包为 ZIP（含源码 + 配置 + 构建脚本 + .exe），一次返回。"""
    tmp_dir = Path(tempfile.mkdtemp(prefix="fangyu_bundle_"))
    try:
        src_name = "flow_export.py"
        exe_name = "flow_export.exe"
        (tmp_dir / src_name).write_text(body.pyCode, encoding="utf-8")
        bat = body.buildBat or _default_bat()
        (tmp_dir / "build_exe.bat").write_text(bat, encoding="utf-8")
        (tmp_dir / "requirements.txt").write_text(
            body.requirements or "pyinstaller>=6.0.0", encoding="utf-8"
        )
        (tmp_dir / "flow_config.json").write_text(
            json.dumps(body.flowConfig, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        # 写入 extra files (a2a/ trust/ agents/)
        for ef in body.extraFiles:
            fpath = tmp_dir / ef["filename"]
            fpath.parent.mkdir(parents=True, exist_ok=True)
            fpath.write_text(ef["content"], encoding="utf-8")

        # 安装依赖
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(tmp_dir / "requirements.txt")],
            capture_output=True, text=True, cwd=str(tmp_dir), timeout=120,
        )

        # 编译 .exe
        result = subprocess.run(
            [sys.executable, "-m", "PyInstaller",
             "--onefile", "--noconsole",
             "--name", "flow_export",
             str(tmp_dir / src_name)],
            capture_output=True, text=True, cwd=str(tmp_dir), timeout=600,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"编译失败: {result.stderr[:500]}")

        dist = tmp_dir / "dist"
        exes = list(dist.glob("*.exe"))
        exe_path = exes[0] if exes else None

        # 打包全部文件到一个 ZIP（含 all extra files in subdirectories）
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for name in (src_name, "build_exe.bat", "requirements.txt", "flow_config.json"):
                zf.write(tmp_dir / name, name)
            # Include all extra files from subdirectories (a2a/, trust/, agents/)
            for fpath in tmp_dir.rglob("*"):
                if fpath.is_file() and fpath.parent != tmp_dir:
                    arcname = str(fpath.relative_to(tmp_dir))
                    zf.write(fpath, arcname)
            if exe_path:
                zf.write(exe_path, exe_name)
        buf.seek(0)
        return StreamingResponse(
            buf, media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="flow_export_bundle.zip"'},
        )
    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="编译超时（超过 10 分钟）")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        def cleanup():
            import time; time.sleep(30)
            shutil.rmtree(tmp_dir, ignore_errors=True)
        import threading
        threading.Thread(target=cleanup, daemon=True).start()


def _default_bat() -> str:
    return '''@echo off
chcp 65001 >nul
echo ========================================
echo  AI Flow Canvas — 编译为可执行文件
echo ========================================
echo.
python --version >nul 2>&1
if %errorlevel% neq 0 ( echo [ERROR] 请先安装 Python & pause & exit /b 1 )
pip install -r requirements.txt
if %errorlevel% neq 0 ( echo [ERROR] 依赖安装失败 & pause & exit /b 1 )
pyinstaller --onefile --noconsole --name flow_export flow_export.py
if %errorlevel% neq 0 ( echo [ERROR] 编译失败 & pause & exit /b 1 )
echo.
echo OK: dist\\flow_export.exe
pause
'''
