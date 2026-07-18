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
                    emit_event(
                        "host.heartbeat",
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
                        "host.offline",
                        actor=f"host:{host_id}",
                        message=f"工厂离线 {row.get('label') or base}",
                        detail={"host_id": host_id, "base_url": base, "factory_id": fid},
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
    return {
        "ok": True,
        "ts": now,
        "total": len(results),
        "online": online_n,
        "offline": len(results) - online_n,
        "results": results,
        "factories": rows,
    }
