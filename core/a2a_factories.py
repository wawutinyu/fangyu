"""跨厂工厂目录 — DATA_DIR/a2a_factories.json。"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from fangyu.core.config import DATA_DIR

_PATH = DATA_DIR / "a2a_factories.json"


def _path() -> Path:
    return Path(DATA_DIR) / "a2a_factories.json"


def load_factories() -> list[dict[str, Any]]:
    path = _path()
    if not path.is_file():
        return []
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    rows = doc.get("factories") if isinstance(doc, dict) else doc
    return [r for r in (rows or []) if isinstance(r, dict)]


def save_factories(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"version": 1, "factories": rows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return rows


def upsert_factory(
    *,
    base_url: str,
    label: str = "",
    rpc_url: str = "",
    card_name: str = "",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    from fangyu.core.a2a_discovery import normalize_factory_base, normalize_rpc_url

    base = normalize_factory_base(base_url)
    rpc = rpc_url.strip() or normalize_rpc_url(base)
    rows = load_factories()
    now = time.time()
    for row in rows:
        if row.get("base_url") == base:
            row["label"] = label or row.get("label") or base
            row["rpc_url"] = rpc
            if card_name:
                row["card_name"] = card_name
            if meta:
                row["meta"] = {**(row.get("meta") or {}), **meta}
            row["updated_at"] = now
            save_factories(rows)
            return row
    row = {
        "id": f"fac_{uuid.uuid4().hex[:10]}",
        "base_url": base,
        "rpc_url": rpc,
        "label": label or base,
        "card_name": card_name,
        "meta": meta or {},
        "created_at": now,
        "updated_at": now,
    }
    rows.append(row)
    save_factories(rows)
    return row


def remove_factory(factory_id: str) -> bool:
    fid = (factory_id or "").strip()
    rows = load_factories()
    nxt = [r for r in rows if r.get("id") != fid and r.get("base_url") != fid]
    if len(nxt) == len(rows):
        return False
    save_factories(nxt)
    return True


def heartbeat_factories(
    *,
    factory_ids: list[str] | None = None,
    sync_presence: bool = True,
    ttl_sec: float = 120.0,
) -> dict[str, Any]:
    """对通讯录批量探测：更新 online / last_heartbeat_at；可选同步到 Presence 主机。"""
    from fangyu.core.a2a_discovery import probe_factory

    want = {x.strip() for x in (factory_ids or []) if x and str(x).strip()}
    rows = load_factories()
    now = time.time()
    results: list[dict[str, Any]] = []
    online_n = 0

    for row in rows:
        fid = str(row.get("id") or "")
        base = str(row.get("base_url") or "")
        if want and fid not in want and base not in want:
            continue
        if not base:
            results.append({"id": fid, "ok": False, "error": "no base_url"})
            continue
        was_online = row.get("online")
        # 尚未探测过时 was_online 可能为 None
        probe: dict[str, Any] | None = None
        err = ""
        try:
            probe = probe_factory(base)
            ok = bool(probe.get("ok"))
        except Exception as exc:
            ok = False
            err = str(exc)
            probe = None

        row["online"] = ok
        row["last_heartbeat_at"] = now
        row["last_probe_ok"] = ok
        row["updated_at"] = now
        if probe and isinstance(probe.get("card"), dict) and probe["card"].get("name"):
            row["card_name"] = probe["card"]["name"]
        if probe and probe.get("rpc_url"):
            row["rpc_url"] = probe["rpc_url"]
        meta = dict(row.get("meta") or {})
        meta["last_heartbeat_error"] = err or None
        if ok:
            meta["consecutive_failures"] = 0
            meta.pop("offline_since", None)
            meta.pop("alert", None)
        else:
            fails = int(meta.get("consecutive_failures") or 0) + 1
            meta["consecutive_failures"] = fails
            if was_online is True or fails >= 1:
                meta.setdefault("offline_since", now)
                meta["alert"] = "offline"
        row["meta"] = meta
        if ok:
            online_n += 1

        if sync_presence:
            try:
                from fangyu.core.collaboration import emit_event
                from fangyu.core.remote_hosts import upsert_remote_host

                host_id = f"factory:{fid or base}"
                if ok:
                    host = upsert_remote_host(
                        host_id=host_id,
                        label=str(row.get("label") or row.get("card_name") or base),
                        base_url=base,
                        role="factory",
                        meta={"factory_id": fid, "source": "a2a_factories"},
                        ttl_sec=ttl_sec,
                    )
                    kind = "factory.online" if was_online is False else "host.heartbeat"
                    emit_event(
                        kind,
                        actor=f"host:{host['id']}",
                        message=f"工厂在线 {host.get('label')}",
                        detail={
                            "host_id": host["id"],
                            "base_url": base,
                            "role": "factory",
                            "factory_id": fid,
                        },
                    )
                else:
                    emit_event(
                        "factory.offline" if was_online is not False else "host.offline",
                        actor=f"host:{host_id}",
                        message=f"工厂离线 {row.get('label') or base}",
                        detail={
                            "host_id": host_id,
                            "base_url": base,
                            "factory_id": fid,
                            "transition": was_online is True,
                            "error": err or None,
                        },
                        severity="warn",
                    )
            except Exception:
                pass

        results.append({
            "id": fid,
            "base_url": base,
            "ok": ok,
            "online": ok,
            "error": err or None,
            "card_name": row.get("card_name"),
        })

    save_factories(rows)
    enriched = [enrich_factory_row(r, now=now, ttl_sec=ttl_sec) for r in rows]
    return {
        "ok": True,
        "ts": now,
        "total": len(results),
        "online": online_n,
        "offline": len(results) - online_n,
        "results": results,
        "factories": enriched,
    }


def _norm_base(url: str) -> str:
    from fangyu.core.a2a_discovery import normalize_factory_base

    try:
        return normalize_factory_base(url)
    except ValueError:
        return (url or "").rstrip("/")


def align_factories_and_presence(
    *,
    import_hosts: bool = True,
    export_factories: bool = True,
    probe: bool = False,
) -> dict[str, Any]:
    """Presence 主机 ↔ 工厂通讯录双向对齐。

    - import_hosts: 有 base_url 的远程主机写入通讯录
    - export_factories: 通讯录条目 upsert 到 Presence（role=factory）
    - probe: 对齐前先跑一轮批量心跳
    """
    from fangyu.core.remote_hosts import list_remote_hosts, upsert_remote_host

    hb = None
    if probe:
        hb = heartbeat_factories(sync_presence=False)

    imported: list[dict[str, Any]] = []
    exported: list[dict[str, Any]] = []
    now = time.time()

    if import_hosts:
        known = {_norm_base(str(r.get("base_url") or "")) for r in load_factories()}
        known.discard("")
        for h in list_remote_hosts():
            base = _norm_base(str(h.get("base_url") or ""))
            if not base or base in known:
                continue
            # 本机托管/无 URL 跳过；仅导入可发现的对端
            row = upsert_factory(
                base_url=base,
                label=str(h.get("label") or h.get("name") or base),
                meta={
                    "source": "presence_host",
                    "host_id": h.get("id"),
                    "role": h.get("role"),
                    "imported_at": now,
                },
            )
            known.add(base)
            imported.append({"factory_id": row.get("id"), "base_url": base, "host_id": h.get("id")})

    if export_factories:
        for row in load_factories():
            fid = str(row.get("id") or "")
            base = str(row.get("base_url") or "")
            if not base:
                continue
            online = bool(row.get("online"))
            host_id = f"factory:{fid or base}"
            if online or row.get("last_probe_ok"):
                host = upsert_remote_host(
                    host_id=host_id,
                    label=str(row.get("label") or row.get("card_name") or base),
                    base_url=base,
                    role="factory",
                    meta={"factory_id": fid, "source": "a2a_factories_align"},
                    ttl_sec=120.0,
                )
                exported.append({
                    "factory_id": fid,
                    "host_id": host.get("id"),
                    "base_url": base,
                    "online": True,
                })
            else:
                # 离线：仍登记短 TTL，便于值班墙看到「曾在通讯录」
                host = upsert_remote_host(
                    host_id=host_id,
                    label=str(row.get("label") or row.get("card_name") or base),
                    base_url=base,
                    role="factory",
                    meta={
                        "factory_id": fid,
                        "source": "a2a_factories_align",
                        "online": False,
                    },
                    ttl_sec=30.0,
                )
                # 标记离线
                from fangyu.core.remote_hosts import mark_host_offline

                mark_host_offline(host_id)
                exported.append({
                    "factory_id": fid,
                    "host_id": host.get("id"),
                    "base_url": base,
                    "online": False,
                })

    return {
        "ok": True,
        "ts": now,
        "imported": len(imported),
        "exported": len(exported),
        "import_details": imported,
        "export_details": exported,
        "heartbeat": hb,
        "factories": list_factories_enriched(),
    }


def compute_factory_health(
    row: dict[str, Any],
    *,
    now: float | None = None,
    ttl_sec: float = 120.0,
) -> dict[str, Any]:
    """计算工厂健康分 0–100。

    构成：在线 40 · 心跳新鲜 30 · 最近探测 20 · 连续失败惩罚最多 10。
    """
    ts = float(now if now is not None else time.time())
    ttl = max(15.0, float(ttl_sec or 120.0))
    meta = row.get("meta") if isinstance(row.get("meta"), dict) else {}
    online = row.get("online")
    last_hb = row.get("last_heartbeat_at")
    probe_ok = row.get("last_probe_ok")
    fails = int(meta.get("consecutive_failures") or 0)

    factors: dict[str, Any] = {}
    score = 0

    if online is True:
        score += 40
        factors["online"] = 40
    elif online is False:
        factors["online"] = 0
    else:
        # 从未探测：给中性基线，避免全 0 误导
        score += 20
        factors["online"] = 20

    if last_hb:
        age = max(0.0, ts - float(last_hb))
        freshness = max(0.0, 30.0 * (1.0 - min(1.0, age / ttl)))
        score += freshness
        factors["freshness"] = round(freshness, 1)
        factors["heartbeat_age_sec"] = round(age, 1)
    else:
        factors["freshness"] = 0

    if probe_ok is True:
        score += 20
        factors["probe"] = 20
    elif probe_ok is False:
        factors["probe"] = 0
    else:
        score += 10
        factors["probe"] = 10

    penalty = min(10, fails * 2)
    score -= penalty
    factors["fail_penalty"] = -penalty
    factors["consecutive_failures"] = fails

    score = int(max(0, min(100, round(score))))
    if score >= 80:
        grade = "A"
    elif score >= 60:
        grade = "B"
    elif score >= 40:
        grade = "C"
    else:
        grade = "D"
    return {
        "score": score,
        "grade": grade,
        "factors": factors,
        "ttl_sec": ttl,
    }


def enrich_factory_row(
    row: dict[str, Any],
    *,
    now: float | None = None,
    ttl_sec: float = 120.0,
) -> dict[str, Any]:
    out = dict(row)
    out["health"] = compute_factory_health(out, now=now, ttl_sec=ttl_sec)
    return out


def list_factories_enriched(*, ttl_sec: float = 120.0) -> list[dict[str, Any]]:
    now = time.time()
    return [enrich_factory_row(r, now=now, ttl_sec=ttl_sec) for r in load_factories()]
