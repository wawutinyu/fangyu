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


def tools_used_from_trace(trace: list[dict[str, Any]] | None) -> list[str]:
    tools_used: list[str] = []
    for t in trace or []:
        if t.get("tool"):
            tools_used.append(str(t["tool"]))
        if t.get("background_inject"):
            tools_used.append("task:bg")
    seen: set[str] = set()
    uniq: list[str] = []
    for name in tools_used:
        if name not in seen:
            seen.add(name)
            uniq.append(name)
    return uniq


def summarize_loop_result(
    *,
    goal: str,
    out: dict[str, Any],
    agent_mode: str = "build",
    task_depth: int = 0,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    trace = out.get("trace") or []
    row: dict[str, Any] = {
        "kind": "agent_loop",
        "goal": (goal or "")[:500],
        "agent_mode": agent_mode,
        "task_depth": int(task_depth),
        "success": out.get("success"),
        "turns": out.get("turns"),
        "error": out.get("error"),
        "plan": out.get("plan") or [],
        "tools_used": tools_used_from_trace(trace),
        "result_preview": str(out.get("result") or "")[:400],
        "trace_len": len(trace),
    }
    if extra:
        row.update(extra)
    return row


def summarize_task_child(
    *,
    goal: str,
    out: dict[str, Any],
    task_id: str,
    subagent_type: str,
    description: str = "",
    parent_depth: int = 0,
    background: bool = False,
) -> dict[str, Any]:
    """子 Agent 专用摘要（比裸 agent_loop 多 task 元数据）。"""
    return summarize_loop_result(
        goal=goal,
        out=out,
        agent_mode="build",
        task_depth=parent_depth + 1,
        extra={
            "kind": "task_child",
            "task_id": task_id,
            "subagent_type": subagent_type,
            "description": description or subagent_type,
            "parent_depth": parent_depth,
            "background": background,
        },
    )


def summarize_task_parallel(
    *,
    results: list[dict[str, Any]],
    background: bool = False,
) -> dict[str, Any]:
    return {
        "kind": "task_parallel",
        "ok": all(bool(r.get("ok")) for r in results) if results else False,
        "count": len(results),
        "background": background,
        "task_ids": [r.get("task_id") for r in results],
        "subagent_types": [r.get("subagent_type") for r in results],
        "successes": [bool(r.get("ok")) for r in results],
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
