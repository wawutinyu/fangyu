"""SSO / OIDC 身份 — 本地 JWT + 企业 JWKS（RS256）。

- 开发：POST /api/v1/auth/token 签发 HS256 JWT
- 生产：配置 DATA_DIR/sso.json 的 issuer / audience / oidc.jwks_uri
- 中间件：Authorization: Bearer <jwt> → set_principal(sub|principal_id)
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import threading
import time
from pathlib import Path
from typing import Any

import httpx

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

_jwks_lock = threading.Lock()
_JWKS_CACHE: dict[str, Any] = {"uri": "", "fetched_at": 0.0, "doc": None}
_JWKS_TTL_SEC = 3600


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
    clear_jwks_cache()
    return current


def clear_jwks_cache() -> None:
    with _jwks_lock:
        _JWKS_CACHE["uri"] = ""
        _JWKS_CACHE["fetched_at"] = 0.0
        _JWKS_CACHE["doc"] = None


def fetch_jwks(jwks_uri: str, *, force: bool = False, ttl_sec: int = _JWKS_TTL_SEC) -> dict[str, Any]:
    uri = (jwks_uri or "").strip()
    if not uri:
        raise ValueError("jwks_uri empty")
    now = time.time()
    with _jwks_lock:
        if (
            not force
            and _JWKS_CACHE.get("uri") == uri
            and _JWKS_CACHE.get("doc") is not None
            and now - float(_JWKS_CACHE.get("fetched_at") or 0) < max(60, int(ttl_sec))
        ):
            return _JWKS_CACHE["doc"]
    with httpx.Client(timeout=15.0, follow_redirects=True) as client:
        resp = client.get(uri, headers={"Accept": "application/json"})
        resp.raise_for_status()
        doc = resp.json()
    if not isinstance(doc, dict) or not isinstance(doc.get("keys"), list):
        raise ValueError("invalid JWKS document")
    with _jwks_lock:
        _JWKS_CACHE["uri"] = uri
        _JWKS_CACHE["fetched_at"] = now
        _JWKS_CACHE["doc"] = doc
    return doc


def _int_to_b64url(n: int) -> str:
    length = max(1, (n.bit_length() + 7) // 8)
    return _b64url(n.to_bytes(length, "big"))


def _b64url_to_int(s: str) -> int:
    return int.from_bytes(_b64url_decode(s), "big")


def _jwk_rsa_public_key(jwk: dict[str, Any]):
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers

    if (jwk.get("kty") or "").upper() != "RSA":
        raise ValueError("only RSA JWK supported")
    n = _b64url_to_int(str(jwk["n"]))
    e = _b64url_to_int(str(jwk["e"]))
    return RSAPublicNumbers(e, n).public_key()


def _pick_jwk(jwks: dict[str, Any], kid: str | None) -> dict[str, Any]:
    keys = [k for k in (jwks.get("keys") or []) if isinstance(k, dict)]
    if not keys:
        raise ValueError("JWKS has no keys")
    if kid:
        for k in keys:
            if k.get("kid") == kid:
                return k
        raise ValueError(f"no JWK for kid={kid}")
    if len(keys) == 1:
        return keys[0]
    # 无 kid 时优先 use=sig
    for k in keys:
        if (k.get("use") or "sig") == "sig" and (k.get("alg") in (None, "RS256")):
            return k
    return keys[0]


def _verify_rs256(token: str, jwks: dict[str, Any]) -> dict[str, Any]:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    parts = token.strip().split(".")
    if len(parts) != 3:
        raise ValueError("invalid jwt")
    header_b64, payload_b64, sig_b64 = parts
    try:
        header = json.loads(_b64url_decode(header_b64).decode("utf-8"))
    except Exception as exc:
        raise ValueError("invalid jwt header") from exc
    if (header.get("alg") or "").upper() != "RS256":
        raise ValueError("expected RS256")
    jwk = _pick_jwk(jwks, header.get("kid"))
    pub = _jwk_rsa_public_key(jwk)
    signing = f"{header_b64}.{payload_b64}".encode("ascii")
    try:
        sig = _b64url_decode(sig_b64)
    except Exception as exc:
        raise ValueError("invalid jwt signature encoding") from exc
    try:
        pub.verify(sig, signing, padding.PKCS1v15(), hashes.SHA256())
    except InvalidSignature as exc:
        raise ValueError("invalid jwt signature") from exc
    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception as exc:
        raise ValueError("invalid jwt payload") from exc
    return payload


def _verify_hs256(token: str, secret: bytes) -> dict[str, Any]:
    parts = (token or "").strip().split(".")
    if len(parts) != 3:
        raise ValueError("invalid jwt")
    header_b64, payload_b64, sig_b64 = parts
    try:
        header = json.loads(_b64url_decode(header_b64).decode("utf-8"))
    except Exception:
        header = {}
    alg = (header.get("alg") or "HS256").upper()
    if alg != "HS256":
        raise ValueError(f"unsupported alg for shared_secret: {alg}")
    signing = f"{header_b64}.{payload_b64}".encode("ascii")
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
    return payload


def _check_claims(payload: dict[str, Any], cfg: dict[str, Any]) -> dict[str, Any]:
    if int(payload.get("exp") or 0) < int(time.time()):
        raise ValueError("token expired")
    aud = cfg.get("audience") or "fangyu-api"
    token_aud = payload.get("aud")
    if token_aud:
        if isinstance(token_aud, list):
            if aud not in token_aud:
                raise ValueError("audience mismatch")
        elif token_aud != aud:
            raise ValueError("audience mismatch")
    iss = cfg.get("issuer") or "fangyu-local"
    if payload.get("iss") and payload.get("iss") != iss:
        raise ValueError("issuer mismatch")
    return payload


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


def mint_rs256_token_for_tests(
    *,
    private_key,
    principal_id: str,
    kid: str = "test-key",
    issuer: str = "fangyu-oidc",
    audience: str = "fangyu-api",
    ttl_sec: int = 3600,
) -> str:
    """测试辅助：用 RSA 私钥签发 RS256 JWT（不落盘）。"""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT", "kid": kid}
    payload = {
        "iss": issuer,
        "aud": audience,
        "sub": principal_id,
        "principal_id": principal_id,
        "iat": now,
        "exp": now + max(60, int(ttl_sec)),
    }
    signing = f"{_b64url_json(header)}.{_b64url_json(payload)}"
    sig = private_key.sign(
        signing.encode("ascii"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return f"{signing}.{_b64url(sig)}"


def rsa_public_jwk(private_key, *, kid: str = "test-key") -> dict[str, Any]:
    """测试辅助：从私钥导出 RSA 公钥 JWK。"""
    nums = private_key.public_key().public_numbers()
    return {
        "kty": "RSA",
        "kid": kid,
        "use": "sig",
        "alg": "RS256",
        "n": _int_to_b64url(nums.n),
        "e": _int_to_b64url(nums.e),
    }


def verify_access_token(token: str, *, config: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = config or load_sso_config()
    raw = (token or "").strip()
    parts = raw.split(".")
    if len(parts) != 3:
        raise ValueError("invalid jwt")
    try:
        header = json.loads(_b64url_decode(parts[0]).decode("utf-8"))
    except Exception as exc:
        raise ValueError("invalid jwt header") from exc
    alg = (header.get("alg") or "HS256").upper()
    oidc = cfg.get("oidc") or {}
    jwks_uri = str(oidc.get("jwks_uri") or "").strip()

    if alg == "RS256":
        if not jwks_uri:
            raise ValueError("RS256 requires oidc.jwks_uri")
        jwks = fetch_jwks(jwks_uri)
        payload = _verify_rs256(raw, jwks)
        return _check_claims(payload, cfg)

    if alg == "HS256":
        secret = str(cfg.get("shared_secret") or "").encode("utf-8")
        payload = _verify_hs256(raw, secret)
        return _check_claims(payload, cfg)

    raise ValueError(f"unsupported jwt alg: {alg}")


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
            "jwks_uri": oidc.get("jwks_uri") or "",
            "client_id": oidc.get("client_id") or "",
        },
        "modes": ["local_jwt", "oidc_jwks_rs256", "bearer_principal"],
        "hint": (
            "Authorization: Bearer <access_token>；"
            "RS256 需配置 oidc.jwks_uri；"
            "或 X-Fangyu-Principal 开发旁路（仅 enabled=false 时）。"
        ),
    }
