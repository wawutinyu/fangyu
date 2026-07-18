"""跨机 Presence 主机心跳 — 无 session，TTL 过期即离线。"""
from __future__ import annotations

import threading
import time
import uuid
from typing import Any

_lock = threading.Lock()
_HOSTS: dict[str, dict[str, Any]] = {}
_DEFAULT_TTL = 90.0


def clear_remote_hosts() -> None:
    with _lock:
        _HOSTS.clear()


def upsert_remote_host(
    *,
    host_id: str | None = None,
    label: str = "",
    base_url: str = "",
    role: str = "studio",
    meta: dict[str, Any] | None = None,
    ttl_sec: float = _DEFAULT_TTL,
) -> dict[str, Any]:
    hid = (host_id or "").strip() or f"host_{uuid.uuid4().hex[:10]}"
    now = time.time()
    ttl = max(15.0, float(ttl_sec or _DEFAULT_TTL))
    with _lock:
        prev = _HOSTS.get(hid) or {}
        item = {
            "id": hid,
            "kind": "host",
            "name": (label or prev.get("name") or hid).strip() or hid,
            "label": (label or prev.get("label") or hid).strip() or hid,
            "base_url": (base_url or prev.get("base_url") or "").rstrip("/"),
            "role": role or prev.get("role") or "studio",
            "meta": {**(prev.get("meta") or {}), **(meta or {})},
            "online": True,
            "status": "online",
            "last_seen": now,
            "expires_at": now + ttl,
            "updated_at": now,
        }
        _HOSTS[hid] = item
        return dict(item)


def list_remote_hosts(*, include_expired: bool = False) -> list[dict[str, Any]]:
    now = time.time()
    with _lock:
        rows = list(_HOSTS.values())
        if not include_expired:
            rows = [r for r in rows if float(r.get("expires_at") or 0) > now]
            # 惰性清理
            dead = [k for k, v in _HOSTS.items() if float(v.get("expires_at") or 0) <= now]
            for k in dead:
                del _HOSTS[k]
        return [dict(r) for r in rows]


def remove_remote_host(host_id: str) -> bool:
    with _lock:
        return _HOSTS.pop(host_id, None) is not None


def mark_host_offline(host_id: str) -> dict[str, Any] | None:
    """将主机标为离线（保留条目，缩短过期）。"""
    hid = (host_id or "").strip()
    if not hid:
        return None
    now = time.time()
    with _lock:
        item = _HOSTS.get(hid)
        if not item:
            return None
        item["online"] = False
        item["status"] = "offline"
        item["updated_at"] = now
        item["expires_at"] = now + 30.0
        return dict(item)
