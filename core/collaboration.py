"""方隅·观 — 协作 Presence 与事件时间线。

内存环缓冲 + SQLite 持久化（FANGYU_COLLAB_DB / data/collaboration.db）。
"""
from __future__ import annotations

import threading
import time
import uuid
from collections import deque
from queue import Empty, Full, Queue
from typing import Any

_MAX_EVENTS = 800
_lock = threading.RLock()
_events: deque[dict[str, Any]] = deque(maxlen=_MAX_EVENTS)
_persist_ready = False
_subscribers: list = []


def _ensure_persist() -> None:
    global _persist_ready
    if _persist_ready:
        return
    try:
        from .collaboration_store import get_connection
        get_connection()
        _persist_ready = True
    except Exception:
        pass


def reset_collaboration() -> None:
    """测试用：清空内存与持久化事件。"""
    global _persist_ready
    with _lock:
        _events.clear()
        _subscribers.clear()
    try:
        from .collaboration_store import clear_events, close_connection
        clear_events()
        close_connection()
    except Exception:
        pass
    _persist_ready = False


def subscribe_events(maxsize: int = 200) -> Queue:
    """订阅实时事件（SSE / 推送用）。"""
    q: Queue = Queue(maxsize=maxsize)
    with _lock:
        _subscribers.append(q)
    return q


def unsubscribe_events(q: Queue) -> None:
    with _lock:
        if q in _subscribers:
            _subscribers.remove(q)


def _broadcast(entry: dict[str, Any]) -> None:
    with _lock:
        subs = list(_subscribers)
    for q in subs:
        try:
            q.put_nowait(entry)
        except Full:
            try:
                q.get_nowait()
            except Empty:
                pass
            try:
                q.put_nowait(entry)
            except Full:
                pass


def emit_event(
    kind: str,
    *,
    actor: str = "",
    target: str | None = None,
    message: str = "",
    detail: dict[str, Any] | None = None,
    severity: str = "info",
) -> dict[str, Any]:
    """写入一条 CollaborationEvent，返回事件对象。"""
    entry = {
        "id": uuid.uuid4().hex[:12],
        "ts": time.time(),
        "kind": kind,
        "actor": actor or "",
        "target": target,
        "message": message or "",
        "detail": detail or {},
        "severity": severity if severity in ("info", "warn", "deny", "error") else "info",
    }
    with _lock:
        _events.append(entry)
    _broadcast(entry)
    try:
        _ensure_persist()
        from .collaboration_store import insert_event
        insert_event(entry)
    except Exception:
        pass
    return entry


def list_events(*, limit: int = 100, kinds: list[str] | None = None) -> list[dict[str, Any]]:
    limit = max(1, min(limit, _MAX_EVENTS))
    try:
        _ensure_persist()
        from .collaboration_store import query_events
        persisted = query_events(limit=limit, kinds=kinds)
        if persisted:
            return persisted
    except Exception:
        pass

    with _lock:
        items = list(_events)
    if kinds:
        kind_set = set(kinds)
        items = [e for e in items if e.get("kind") in kind_set]
    items.sort(key=lambda e: e.get("ts", 0), reverse=True)
    return items[:limit]


def build_edges(events: list[dict[str, Any]] | None = None, *, limit: int = 40) -> list[dict[str, Any]]:
    """从事件推导协作边 actor → target。"""
    items = events if events is not None else list_events(limit=200)
    agg: dict[tuple[str, str], dict[str, Any]] = {}
    for e in items:
        actor = (e.get("actor") or "").strip()
        target = e.get("target")
        if not actor or not target or str(target).strip() == "":
            continue
        target_s = str(target).strip()
        if actor == target_s:
            continue
        key = (actor, target_s)
        cur = agg.get(key)
        ts = float(e.get("ts") or 0)
        if not cur:
            agg[key] = {
                "source": actor,
                "target": target_s,
                "count": 1,
                "last_kind": e.get("kind"),
                "last_ts": ts,
                "last_severity": e.get("severity") or "info",
            }
        else:
            cur["count"] += 1
            if ts >= float(cur.get("last_ts") or 0):
                cur["last_kind"] = e.get("kind")
                cur["last_ts"] = ts
                cur["last_severity"] = e.get("severity") or "info"
    edges = sorted(agg.values(), key=lambda x: (x.get("last_ts") or 0, x.get("count") or 0), reverse=True)
    return edges[: max(1, min(limit, 200))]


def _agent_busy_map() -> dict[str, dict[str, Any]]:
    """从 A2A 任务推导 agent 忙闲。"""
    busy: dict[str, dict[str, Any]] = {}
    try:
        from fangyu.engine.a2a_runtime import AgentBus

        for task in AgentBus().list_tasks():
            meta = task.get("metadata") or {}
            name = meta.get("target_agent") or ""
            if not name:
                continue
            state = (task.get("status") or {}).get("state") or ""
            updated = (task.get("status") or {}).get("updatedAt") or 0
            skill = ""
            hist = task.get("history") or []
            if hist:
                skill = ((hist[0].get("metadata") or {}).get("skill_id")) or ""
            prev = busy.get(name)
            if state == "working":
                busy[name] = {
                    "status": "busy",
                    "current_skill": skill,
                    "task_id": task.get("id"),
                    "updated_at": updated,
                }
            elif not prev or (updated >= (prev.get("updated_at") or 0) and prev.get("status") != "busy"):
                if state == "failed":
                    st = "error"
                else:
                    st = "idle"
                busy[name] = {
                    "status": st,
                    "current_skill": skill,
                    "task_id": task.get("id"),
                    "updated_at": updated,
                }
    except Exception:
        pass
    return busy


def build_presence() -> list[dict[str, Any]]:
    """聚合 Agent + Worker Presence 快照。"""
    now = time.time()
    entities: list[dict[str, Any]] = []
    busy_map = _agent_busy_map()

    try:
        from fangyu.engine.a2a_runtime import AgentRegistry

        for ag in AgentRegistry.list_agents():
            name = ag.get("name") or ""
            card = ag.get("card") or {}
            busy = busy_map.get(name) or {}
            status = busy.get("status") or ("idle" if not ag.get("external") or ag.get("authorized") else "offline")
            if ag.get("external") and not ag.get("authorized"):
                status = "unauthorized"
            entities.append({
                "id": f"agent:{name}",
                "kind": "agent",
                "name": name,
                "label": card.get("name") or name,
                "status": status,
                "online": status not in ("offline", "unauthorized"),
                "external": bool(ag.get("external")),
                "authorized": bool(ag.get("authorized", True)),
                "current_skill": busy.get("current_skill") or None,
                "task_id": busy.get("task_id"),
                "rpc_url": ag.get("rpc_url"),
                "updated_at": busy.get("updated_at") or now,
            })
    except Exception:
        pass

    try:
        from fangyu.core.worker_registry import list_workers, list_tasks

        running_by_worker: dict[str, dict] = {}
        for t in list_tasks(limit=80):
            if t.get("status") == "running" and t.get("worker_id"):
                running_by_worker[t["worker_id"]] = t

        for w in list_workers():
            wid = w.get("id") or ""
            running = running_by_worker.get(wid)
            if not w.get("online"):
                status = "offline"
            elif running:
                status = "busy"
            else:
                status = "idle"
            entities.append({
                "id": f"worker:{wid}",
                "kind": "worker",
                "name": w.get("name") or wid,
                "label": w.get("name") or wid,
                "status": status,
                "online": bool(w.get("online")),
                "external": False,
                "authorized": True,
                "current_skill": (running or {}).get("type"),
                "task_id": (running or {}).get("id"),
                "hostname": w.get("hostname"),
                "os": w.get("os"),
                "updated_at": w.get("last_seen") or now,
            })
    except Exception:
        pass

    entities.sort(key=lambda e: (0 if e.get("online") else 1, e.get("kind", ""), e.get("name", "")))
    return entities


def snapshot(*, event_limit: int = 80) -> dict[str, Any]:
    """观门面一次拉取：presence + 事件 + 协作边。"""
    presence = build_presence()
    events = list_events(limit=event_limit)
    edges = build_edges(events, limit=40)
    agents = [p for p in presence if p.get("kind") == "agent"]
    workers = [p for p in presence if p.get("kind") == "worker"]
    return {
        "presence": presence,
        "events": events,
        "edges": edges,
        "summary": {
            "agents": len(agents),
            "agents_busy": sum(1 for a in agents if a.get("status") == "busy"),
            "workers": len(workers),
            "workers_online": sum(1 for w in workers if w.get("online")),
            "events": len(events),
            "edges": len(edges),
        },
        "ts": time.time(),
    }


_AUDIT_FANOUT = {
    "constitution_violation": ("constitution.deny", "deny"),
    "constitution_warning": ("constitution.warn", "warn"),
    "trust_violation": ("trust.deny", "deny"),
    "worker_shell_blocked": ("worker.shell_blocked", "deny"),
    "agent_action": ("agent.action", "info"),
    "constitution_updated": ("constitution.updated", "info"),
}


def fanout_audit(event_type: str, details: dict | None = None) -> None:
    mapped = _AUDIT_FANOUT.get(event_type)
    if not mapped:
        return
    kind, severity = mapped
    details = details or {}
    actor = str(details.get("agent") or details.get("worker_id") or details.get("context") or "system")
    emit_event(
        kind,
        actor=actor,
        target=details.get("target"),
        message=str(details.get("message") or details.get("error") or event_type),
        detail=details,
        severity=severity,
    )
