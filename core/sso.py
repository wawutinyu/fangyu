"""SSO / OIDC 身份 — 本地 JWT + 配置化 issuer（企业接 SSO 的落点）。

- 开发：POST /api/v1/auth/token 签发 HS256 JWT
- 生产：配置 DATA_DIR/sso.json 的 issuer / audience / jwks 或 shared_secret
- 中间件：Authorization: Bearer <jwt> → set_principal(sub|principal_id)
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from pathlib import Path
from typing import Any

from fangyu.core.config import DATA_DIR

_SSO_PATH = DATA_DIR / "sso.json"

_DEFAULT = {
    "enabled": False,
    "issuer": "fangyu-local",
    "audience": "fangyu-api",
    "shared_secret": "",
    "oidc": {
        "authorization_endpoint": "",
        "token_endpoint": "",
        "jwks_uri": "",
        "client_id": "",
    },
}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_json(obj: dict[str, Any]) -> str:
    return _b64url(json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def sso_config_path() -> Path:
    return Path(DATA_DIR) / "sso.json"


def load_sso_config() -> dict[str, Any]:
    path = sso_config_path()
    doc = json.loads(json.dumps(_DEFAULT))
    if path.is_file():
        try:
            overlay = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(overlay, dict):
                doc.update({k: v for k, v in overlay.items() if k != "oidc"})
                if isinstance(overlay.get("oidc"), dict):
                    doc["oidc"] = {**(doc.get("oidc") or {}), **overlay["oidc"]}
        except (json.JSONDecodeError, OSError):
            pass
    if not doc.get("shared_secret"):
        # 稳定派生：基于 DATA_DIR，避免每次重启换密钥（可被配置覆盖）
        raw = f"fangyu-sso::{DATA_DIR}".encode("utf-8")
        doc["shared_secret"] = hashlib.sha256(raw).hexdigest()
    return doc


def save_sso_config(overlay: dict[str, Any]) -> dict[str, Any]:
    path = sso_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    current = load_sso_config()
    for k, v in (overlay or {}).items():
        if k == "oidc" and isinstance(v, dict):
            current["oidc"] = {**(current.get("oidc") or {}), **v}
        else:
            current[k] = v
    # 不把派生 secret 空写覆盖
    path.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
    return current


def mint_access_token(
    *,
    principal_id: str,
    name: str = "",
    roles: list[str] | None = None,
    ttl_sec: int = 3600,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = config or load_sso_config()
    now = int(time.time())
    payload = {
        "iss": cfg.get("issuer") or "fangyu-local",
        "aud": cfg.get("audience") or "fangyu-api",
        "sub": principal_id,
        "principal_id": principal_id,
        "name": name or principal_id,
        "roles": roles or ["operator"],
        "iat": now,
        "exp": now + max(60, int(ttl_sec)),
    }
    header = {"alg": "HS256", "typ": "JWT"}
    signing = f"{_b64url_json(header)}.{_b64url_json(payload)}".encode("ascii")
    secret = str(cfg.get("shared_secret") or "").encode("utf-8")
    sig = hmac.new(secret, signing, hashlib.sha256).digest()
    token = f"{signing.decode('ascii')}.{_b64url(sig)}"
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": max(60, int(ttl_sec)),
        "principal_id": principal_id,
    }


def verify_access_token(token: str, *, config: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = config or load_sso_config()
    parts = (token or "").strip().split(".")
    if len(parts) != 3:
        raise ValueError("invalid jwt")
    header_b64, payload_b64, sig_b64 = parts
    signing = f"{header_b64}.{payload_b64}".encode("ascii")
    secret = str(cfg.get("shared_secret") or "").encode("utf-8")
    expected = hmac.new(secret, signing, hashlib.sha256).digest()
    try:
        got = _b64url_decode(sig_b64)
    except Exception as exc:
        raise ValueError("invalid jwt signature encoding") from exc
    if not hmac.compare_digest(expected, got):
        raise ValueError("invalid jwt signature")
    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception as exc:
        raise ValueError("invalid jwt payload") from exc
    if int(payload.get("exp") or 0) < int(time.time()):
        raise ValueError("token expired")
    aud = cfg.get("audience") or "fangyu-api"
    if payload.get("aud") and payload.get("aud") != aud:
        raise ValueError("audience mismatch")
    iss = cfg.get("issuer") or "fangyu-local"
    if payload.get("iss") and payload.get("iss") != iss:
        raise ValueError("issuer mismatch")
    return payload


def principal_from_payload(payload: dict[str, Any]) -> str:
    return str(payload.get("principal_id") or payload.get("sub") or "").strip()


def public_auth_config() -> dict[str, Any]:
    cfg = load_sso_config()
    oidc = cfg.get("oidc") or {}
    return {
        "enabled": bool(cfg.get("enabled")),
        "issuer": cfg.get("issuer"),
        "audience": cfg.get("audience"),
        "oidc": {
            "authorization_endpoint": oidc.get("authorization_endpoint") or "",
            "token_endpoint": oidc.get("token_endpoint") or "",
            "client_id": oidc.get("client_id") or "",
            # jwks 不对外泄 secret
        },
        "modes": ["local_jwt", "bearer_principal"],
        "hint": "Authorization: Bearer <access_token>；或 X-Fangyu-Principal 开发旁路（仅 enabled=false 时）。",
    }
