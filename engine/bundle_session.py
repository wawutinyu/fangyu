"""Bundle 会话存储 — workspace/.fangyu/chat.jsonl"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from fangyu.engine.workspace import get_active_workspace


def _chat_path() -> Path:
    ws = get_active_workspace()
    if not ws:
        raise RuntimeError("无 active workspace")
    return ws.resolve(".fangyu/chat.jsonl")


def append_chat(role: str, content: str, **extra: Any) -> dict[str, Any]:
    entry = {
        "ts": time.time(),
        "role": role,
        "content": content,
        **extra,
    }
    path = _chat_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def load_chat(limit: int = 40) -> list[dict[str, Any]]:
    path = _chat_path()
    if not path.is_file():
        return []
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    out: list[dict[str, Any]] = []
    for ln in lines[-limit:]:
        try:
            out.append(json.loads(ln))
        except json.JSONDecodeError:
            continue
    return out


def clear_chat() -> None:
    path = _chat_path()
    if path.is_file():
        path.unlink()
