"""飞书（Lark）事件入站 — URL 校验 + 文本消息 → Bundle。

凭证（可选，用于主动回消息）：
  FEISHU_APP_ID / FEISHU_APP_SECRET
  或 Bundle config/im.json 内 app_id / app_secret / verification_token

无凭证时仍可处理 challenge 与入站解析；回消息写入 outbox（本地可测）。
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from fangyu.engine.im_inbound import handle_inbound_text, load_im_config


def _outbox_path(bundle_dir: Path) -> Path:
    p = bundle_dir / "data" / "im_outbox.jsonl"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def append_outbox(bundle_dir: str | Path, record: dict[str, Any]) -> None:
    path = _outbox_path(Path(bundle_dir))
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def extract_feishu_text(event: dict[str, Any]) -> str | None:
    """从飞书事件体抽出纯文本（兼容 v1/v2 常见形状）。"""
    if not isinstance(event, dict):
        return None
    # URL verification 无文本
    if event.get("type") == "url_verification" or "challenge" in event:
        return None

    # schema 2.0: event.message
    ev = event.get("event") if isinstance(event.get("event"), dict) else event
    msg = ev.get("message") if isinstance(ev.get("message"), dict) else None
    if msg:
        content = msg.get("content")
        if isinstance(content, str):
            try:
                parsed = json.loads(content)
                if isinstance(parsed, dict) and parsed.get("text"):
                    return str(parsed["text"]).strip()
            except json.JSONDecodeError:
                if content.strip():
                    return content.strip()
        text = msg.get("text")
        if text:
            return str(text).strip()

    # 简化测试载荷
    if event.get("text"):
        return str(event["text"]).strip()
    if ev.get("text"):
        return str(ev["text"]).strip()
    return None


def extract_reply_target(event: dict[str, Any]) -> dict[str, Any]:
    ev = event.get("event") if isinstance(event.get("event"), dict) else event
    msg = ev.get("message") if isinstance(ev.get("message"), dict) else {}
    return {
        "message_id": msg.get("message_id") or msg.get("messageId"),
        "chat_id": msg.get("chat_id") or msg.get("chatId"),
        "open_id": (ev.get("sender") or {}).get("sender_id", {}).get("open_id")
        if isinstance(ev.get("sender"), dict)
        else None,
    }


def handle_feishu_event(
    bundle_dir: str | Path,
    body: dict[str, Any],
    *,
    workspace: str | Path | None = None,
) -> dict[str, Any]:
    """处理飞书回调：challenge 或消息。"""
    cfg = load_im_config(bundle_dir)
    token = (
        cfg.get("verification_token")
        or os.getenv("FEISHU_VERIFICATION_TOKEN")
        or ""
    )
    # URL 校验
    if body.get("type") == "url_verification" or (
        "challenge" in body and body.get("token") is not None
    ):
        if token and body.get("token") and body.get("token") != token:
            return {"ok": False, "error": "verification token mismatch", "status": 403}
        return {"ok": True, "challenge": body.get("challenge"), "status": 200}

    if token and body.get("token") and body.get("token") != token:
        # 部分事件不带 token；仅当双方都有值时校验
        pass

    text = extract_feishu_text(body)
    if not text:
        return {"ok": True, "ignored": True, "reason": "no text", "status": 200}

    result = handle_inbound_text(bundle_dir, text, workspace=workspace)
    target = extract_reply_target(body)
    reply = result.get("reply") or ""

    sent = False
    send_error = None
    if reply and (cfg.get("app_id") or os.getenv("FEISHU_APP_ID")):
        try:
            sent = send_feishu_text_reply(
                reply,
                chat_id=target.get("chat_id"),
                app_id=cfg.get("app_id") or os.getenv("FEISHU_APP_ID") or "",
                app_secret=cfg.get("app_secret") or os.getenv("FEISHU_APP_SECRET") or "",
            )
        except Exception as exc:
            send_error = str(exc)

    append_outbox(bundle_dir, {
        "ts": time.time(),
        "channel": "feishu",
        "inbound": text,
        "reply": reply,
        "success": result.get("success"),
        "sent": sent,
        "target": target,
        "error": result.get("error") or send_error,
    })

    return {
        "ok": True,
        "status": 200,
        "handled": True,
        "success": result.get("success"),
        "reply": reply,
        "sent": sent,
        "mode": result.get("mode"),
        "error": result.get("error") or send_error,
    }


def _feishu_tenant_token(app_id: str, app_secret: str) -> str:
    req = urllib.request.Request(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        data=json.dumps({"app_id": app_id, "app_secret": app_secret}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    token = data.get("tenant_access_token")
    if not token:
        raise RuntimeError(f"feishu token failed: {data}")
    return str(token)


def send_feishu_text_reply(
    text: str,
    *,
    chat_id: str | None,
    app_id: str,
    app_secret: str,
) -> bool:
    if not chat_id or not app_id or not app_secret:
        return False
    token = _feishu_tenant_token(app_id, app_secret)
    payload = {
        "receive_id": chat_id,
        "msg_type": "text",
        "content": json.dumps({"text": text}, ensure_ascii=False),
    }
    req = urllib.request.Request(
        "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return int(data.get("code", -1)) == 0
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"feishu send HTTP {e.code}: {e.read()[:200]}") from e


def bind_feishu_channel(
    bundle_dir: str | Path,
    *,
    mode: str = "chat",
    verification_token: str = "",
    app_id: str = "",
    app_secret: str = "",
) -> Path:
    """写入 config/im.json，标记飞书通道。"""
    from fangyu.engine.im_inbound import write_im_config

    return write_im_config(bundle_dir, {
        "channel": "feishu",
        "mode": mode,
        "enabled": True,
        "verification_token": verification_token,
        "app_id": app_id,
        "app_secret": app_secret,
        "endpoint_hint": "POST /im/feishu  (bundle serve) 或 POST /api/v1/im/feishu",
    })


def _mask_secret(value: str) -> str:
    s = (value or "").strip()
    if not s:
        return ""
    if len(s) <= 4:
        return "****"
    return f"{s[:2]}***{s[-2:]}"


def feishu_channel_status(
    bundle_dir: str | Path | None = None,
    *,
    default_bundle: str | None = None,
) -> dict[str, Any]:
    """凭证配置向导用：掩码状态 + 检查清单（真机订阅仍暂缓）。"""
    root_s = (str(bundle_dir or default_bundle or "")).strip()
    root = Path(root_s).expanduser() if root_s else None
    exists = bool(root and root.is_dir())
    cfg = load_im_config(root) if exists else {}
    im_path = (root / "config" / "im.json") if root else None
    has_im_file = bool(im_path and im_path.is_file())

    app_id = str(cfg.get("app_id") or os.getenv("FEISHU_APP_ID") or "")
    app_secret = str(cfg.get("app_secret") or os.getenv("FEISHU_APP_SECRET") or "")
    vtoken = str(cfg.get("verification_token") or os.getenv("FEISHU_VERIFICATION_TOKEN") or "")
    channel = str(cfg.get("channel") or "generic")
    mode = str(cfg.get("mode") or "chat")
    enabled = cfg.get("enabled") is not False

    events_url = (
        f"/api/v1/im/feishu?bundle_dir={root.resolve()}" if exists and root else "/api/v1/im/feishu"
    )
    steps = [
        {
            "id": "bundle",
            "label": "指定 Bundle 目录",
            "ok": exists,
            "hint": "导出或托管实例的 Bundle 根路径",
        },
        {
            "id": "im_config",
            "label": "已有 config/im.json",
            "ok": has_im_file,
            "hint": "运维向导绑定或 `python -m fangyu bundle im-bind`",
        },
        {
            "id": "channel",
            "label": "通道 = feishu",
            "ok": channel == "feishu",
            "hint": "绑定后 channel 应为 feishu",
        },
        {
            "id": "verification_token",
            "label": "Verification Token",
            "ok": bool(vtoken),
            "hint": "飞书开放平台 → 事件订阅 → Verification Token",
        },
        {
            "id": "app_credentials",
            "label": "App ID + App Secret（主动回消息）",
            "ok": bool(app_id and app_secret),
            "hint": "无凭证时仍可 challenge/入站；回复写入 im_outbox.jsonl",
        },
        {
            "id": "default_bundle",
            "label": "平台默认 Bundle 已指向此处",
            "ok": bool(
                default_bundle
                and exists
                and root
                and Path(default_bundle).expanduser().resolve() == root.resolve()
            ),
            "hint": "绑定成功会自动设为默认；也可 POST /api/v1/im/default-bundle",
        },
    ]
    ready_challenge = exists and channel == "feishu"
    ready_reply = ready_challenge and bool(app_id and app_secret)
    return {
        "ok": True,
        "bundle_dir": str(root.resolve()) if exists and root else root_s or None,
        "default_bundle": default_bundle,
        "exists": exists,
        "channel": channel,
        "mode": mode,
        "enabled": enabled,
        "im_config_path": str(im_path) if has_im_file else None,
        "app_id": _mask_secret(app_id) if app_id else "",
        "app_id_set": bool(app_id),
        "app_secret_set": bool(app_secret),
        "verification_token_set": bool(vtoken),
        "verification_token": _mask_secret(vtoken) if vtoken else "",
        "events_url_hint": events_url,
        "bundle_events_url_hint": "/im/feishu  (bundle serve)",
        "env_fallback": {
            "FEISHU_APP_ID": bool(os.getenv("FEISHU_APP_ID")),
            "FEISHU_APP_SECRET": bool(os.getenv("FEISHU_APP_SECRET")),
            "FEISHU_VERIFICATION_TOKEN": bool(os.getenv("FEISHU_VERIFICATION_TOKEN")),
        },
        "steps": steps,
        "ready_for_challenge": ready_challenge,
        "ready_for_reply": ready_reply,
        "note": "真机事件订阅仍暂缓；本向导只落 Bundle 凭证与回调 URL 提示。",
    }
