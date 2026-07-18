"""观测告警 — 工厂离线等。"""
from __future__ import annotations

import time
from typing import Any


def collect_monitor_alerts(*, limit: int = 40) -> dict[str, Any]:
    """汇总当前离线工厂 + 近期 factory/host 离线事件。"""
    from fangyu.core.a2a_factories import load_factories
    from fangyu.core.collaboration import list_events

    now = time.time()
    offline_factories: list[dict[str, Any]] = []
    for row in load_factories():
        online = row.get("online")
        if online is False or (row.get("meta") or {}).get("alert") == "offline":
            offline_factories.append({
                "id": f"fac-offline-{row.get('id')}",
                "kind": "factory.offline",
                "severity": "warn",
                "title": f"工厂离线 · {row.get('label') or row.get('card_name') or row.get('id')}",
                "message": str((row.get("meta") or {}).get("last_heartbeat_error") or "探测失败或不可达"),
                "ts": float(row.get("last_heartbeat_at") or row.get("updated_at") or now),
                "factory_id": row.get("id"),
                "base_url": row.get("base_url"),
                "source": "a2a_factories",
            })

    events = list_events(limit=max(limit * 2, 80))
    event_alerts: list[dict[str, Any]] = []
    for ev in events:
        kind = str(ev.get("kind") or "")
        sev = str(ev.get("severity") or "info")
        if kind in ("factory.offline", "host.offline") or (
            sev in ("warn", "error", "deny") and kind.startswith(("factory.", "host."))
        ):
            event_alerts.append({
                "id": f"ev-{ev.get('id')}",
                "kind": kind,
                "severity": sev,
                "title": kind,
                "message": str(ev.get("message") or ""),
                "ts": float(ev.get("ts") or 0),
                "actor": ev.get("actor"),
                "detail": ev.get("detail") or {},
                "source": "collaboration",
            })

    # 合并：当前态优先，事件去重（同 factory_id 近窗）
    seen_fac: set[str] = set()
    merged: list[dict[str, Any]] = []
    for a in offline_factories:
        fid = str(a.get("factory_id") or "")
        if fid:
            seen_fac.add(fid)
        merged.append(a)
    for a in event_alerts:
        fid = str((a.get("detail") or {}).get("factory_id") or "")
        if fid and fid in seen_fac and a.get("kind") in ("factory.offline", "host.offline"):
            continue
        merged.append(a)

    merged.sort(key=lambda x: float(x.get("ts") or 0), reverse=True)
    merged = merged[: max(1, min(limit, 100))]
    return {
        "ok": True,
        "ts": now,
        "count": len(merged),
        "offline_factories": len(offline_factories),
        "alerts": merged,
    }
