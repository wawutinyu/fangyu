"""Harness 观测落盘 — workspace/.fangyu/harness_trace.jsonl"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


def resolve_trace_path(
    *,
    bundle_dir: str | Path | None = None,
    workspace: str | Path | None = None,
) -> Path | None:
    if workspace:
        return Path(workspace).expanduser() / ".fangyu" / "harness_trace.jsonl"
    if bundle_dir:
        root = Path(bundle_dir).expanduser()
        # 外部 workspace 绑定
        ws_cfg = root / "config" / "workspace.json"
        if ws_cfg.is_file():
            try:
                doc = json.loads(ws_cfg.read_text(encoding="utf-8"))
                ext = doc.get("path")
                if ext:
                    return Path(ext) / ".fangyu" / "harness_trace.jsonl"
            except (json.JSONDecodeError, OSError):
                pass
        return root / "workspace" / ".fangyu" / "harness_trace.jsonl"
    try:
        from fangyu.engine.workspace import get_active_workspace
        ws = get_active_workspace()
        if ws:
            return Path(ws.root) / ".fangyu" / "harness_trace.jsonl"
    except Exception:
        pass
    return None


def append_harness_trace(event: dict[str, Any]) -> Path | None:
    """追加一条结构化 trace；无 active workspace 则跳过。"""
    path = resolve_trace_path()
    if not path:
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    row = {
        "ts": time.time(),
        **event,
    }
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
    return path


def summarize_loop_result(
    *,
    goal: str,
    out: dict[str, Any],
    agent_mode: str = "build",
) -> dict[str, Any]:
    trace = out.get("trace") or []
    tools_used = []
    for t in trace:
        if t.get("tool"):
            tools_used.append(t["tool"])
        if t.get("background_inject"):
            tools_used.append("task:bg")
    # 去重保序
    seen: set[str] = set()
    uniq = []
    for name in tools_used:
        if name not in seen:
            seen.add(name)
            uniq.append(name)
    return {
        "kind": "agent_loop",
        "goal": (goal or "")[:500],
        "agent_mode": agent_mode,
        "success": out.get("success"),
        "turns": out.get("turns"),
        "error": out.get("error"),
        "plan": out.get("plan") or [],
        "tools_used": uniq,
        "result_preview": str(out.get("result") or "")[:400],
        "trace_len": len(trace),
    }


def read_traces(path: Path, *, limit: int = 50) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    rows: list[dict[str, Any]] = []
    for line in lines[-max(1, limit) :]:
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    rows.reverse()  # 新的在前
    return rows
