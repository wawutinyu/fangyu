"""Q1：结构化执行追踪。

默认开启；FANGYU_TRACE_MODE=off 可关。fail-open：写库失败不影响 flow。
"""
from __future__ import annotations

import json
import os
import time
import uuid
from contextvars import ContextVar
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class TraceEvent:
    trace_id: str
    node_id: str
    node_type: str
    event_type: str  # start | end | error | retry | fallback | flow_start | flow_end
    timestamp: float
    duration_ms: float | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    flow_id: str = ""
    node_name: str = ""


_TRACE_ID: ContextVar[str | None] = ContextVar("fangyu_trace_id", default=None)
_EVENTS: ContextVar[list[TraceEvent] | None] = ContextVar("fangyu_trace_events", default=None)

_TRUNC = {
    "llm_prompt": 4096,
    "llm_response": 4096,
    "tool_args": 1024,
    "tool_result": 2048,
    "error": 512,
    "inputs": 2048,
    "outputs": 4096,
}


def tracer_enabled() -> bool:
    raw = (os.getenv("FANGYU_TRACE_MODE") or "on").strip().lower()
    return raw not in ("off", "0", "false", "disable")


def new_trace_id(flow_id: str = "flow") -> str:
    fid = "".join(c if c.isalnum() or c in "-_" else "-" for c in (flow_id or "flow"))[:24] or "flow"
    return f"{fid}-{uuid.uuid4().hex[:12]}"


def current_trace_id() -> str | None:
    return _TRACE_ID.get()


def begin_trace(trace_id: str) -> str:
    _TRACE_ID.set(trace_id)
    _EVENTS.set([])
    return trace_id


def truncate_text(text: str, limit: int) -> str:
    if text is None:
        return ""
    s = str(text)
    if len(s) <= limit:
        return s
    return s[: max(0, limit - 12)] + "\n[TRUNCATED]"


def truncate_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    if not payload:
        return {}
    out: dict[str, Any] = {}
    for k, v in payload.items():
        key = str(k)
        limit = _TRUNC.get(key, 2048 if key in ("inputs", "outputs", "config") else None)
        if limit is None:
            out[key] = v
            continue
        if isinstance(v, str):
            out[key] = truncate_text(v, limit)
        elif isinstance(v, (dict, list)):
            raw = json.dumps(v, ensure_ascii=False, default=str)
            out[key] = truncate_text(raw, limit) if len(raw) > limit else v
        else:
            out[key] = v
    return out


def record_event(
    *,
    node_id: str = "",
    node_type: str = "",
    event_type: str,
    duration_ms: float | None = None,
    payload: dict[str, Any] | None = None,
    flow_id: str = "",
    node_name: str = "",
    trace_id: str | None = None,
) -> TraceEvent | None:
    if not tracer_enabled():
        return None
    tid = trace_id or _TRACE_ID.get()
    if not tid:
        return None
    try:
        from fangyu.core.auth_gate import redact_mapping

        clean = redact_mapping(payload or {})
    except Exception:
        clean = payload or {}
    ev = TraceEvent(
        trace_id=tid,
        node_id=node_id or "",
        node_type=node_type or "",
        event_type=event_type,
        timestamp=time.time(),
        duration_ms=duration_ms,
        payload=truncate_payload(clean if isinstance(clean, dict) else {"value": clean}),
        flow_id=flow_id or "",
        node_name=node_name or "",
    )
    buf = _EVENTS.get()
    if buf is None:
        buf = []
        _EVENTS.set(buf)
    buf.append(ev)
    return ev


def drain_events() -> list[TraceEvent]:
    buf = _EVENTS.get() or []
    _EVENTS.set([])
    return list(buf)


def events_as_dicts(events: list[TraceEvent] | None = None) -> list[dict[str, Any]]:
    rows = events if events is not None else (_EVENTS.get() or [])
    return [asdict(e) for e in rows]


async def persist_events(db, events: list[TraceEvent], *, flow_id: str = "") -> int:
    """写入 execution_traces；失败返回 0。"""
    if not events:
        return 0
    try:
        from fangyu.models.trace_log import TraceLog

        n = 0
        for ev in events:
            db.add(
                TraceLog(
                    trace_id=ev.trace_id,
                    flow_id=ev.flow_id or flow_id or "",
                    node_id=ev.node_id,
                    node_name=ev.node_name,
                    node_type=ev.node_type,
                    event_type=ev.event_type,
                    timestamp=ev.timestamp,
                    duration_ms=ev.duration_ms,
                    payload_json=json.dumps(ev.payload, ensure_ascii=False, default=str),
                )
            )
            n += 1
        await db.flush()
        return n
    except Exception:
        return 0
