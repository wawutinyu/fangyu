"""Agent Bundle → 单文件 exe 导出。"""
from __future__ import annotations

import json
import shutil
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path

from fangyu.core.agent_bundle import create_agent_bundle, get_run_instructions
from fangyu.core.pyinstaller_util import bundle_launcher_source, compile_python_to_exe


def build_agent_exe_zip(
    *,
    name: str,
    skills: dict,
    agent_card: dict | None,
    worker_only: bool,
    agent_kind: str,
    a2a_port: int,
    require_envelope: bool,
    trusted_peers: list | None,
    compile_timeout: int = 900,
) -> tuple[BytesIO, dict]:
    """
    创建 Agent Bundle + PyInstaller exe，打包为 ZIP。
    返回 (zip_buffer, meta)。
    """
    tmp = Path(tempfile.mkdtemp(prefix="fyu_agent_exe_"))
    try:
        bundle_dir_name = f"{name}.bundle"
        bundle_dir = tmp / bundle_dir_name
        create_agent_bundle(
            bundle_dir,
            name=name,
            skills=skills or None,
            agent_card=agent_card,
            worker_only=worker_only,
            agent_kind=agent_kind,
            a2a_port=a2a_port,
            require_envelope=require_envelope,
            trusted_peers=trusted_peers,
        )

        launcher_code = bundle_launcher_source(bundle_dir_name, a2a_port)
        work = tmp / "build"
        work.mkdir(exist_ok=True)
        exe_path, compile_log = compile_python_to_exe(
            launcher_code,
            filename="agent_launcher.py",
            exe_name=name,
            work_dir=work,
            console=True,
            timeout=compile_timeout,
        )

        instructions = get_run_instructions(bundle_dir, port=a2a_port)
        readme = _readme(name, bundle_dir_name, instructions, exe_ok=exe_path is not None)

        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("README.txt", readme)
            zf.writestr("compile.log", compile_log)
            if exe_path and exe_path.is_file():
                arc_exe = f"{name}.exe" if exe_path.suffix.lower() == ".exe" else exe_path.name
                zf.write(exe_path, arc_exe)
            for fpath in bundle_dir.rglob("*"):
                if fpath.is_file():
                    arc = f"{bundle_dir_name}/{fpath.relative_to(bundle_dir).as_posix()}"
                    zf.write(fpath, arc)
            bat = _start_bat(name, bundle_dir_name, a2a_port)
            zf.writestr("start.bat", bat)

        buf.seek(0)
        meta = {
            "name": name,
            "exe_built": bool(exe_path),
            "bundle_folder": bundle_dir_name,
            **instructions,
        }
        return buf, meta
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _readme(name: str, bundle_folder: str, instructions: dict, *, exe_ok: bool) -> str:
    exe_line = f"双击 {name}.exe 启动 Agent 服务（推荐）" if exe_ok else f"（exe 编译失败，请用 start.bat 或 CLI）"
    return f"""Fangyu Agent 导出包 — {name}
================================

{exe_line}

目录说明：
  {name}.exe          Agent 常驻服务（A2A RPC）
  {bundle_folder}/    Agent 配置与技能流程（勿删）
  start.bat           备用启动（需本机已安装 Python + fangyu）
  compile.log         exe 编译日志

运行后：
  健康检查  {instructions.get('health', '')}
  RPC 地址  {instructions.get('rpc', '')}

CLI 备用：
  {instructions.get('run', '')}
  {instructions.get('rpc_example', '')}

环境变量（可选）：
  BUNDLE_PORT=9001
  LLM_API_KEY=...     （Flow 内 LLM 节点需要时在系统设置或 .env 配置）
"""


def _start_bat(name: str, bundle_folder: str, port: int) -> str:
    return f"""@echo off
chcp 65001 >nul
if exist "{name}.exe" (
  echo 启动 {name}.exe ...
  start "" "{name}.exe"
  exit /b 0
)
echo 未找到 {name}.exe，尝试 Python 模式...
py -3 -m fangyu bundle run "%~dp0{bundle_folder}" --port {port} --daemon
pause
"""
