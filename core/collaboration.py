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
    clear_demo_cast()
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


def _factory_index_by_base() -> dict[str, dict[str, Any]]:
    from fangyu.core.a2a_factories import _norm_base, load_factories

    out: dict[str, dict[str, Any]] = {}
    for row in load_factories():
        base = _norm_base(str(row.get("base_url") or ""))
        if base:
            out[base] = row
    return out


def _resolve_host_health(
    h: dict[str, Any],
    factory_by_base: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """从 remote_host.meta.health 或通讯录匹配解析工厂健康分（含 factors / history）。"""
    meta = h.get("meta") or {}
    raw = meta.get("health")
    if isinstance(raw, dict) and raw.get("score") is not None:
        try:
            out: dict[str, Any] = {
                "score": int(raw["score"]),
                "grade": raw.get("grade"),
            }
            if isinstance(raw.get("factors"), dict):
                out["factors"] = raw["factors"]
            hist = raw.get("history") or meta.get("health_history")
            if isinstance(hist, list) and hist:
                out["history"] = hist[-12:]
            return out
        except (TypeError, ValueError):
            pass
    if h.get("role") != "factory" and not meta.get("factory_id"):
        return None
    if factory_by_base is None:
        return None
    from fangyu.core.a2a_factories import _norm_base, compute_factory_health

    base = _norm_base(str(h.get("base_url") or ""))
    row = factory_by_base.get(base) if base else None
    if not row:
        fid = str(meta.get("factory_id") or "")
        if fid:
            for r in factory_by_base.values():
                if str(r.get("id") or "") == fid:
                    row = r
                    break
    if not row:
        return None
    hth = compute_factory_health(row)
    out = {
        "score": hth["score"],
        "grade": hth.get("grade"),
        "factors": hth.get("factors"),
    }
    hist = (row.get("meta") or {}).get("health_history") if isinstance(row.get("meta"), dict) else None
    if isinstance(hist, list) and hist:
        out["history"] = hist[-12:]
    return out


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
            meta = card.get("metadata") or {}
            department = meta.get("department") or None
            department_id = meta.get("department_id") or None
            if isinstance(department, str):
                department = department.strip() or None
            if isinstance(department_id, str):
                department_id = department_id.strip() or None
            if department and not department_id:
                department_id = f"dept-{department}"
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
                "department": department,
                "department_id": department_id,
                "canvas_id": meta.get("canvas_id") or name,
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

    # 本机托管 Bundle 实例
    try:
        from fangyu.engine.managed_host import list_instances

        for inst in list_instances():
            iid = inst.get("id") or ""
            alive = bool(inst.get("alive"))
            entities.append({
                "id": f"managed:{iid}",
                "kind": "managed",
                "name": inst.get("name") or iid,
                "label": inst.get("name") or iid,
                "status": "online" if alive else "offline",
                "online": alive,
                "external": False,
                "authorized": True,
                "current_skill": None,
                "task_id": None,
                "host": inst.get("host"),
                "port": inst.get("port"),
                "health_url": f"http://{inst.get('host')}:{inst.get('port')}/health" if inst.get("port") else None,
                "bundle_dir": inst.get("bundle_dir"),
                "updated_at": inst.get("started_at") or now,
                "department": "托管",
                "department_id": "dept-managed",
            })
    except Exception:
        pass

    # 跨机心跳主机（工厂角色附带健康分，供值班墙着色）
    try:
        from fangyu.core.remote_hosts import list_remote_hosts

        factory_by_base: dict[str, dict[str, Any]] | None = None
        for h in list_remote_hosts():
            ent: dict[str, Any] = {
                "id": f"host:{h.get('id')}",
                "kind": "host",
                "name": h.get("name") or h.get("id"),
                "label": h.get("label") or h.get("name") or h.get("id"),
                "status": h.get("status") or "online",
                "online": bool(h.get("online")),
                "external": True,
                "authorized": True,
                "base_url": h.get("base_url"),
                "role": h.get("role"),
                "updated_at": h.get("last_seen") or now,
                "department": "跨机",
                "department_id": "dept-hosts",
            }
            health = _resolve_host_health(h, None)
            if health is None and (
                h.get("role") == "factory" or (h.get("meta") or {}).get("factory_id")
            ):
                if factory_by_base is None:
                    factory_by_base = _factory_index_by_base()
                health = _resolve_host_health(h, factory_by_base)
            if health:
                ent["health"] = health
            entities.append(ent)
    except Exception:
        pass

    # 演示剧本注入的同行者（TTL）
    if now < _demo_until and _demo_cast:
        seen = {e.get("id") for e in entities}
        for d in _demo_cast:
            if d.get("id") not in seen:
                entities.append({**d, "updated_at": now})

    entities.sort(key=lambda e: (0 if e.get("online") else 1, e.get("kind", ""), e.get("name", "")))
    return entities


_demo_cast: list[dict[str, Any]] = []
_demo_until: float = 0.0
_demo_departments: list[dict[str, Any]] = []

_MAX_MEMBERS_PER_HOUSE = 3
_HOUSE_ANNEX = ("", "·东厢", "·西厢", "·北厢", "·南厢")


def clear_demo_cast() -> None:
    global _demo_cast, _demo_until, _demo_departments
    with _lock:
        _demo_cast = []
        _demo_until = 0.0
        _demo_departments = []


def build_departments(presence: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """从 Presence 推导部门；大部门拆成多宅（每宅最多 3 人）。"""
    global _demo_departments
    with _lock:
        explicit = list(_demo_departments) if _demo_departments else []
    if explicit:
        return explicit

    items = presence if presence is not None else build_presence()
    buckets: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for p in items:
        did = (p.get("department_id") or "").strip()
        dlabel = (p.get("department") or "").strip()
        if not did and not dlabel:
            continue
        if not did:
            did = f"dept-{dlabel}"
        if not dlabel:
            dlabel = did
        if did not in buckets:
            buckets[did] = {"id": did, "label": dlabel, "members": []}
            order.append(did)
        buckets[did]["members"].append(p)

    out: list[dict[str, Any]] = []
    for did in order:
        b = buckets[did]
        members: list[dict[str, Any]] = b["members"]
        houses: list[dict[str, Any]] = []
        for i in range(0, len(members), _MAX_MEMBERS_PER_HOUSE):
            chunk = members[i : i + _MAX_MEMBERS_PER_HOUSE]
            annex_i = i // _MAX_MEMBERS_PER_HOUSE
            suffix = _HOUSE_ANNEX[annex_i] if annex_i < len(_HOUSE_ANNEX) else f"·{annex_i + 1}"
            if annex_i == 0:
                h_label = b["label"]
                h_id = f"house-{did}"
            else:
                h_label = f"{b['label']}{suffix}"
                h_id = f"house-{did}-{annex_i}"
            houses.append({
                "id": h_id,
                "label": h_label,
                "member_ids": [m["id"] for m in chunk],
            })
        out.append({"id": b["id"], "label": b["label"], "houses": houses})
    return out


def run_presence_demo(*, ttl_sec: float = 180.0) -> dict[str, Any]:
    """一键演示剧本：多部门多宅同行者 + 协作事件。"""
    global _demo_cast, _demo_until, _demo_departments
    now = time.time()

    def _agent(
        name: str,
        *,
        status: str = "idle",
        skill: str | None = None,
        task_id: str | None = None,
        department: str,
        department_id: str,
    ) -> dict[str, Any]:
        return {
            "id": f"agent:{name}",
            "kind": "agent",
            "name": name,
            "label": name,
            "status": status,
            "online": True,
            "external": False,
            "authorized": True,
            "current_skill": skill,
            "task_id": task_id,
            "department": department,
            "department_id": department_id,
        }

    def _worker(
        name: str,
        label: str,
        *,
        department: str,
        department_id: str,
        status: str = "idle",
    ) -> dict[str, Any]:
        return {
            "id": f"worker:{name}",
            "kind": "worker",
            "name": name,
            "label": label,
            "status": status,
            "online": True,
            "external": False,
            "authorized": True,
            "current_skill": None,
            "hostname": "demo-host",
            "os": "darwin",
            "department": department,
            "department_id": department_id,
        }

    cast = [
        # 感知部（1 宅）
        _agent("检索", status="busy", skill="search", task_id="demo-search-1",
               department="感知部", department_id="dept-sense"),
        _agent("巡查", status="idle", department="感知部", department_id="dept-sense"),
        # 研判部（4 人 → 正宅 + 东厢）
        _agent("分析", status="busy", skill="analyze", task_id="demo-analyze-1",
               department="研判部", department_id="dept-judge"),
        _agent("汇总", status="idle", department="研判部", department_id="dept-judge"),
        _agent("校对", status="idle", department="研判部", department_id="dept-judge"),
        _agent("归档", status="idle", department="研判部", department_id="dept-judge"),
        # 行署（1 宅）
        _worker("demo-行", "演示行", department="行署", department_id="dept-ops"),
        _worker("demo-备援", "备援行", department="行署", department_id="dept-ops"),
    ]

    # 显式多宅：研判拆两栋，便于演示「部门 ↔ 多宅」
    departments = [
        {
            "id": "dept-sense",
            "label": "感知部",
            "houses": [{
                "id": "house-sense",
                "label": "感知宅",
                "member_ids": ["agent:检索", "agent:巡查"],
            }],
        },
        {
            "id": "dept-judge",
            "label": "研判部",
            "houses": [
                {
                    "id": "house-judge",
                    "label": "研判宅",
                    "member_ids": ["agent:分析", "agent:汇总", "agent:校对"],
                },
                {
                    "id": "house-judge-east",
                    "label": "研判·东厢",
                    "member_ids": ["agent:归档"],
                },
            ],
        },
        {
            "id": "dept-ops",
            "label": "行署",
            "houses": [{
                "id": "house-ops",
                "label": "行署",
                "member_ids": ["worker:demo-行", "worker:demo-备援"],
            }],
        },
    ]

    with _lock:
        _demo_cast = cast
        _demo_departments = departments
        _demo_until = now + max(30.0, float(ttl_sec))

    script = [
        ("a2a.send", "检索", "分析", "把检索到的材料交给分析", "info"),
        ("a2a.started", "分析", "检索", "分析已接单，正在整理要点", "info"),
        ("a2a.send", "分析", "汇总", "要点已出，请汇总成答复", "info"),
        ("a2a.started", "汇总", "分析", "汇总开始起草", "info"),
        ("a2a.send", "汇总", "校对", "请校对口径后再交行", "info"),
        ("worker.enqueued", "汇总", "demo-行", "请行侧执行一次本地校验", "info"),
        ("worker.started", "demo-行", "汇总", "行已开工校验", "info"),
        ("constitution.warn", "汇总", None, "输出偏长：律提醒截断展示（非拒绝）", "warn"),
        ("a2a.complete", "汇总", "分析", "汇总完成，已交回共场", "info"),
        ("worker.complete", "demo-行", "汇总", "校验通过", "info"),
        ("a2a.send", "校对", "归档", "定稿请归档入东厢", "info"),
    ]
    events = []
    for kind, actor, target, message, severity in script:
        events.append(
            emit_event(
                kind,
                actor=actor,
                target=target,
                message=message,
                detail={"demo": True, "script": "presence_demo"},
                severity=severity,
            )
        )
        time.sleep(0.02)

    with _lock:
        for d in _demo_cast:
            if d.get("name") == "检索":
                d["status"] = "idle"
                d["current_skill"] = None
                d["task_id"] = None
            elif d.get("name") == "汇总":
                d["status"] = "busy"
                d["current_skill"] = "summarize"
                d["task_id"] = "demo-sum-1"
            elif d.get("name") == "demo-行":
                d["status"] = "busy"
                d["current_skill"] = "verify"
            elif d.get("name") == "归档":
                d["status"] = "busy"
                d["current_skill"] = "archive"

    return {
        "ok": True,
        "cast": len(cast),
        "events": len(events),
        "departments": len(departments),
        "houses": sum(len(d["houses"]) for d in departments),
        "until": _demo_until,
        "snapshot": snapshot(event_limit=40),
    }


def snapshot(*, event_limit: int = 80) -> dict[str, Any]:
    """观门面一次拉取：presence + 事件 + 协作边 + 部门宅。"""
    presence = build_presence()
    events = list_events(limit=event_limit)
    edges = build_edges(events, limit=40)
    departments = build_departments(presence)
    agents = [p for p in presence if p.get("kind") == "agent"]
    workers = [p for p in presence if p.get("kind") == "worker"]
    managed = [p for p in presence if p.get("kind") == "managed"]
    hosts = [p for p in presence if p.get("kind") == "host"]
    return {
        "presence": presence,
        "events": events,
        "edges": edges,
        "departments": departments,
        "summary": {
            "agents": len(agents),
            "agents_busy": sum(1 for a in agents if a.get("status") == "busy"),
            "workers": len(workers),
            "workers_online": sum(1 for w in workers if w.get("online")),
            "managed": len(managed),
            "managed_online": sum(1 for m in managed if m.get("online")),
            "hosts": len(hosts),
            "hosts_online": sum(1 for h in hosts if h.get("online")),
            "events": len(events),
            "edges": len(edges),
            "departments": len(departments),
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


def validate_replay_pack(raw: Any) -> dict[str, Any]:
    """校验导入/存库的回放包，返回规范化 dict；失败抛 ValueError。"""
    if not isinstance(raw, dict):
        raise ValueError("回放包必须是 JSON 对象")
    fmt = raw.get("format")
    if fmt != "fangyu.guan.replay":
        raise ValueError("format 必须是 fangyu.guan.replay")
    events = raw.get("events")
    if not isinstance(events, list):
        raise ValueError("events 必须是数组")
    presence = raw.get("presence") if isinstance(raw.get("presence"), list) else []
    departments = raw.get("departments") if isinstance(raw.get("departments"), list) else []
    summary = raw.get("summary") if isinstance(raw.get("summary"), dict) else {}
    cleaned_events: list[dict[str, Any]] = []
    for i, ev in enumerate(events):
        if not isinstance(ev, dict):
            raise ValueError(f"events[{i}] 无效")
        kind = str(ev.get("kind") or "").strip()
        if not kind:
            raise ValueError(f"events[{i}] 缺少 kind")
        entry = {
            "id": str(ev.get("id") or f"import-{i}"),
            "ts": float(ev.get("ts") or 0),
            "kind": kind,
            "actor": str(ev.get("actor") or ""),
            "target": ev.get("target"),
            "message": str(ev.get("message") or ""),
            "detail": ev.get("detail") if isinstance(ev.get("detail"), dict) else {},
            "severity": str(ev.get("severity") or "info"),
        }
        if isinstance(ev.get("explain"), dict):
            entry["explain"] = ev["explain"]
        cleaned_events.append(entry)
    return {
        "format": "fangyu.guan.replay",
        "version": int(raw.get("version") or 1),
        "exported_at": str(raw.get("exported_at") or ""),
        "summary": summary,
        "departments": departments,
        "presence": presence,
        "events": cleaned_events,
    }


def pack_to_snapshot(pack: dict[str, Any]) -> dict[str, Any]:
    """回放包 → 观门面 snapshot（供前端加载归档）。"""
    events = list(pack.get("events") or [])
    plain_events: list[dict[str, Any]] = []
    for e in events:
        if not isinstance(e, dict):
            continue
        plain_events.append({
            "id": e.get("id"),
            "ts": e.get("ts"),
            "kind": e.get("kind"),
            "actor": e.get("actor") or "",
            "target": e.get("target"),
            "message": e.get("message") or "",
            "detail": e.get("detail") or {},
            "severity": e.get("severity") or "info",
        })
    # 包内多为升序；快照约定最新在前
    plain_events_asc = sorted(plain_events, key=lambda x: float(x.get("ts") or 0))
    plain_events_desc = list(reversed(plain_events_asc))
    edges = build_edges(plain_events_asc, limit=40)
    presence_in = pack.get("presence") or []
    presence: list[dict[str, Any]] = []
    for p in presence_in:
        if not isinstance(p, dict):
            continue
        presence.append({
            "id": p.get("id") or f"agent:{p.get('name')}",
            "kind": p.get("kind") or "agent",
            "name": p.get("name") or "",
            "label": p.get("label") or p.get("name") or "",
            "status": p.get("status") or "idle",
            "online": bool(p.get("online", True)),
            "department": p.get("department"),
            "department_id": p.get("department_id"),
            "current_skill": p.get("current_skill"),
            "task_id": p.get("task_id"),
        })
    departments = pack.get("departments") or []
    summary = pack.get("summary") if isinstance(pack.get("summary"), dict) else {}
    agents = [p for p in presence if p.get("kind") == "agent"]
    workers = [p for p in presence if p.get("kind") == "worker"]
    return {
        "presence": presence,
        "events": plain_events_desc,
        "edges": edges,
        "departments": departments,
        "summary": {
            "agents": summary.get("agents", len(agents)),
            "agents_busy": summary.get("agents_busy", sum(1 for a in agents if a.get("status") == "busy")),
            "workers": summary.get("workers", len(workers)),
            "workers_online": summary.get("workers_online", sum(1 for w in workers if w.get("online"))),
            "events": summary.get("events", len(plain_events_desc)),
            "edges": summary.get("edges", len(edges)),
            "departments": summary.get("departments", len(departments)),
        },
        "ts": time.time(),
        "archived": True,
        "archive_exported_at": pack.get("exported_at"),
    }
