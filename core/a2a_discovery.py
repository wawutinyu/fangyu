"""A2A 跨厂发现 — well-known / card / RPC 多路径探测。"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urljoin, urlparse


def _http_get_json(url: str, *, timeout: float = 10.0) -> dict[str, Any] | None:
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def normalize_factory_base(url: str) -> str:
    raw = (url or "").strip().rstrip("/")
    if not raw:
        raise ValueError("url 不能为空")
    if raw.endswith("/rpc"):
        raw = raw[: -len("/rpc")]
    if raw.endswith("/api/v1/a2a"):
        raw = raw[: -len("/api/v1/a2a")]
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("仅允许 http/https")
    return raw


def normalize_rpc_url(url: str) -> str:
    raw = (url or "").strip().rstrip("/")
    if not raw:
        raise ValueError("rpc_url 不能为空")
    if raw.endswith("/rpc"):
        return raw
    # 已是完整 a2a 前缀
    if raw.endswith("/api/v1/a2a"):
        return f"{raw}/rpc"
    base = normalize_factory_base(raw)
    return f"{base}/api/v1/a2a/rpc"


def _looks_like_card(doc: dict[str, Any] | None) -> bool:
    if not isinstance(doc, dict):
        return False
    return bool(doc.get("name") or doc.get("skills") or doc.get("interfaces"))


def fetch_remote_card(rpc_url: str) -> dict:
    """多路径拉取 AgentCard：well-known → /card → RPC get_agent_card。"""
    from fangyu.engine.a2a_remote import _rpc_post

    rpc = normalize_rpc_url(rpc_url) if "/rpc" not in rpc_url.rstrip("/") else rpc_url.rstrip("/")
    try:
        base = normalize_factory_base(rpc)
    except ValueError:
        base = rpc.rsplit("/rpc", 1)[0]

    candidates = [
        f"{base}/.well-known/agent-card.json",
        f"{base}/agent.card.json",
        f"{base}/card",
        f"{base}/api/v1/a2a/well-known/agent-card",
    ]
    tried: list[str] = []
    for url in candidates:
        tried.append(url)
        doc = _http_get_json(url)
        if _looks_like_card(doc):
            assert doc is not None
            doc = dict(doc)
            doc.setdefault("_discovered_from", url)
            return doc

    try:
        body = {"jsonrpc": "2.0", "method": "a2a.get_agent_card", "params": {}, "id": "discover"}
        result = _rpc_post(rpc if rpc.endswith("/rpc") else f"{base}/api/v1/a2a/rpc", body)
        if isinstance(result, dict) and _looks_like_card(result):
            result = dict(result)
            result["_discovered_from"] = "rpc:a2a.get_agent_card"
            return result
        # 无 name 时尝试 list_agents 取第一张
        body2 = {"jsonrpc": "2.0", "method": "a2a.list_agents", "params": {}, "id": "discover-list"}
        listed = _rpc_post(rpc if rpc.endswith("/rpc") else f"{base}/api/v1/a2a/rpc", body2)
        if isinstance(listed, list) and listed:
            first = listed[0]
            if isinstance(first, dict):
                card = first.get("card") if isinstance(first.get("card"), dict) else first
                if _looks_like_card(card):
                    out = dict(card)
                    out["_discovered_from"] = "rpc:a2a.list_agents"
                    return out
    except Exception:
        pass
    return {}


def probe_factory(base_or_rpc: str) -> dict[str, Any]:
    """探测远程工厂：返回 base、rpc、card、identity、路径命中。"""
    from fangyu.engine.a2a_remote import fetch_remote_identity

    base = normalize_factory_base(base_or_rpc)
    rpc = f"{base}/api/v1/a2a/rpc"
    hits: list[dict[str, Any]] = []
    for path in (
        "/.well-known/agent-card.json",
        "/agent.card.json",
        "/card",
        "/api/v1/a2a/well-known/agent-card",
        "/api/v1/a2a/discovery",
        "/api/health",
    ):
        url = urljoin(base + "/", path.lstrip("/"))
        # urljoin quirks — prefer explicit
        url = f"{base}{path}"
        doc = _http_get_json(url)
        hits.append({
            "path": path,
            "ok": doc is not None,
            "keys": sorted(doc.keys())[:12] if isinstance(doc, dict) else [],
        })

    card = fetch_remote_card(rpc)
    identity = fetch_remote_identity(rpc)
    local_discovery = _http_get_json(f"{base}/api/v1/a2a/discovery")
    return {
        "ok": bool(card) or bool(local_discovery),
        "base_url": base,
        "rpc_url": rpc,
        "card": card or None,
        "identity": identity or None,
        "discovery": local_discovery,
        "hits": hits,
    }
