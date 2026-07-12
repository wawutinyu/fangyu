"""PyInstaller 编译工具 — Flow 导出 / Agent Bundle exe 共用。"""
from __future__ import annotations

import os
import sys
import shutil
import subprocess
import tempfile
from pathlib import Path

PYINSTALLER_HIDDEN_IMPORTS = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "engineio.async_drivers.asgi",
    "httpx",
    "anyio",
    "anyio._backends._asyncio",
]

PYINSTALLER_COLLECT_SUBMODULES = [
    "fangyu.engine",
    "fangyu.a2a",
    "fangyu.core",
]


def ensure_pyinstaller(timeout: int = 180) -> None:
    try:
        import PyInstaller  # noqa: F401
        return
    except ImportError:
        pass
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "pyinstaller>=6.0.0"],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _pyinstaller_cmd(source: Path, name: str, *, console: bool = True, extra_args: list[str] | None = None) -> list[str]:
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--console" if console else "--noconsole",
        "--name", name,
        "--clean",
        "--noconfirm",
    ]
    for mod in PYINSTALLER_HIDDEN_IMPORTS:
        cmd.extend(["--hidden-import", mod])
    for pkg in PYINSTALLER_COLLECT_SUBMODULES:
        cmd.extend(["--collect-submodules", pkg])
    if extra_args:
        cmd.extend(extra_args)
    cmd.append(str(source))
    return cmd


def find_pyinstaller_output(dist_dir: Path, name: str) -> Path | None:
    if not dist_dir.is_dir():
        return None
    if sys.platform == "win32":
        exe = dist_dir / f"{name}.exe"
        if exe.is_file():
            return exe
    candidate = dist_dir / name
    if candidate.is_file():
        return candidate
    for f in dist_dir.iterdir():
        if f.is_file() and f.suffix.lower() in (".exe", ""):
            return f
    return None


def compile_python_to_exe(
    source_code: str,
    *,
    filename: str = "launcher.py",
    exe_name: str = "app",
    work_dir: Path | None = None,
    console: bool = True,
    extra_pyinstaller_args: list[str] | None = None,
    timeout: int = 600,
) -> tuple[Path | None, str]:
    """
    编译 Python 源码为单文件可执行程序。
    返回 (exe_path, log_text)；失败时 exe_path 为 None。
    """
    owns_tmp = work_dir is None
    tmp = work_dir or Path(tempfile.mkdtemp(prefix="fyu_pyinst_"))
    log_lines: list[str] = []
    try:
        ensure_pyinstaller()
        src = tmp / filename
        src.write_text(source_code, encoding="utf-8")
        req = tmp / "requirements.txt"
        req.write_text("pyinstaller>=6.0.0\n", encoding="utf-8")
        pip = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(req)],
            capture_output=True, text=True, cwd=str(tmp), timeout=180,
        )
        log_lines.append("=== pip install ===")
        log_lines.append(pip.stdout or "")
        log_lines.append(pip.stderr or "")

        cmd = _pyinstaller_cmd(src, exe_name, console=console, extra_args=extra_pyinstaller_args)
        log_lines.append("=== pyinstaller ===")
        log_lines.append(" ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(tmp), timeout=timeout)
        log_lines.append(result.stdout or "")
        log_lines.append(result.stderr or "")

        if result.returncode != 0:
            return None, "\n".join(log_lines)

        exe = find_pyinstaller_output(tmp / "dist", exe_name)
        if not exe:
            return None, "\n".join(log_lines) + "\n[error] 未找到编译产物"
        if owns_tmp:
            out_dir = Path(tempfile.mkdtemp(prefix="fyu_exe_out_"))
            out_path = out_dir / exe.name
            shutil.copy2(exe, out_path)
            return out_path, "\n".join(log_lines)
        return exe, "\n".join(log_lines)
    except subprocess.TimeoutExpired:
        log_lines.append("[error] 编译超时")
        return None, "\n".join(log_lines)
    except Exception as e:
        log_lines.append(f"[error] {e}")
        return None, "\n".join(log_lines)
    finally:
        if owns_tmp and tmp.exists():
            shutil.rmtree(tmp, ignore_errors=True)


def bundle_launcher_source(bundle_folder_name: str, default_port: int = 9001) -> str:
    """生成 Agent Bundle 启动器源码（与 .bundle 目录同级）。"""
    return f'''"""Fangyu Agent Bundle — standalone launcher."""
import os
import sys
from pathlib import Path


def _bundle_dir() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).resolve().parent
    else:
        base = Path(__file__).resolve().parent
    return base / {bundle_folder_name!r}


def main() -> None:
    bundle = _bundle_dir()
    if not bundle.is_dir():
        print(f"[ERROR] 未找到 Bundle 目录: {{bundle}}")
        print("请确保 {bundle_folder_name} 文件夹与本程序在同一目录。")
        input("按 Enter 退出...")
        sys.exit(1)
    host = os.environ.get("BUNDLE_HOST", "127.0.0.1")
    port = int(os.environ.get("BUNDLE_PORT", "{default_port}"))
    from fangyu.engine.executor import register_executors
    register_executors()
    from fangyu.engine.bundle_runtime import run_bundle_server
    print(f"启动 Agent Bundle: {{bundle}}")
    print(f"  RPC  http://{{host}}:{{port}}/rpc")
    run_bundle_server(str(bundle), host=host, port=port, daemon=True)


if __name__ == "__main__":
    main()
'''
