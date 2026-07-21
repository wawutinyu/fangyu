"""S0 认证门闩：公开路由白名单、开发签发开关、强制鉴权。"""
from __future__ import annotations

import os
import re
from typing import Iterable

from fangyu.core.config import settings

_PUBLIC_EXACT = frozenset({
    "/api/health",
    "/api/v1/auth/config",
    "/docs",
    "/redoc",
    "/openapi.json",
})

_PUBLIC_PREFIXES = (
    "/api/v1/auth/oidc/",
    "/assets/",
)


def allow_dev_token() -> bool:
    """是否允许匿名 POST /auth/token。生产应设 FANGYU_ALLOW_DEV_TOKEN=0。"""
    raw = os.getenv("FANGYU_ALLOW_DEV_TOKEN")
    if raw is None or raw == "":
        raw = getattr(settings, "ALLOW_DEV_TOKEN", "") or ""
    raw = str(raw).strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on"):
        return True
    return not require_auth()


def bootstrap_secret() -> str:
    return (os.getenv("FANGYU_BOOTSTRAP_SECRET") or "").strip()


def bootstrap_header_ok(header_value: str | None) -> bool:
    secret = bootstrap_secret()
    if not secret:
        return False
    return (header_value or "").strip() == secret


def require_auth() -> bool:
    """全局 API 是否必须带身份。生产设 FANGYU_REQUIRE_AUTH=1。"""
    env = (os.getenv("FANGYU_REQUIRE_AUTH") or "").strip().lower()
    if env in ("1", "true", "yes", "on"):
        return True
    if env in ("0", "false", "no", "off"):
        return False
    return bool(getattr(settings, "REQUIRE_AUTH", False))


def allow_principal_header_bypass() -> bool:
    """SSO 关闭时是否允许 X-Fangyu-Principal。强制鉴权时关闭。"""
    if require_auth():
        return False
    raw = (os.getenv("FANGYU_ALLOW_PRINCIPAL_HEADER") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def is_public_route(method: str, path: str) -> bool:
    method = (method or "GET").upper()
    path = path or "/"
    norm = path.rstrip("/") or "/"

    if norm in {p.rstrip("/") or "/" for p in _PUBLIC_EXACT}:
        return True
    for prefix in _PUBLIC_PREFIXES:
        if path.startswith(prefix):
            return True
    if method == "POST" and path.startswith("/api/v1/trigger/hook/"):
        return True
    # /auth/token：匿名仅当 allow_dev_token；否则靠中间件放行后由路由验 bootstrap/admin
    if method == "POST" and norm == "/api/v1/auth/token":
        return True
    # Studio 静态（非 API）
    if method in ("GET", "HEAD") and not path.startswith("/api/"):
        return True
    return False


_SECRET_KEY_RE = re.compile(
    r"(api[_-]?key|secret|password|token|private[_-]?key|credential)",
    re.IGNORECASE,
)


def is_secret_setting_key(key: str) -> bool:
    return bool(_SECRET_KEY_RE.search(key or ""))


def mask_secret_value(value: str) -> str:
    if not value:
        return value
    if len(value) <= 8:
        return "***"
    return value[:3] + "***" + value[-2:]


def redact_mapping(data: dict, *, keys: Iterable[str] | None = None) -> dict:
    """返回脱敏副本；运行时仍可用原 dict。"""
    out: dict = {}
    key_set = set(keys) if keys else None
    for k, v in (data or {}).items():
        sk = str(k)
        if is_secret_setting_key(sk) or (key_set and sk in key_set):
            out[k] = mask_secret_value(str(v)) if v is not None else v
        elif isinstance(v, dict):
            out[k] = redact_mapping(v, keys=keys)
        else:
            out[k] = v
    return out


def redact_json_blob(text: str) -> str:
    if not text:
        return text
    try:
        import json
        obj = json.loads(text)
        if isinstance(obj, dict):
            return json.dumps(redact_mapping(obj), ensure_ascii=False)
    except Exception:
        pass
    return text
