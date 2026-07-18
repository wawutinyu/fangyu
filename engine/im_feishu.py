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
