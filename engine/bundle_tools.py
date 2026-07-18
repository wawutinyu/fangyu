"""Bundle 内 Coding 手脚 — 供 agent_loop 调用，全部限定在 active workspace。"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

from fangyu.engine.workspace import WorkspaceError, get_active_workspace


def _ws():
    ws = get_active_workspace()
    if not ws:
        raise WorkspaceError("无 active workspace — 请先 init_bundle_workspace")
    return ws


def tool_read(path: str = "") -> str:
    return _ws().read(path)


def tool_write(path: str = "", content: str = "") -> str:
    _ws().write(path, content)
    return f"wrote {path} ({len(content)} chars)"


def tool_list(path: str = ".") -> list[str]:
    return _ws().list(path)


def tool_search(pattern: str = "", path: str = ".", max_hits: int = 50) -> list[dict[str, Any]]:
    """在工作区内按正则搜文件内容（简易 ripgrep）。"""
    ws = _ws()
    root = ws.resolve(path)
    if not pattern:
        return []
    rx = re.compile(pattern)
    hits: list[dict[str, Any]] = []
    files = [root] if root.is_file() else sorted(root.rglob("*"))
    for f in files:
        if not f.is_file():
            continue
        if ".fangyu" in f.parts:
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        rel = str(f.relative_to(ws.root))
        for i, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                hits.append({"path": rel, "line": i, "text": line[:200]})
                if len(hits) >= max_hits:
                    return hits
    return hits


def tool_apply_patch(path: str = "", old: str = "", new: str = "") -> str:
    """简单字符串替换补丁（单文件）。"""
    ws = _ws()
    cur = ws.read(path)
    if old not in cur:
        raise ValueError(f"patch old 片段未找到: {path}")
    ws.write(path, cur.replace(old, new, 1))
    return f"patched {path}"


_SHELL_DENY = re.compile(
    r"(rm\s+-rf\s+/|sudo\s+|mkfs|dd\s+if=|:\(\)\s*\{|curl\s+[^\n]*\|\s*sh)",
    re.I,
)


def tool_shell(command: str = "", timeout_sec: float = 30) -> dict[str, Any]:
    """在 workspace 根目录执行 shell（基础拒绝列表；完整策略见 Worker）。"""
    cmd = (command or "").strip()
    if not cmd:
        raise ValueError("empty command")
    if _SHELL_DENY.search(cmd):
        raise PermissionError(f"命令被策略拒绝: {cmd[:80]}")
    ws = _ws()
    proc = subprocess.run(
        cmd,
        shell=True,
        cwd=str(ws.root),
        capture_output=True,
        text=True,
        timeout=timeout_sec,
    )
    return {
        "exit_code": proc.returncode,
        "stdout": (proc.stdout or "")[:8000],
        "stderr": (proc.stderr or "")[:4000],
    }


def coding_toolbelt() -> dict[str, Any]:
    """agent_loop 用的默认工具表。"""
    return {
        "read": tool_read,
        "write": tool_write,
        "list": tool_list,
        "search": tool_search,
        "apply_patch": tool_apply_patch,
        "shell": tool_shell,
    }
