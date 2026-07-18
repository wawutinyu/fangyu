"""观测告警 — 工厂离线 · Eval 失败等。"""
from __future__ import annotations

import time
from typing import Any


def collect_monitor_alerts(*, limit: int = 40) -> dict[str, Any]:
    """汇总当前离线工厂 + Eval 失败 + 近期 factory/host/eval 事件。"""
    from fangyu.core.a2a_factories import load_factories
    from fangyu.core.collaboration import list_events
    from fangyu.core.factory_eval import load_eval_report

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

    eval_alerts: list[dict[str, Any]] = []
    report = load_eval_report()
    if report and report.get("ok") is False:
        stages = report.get("stages") if isinstance(report.get("stages"), dict) else {}
        failed = [
            name
            for name, st in stages.items()
            if isinstance(st, dict) and not st.get("skipped") and st.get("ok") is False
        ]
        eval_alerts.append({
            "id": "eval-current-fail",
            "kind": "eval.fail",
            "severity": "error",
            "title": "出厂质检未过",
            "message": (
                f"exit={report.get('exit_code')} · "
                + (", ".join(failed[:6]) if failed else "见 Eval 报告")
            ),
            "ts": float(report.get("ts") or now),
            "detail": {
                "exit_code": report.get("exit_code"),
                "failed_stages": failed,
                "live_tier": report.get("live_tier"),
            },
            "source": "factory_eval",
        })

    events = list_events(limit=max(limit * 2, 80))
    event_alerts: list[dict[str, Any]] = []
    for ev in events:
        kind = str(ev.get("kind") or "")
        sev = str(ev.get("severity") or "info")
        if kind.startswith("eval.") or kind in ("factory.offline", "host.offline") or (
            sev in ("warn", "error", "deny") and kind.startswith(("factory.", "host.", "eval."))
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

    # 合并：当前态优先，事件去重
    seen_fac: set[str] = set()
    seen_eval = bool(eval_alerts)
    merged: list[dict[str, Any]] = []
    for a in offline_factories:
        fid = str(a.get("factory_id") or "")
        if fid:
            seen_fac.add(fid)
        merged.append(a)
    merged.extend(eval_alerts)
    for a in event_alerts:
        fid = str((a.get("detail") or {}).get("factory_id") or "")
        if fid and fid in seen_fac and a.get("kind") in ("factory.offline", "host.offline"):
            continue
        if seen_eval and str(a.get("kind") or "").startswith("eval."):
            continue
        merged.append(a)

    merged.sort(key=lambda x: float(x.get("ts") or 0), reverse=True)
    merged = merged[: max(1, min(limit, 100))]
    return {
        "ok": True,
        "ts": now,
        "count": len(merged),
        "offline_factories": len(offline_factories),
        "eval_fail": len(eval_alerts),
        "alerts": merged,
    }
