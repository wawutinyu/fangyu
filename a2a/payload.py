"""A2A Payload — content_type 扩展（text / json / image / file ref / industrial）。"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

CONTENT_TEXT = "text/plain"
CONTENT_JSON = "application/json"
CONTENT_FILE_REF = "application/file+ref"
CONTENT_INDUSTRIAL = "application/industrial"
CONTENT_IMAGE_PREFIX = "image/"

SUPPORTED_CONTENT_TYPES = {
    CONTENT_TEXT,
    CONTENT_JSON,
    CONTENT_FILE_REF,
    CONTENT_INDUSTRIAL,
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/*",
}


@dataclass
class Payload:
    content_type: str
    body: Any
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"content_type": self.content_type, "body": self.body, "metadata": self.metadata}

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Payload":
        return cls(
            content_type=data.get("content_type") or CONTENT_TEXT,
            body=data.get("body"),
            metadata=data.get("metadata") or {},
        )


def _part_content_type(part: dict) -> str:
    if part.get("type") == "text":
        return CONTENT_TEXT
    if part.get("type") == "data":
        data = part.get("data") or {}
        return data.get("content_type") or data.get("contentType") or CONTENT_JSON
    if part.get("type") == "file":
        f = part.get("file") or {}
        mime = f.get("mimeType") or f.get("mime_type") or ""
        if mime.startswith("image/"):
            return mime
        return CONTENT_FILE_REF
    return CONTENT_TEXT


def part_to_body(part: dict) -> Any:
    ptype = part.get("type")
    if ptype == "text":
        return part.get("text", "")
    if ptype == "data":
        data = part.get("data") or {}
        return data.get("body") if "body" in data else data
    if ptype == "file":
        f = part.get("file") or {}
        return {
            "uri": f.get("uri"),
            "name": f.get("name"),
            "mimeType": f.get("mimeType") or f.get("mime_type"),
            "bytes": f.get("bytes"),
        }
    return part


def message_to_payloads(message: dict) -> list[Payload]:
    """从 A2A Message 解析多模态 Payload 列表。"""
    meta = message.get("metadata") or {}
    default_ct = meta.get("content_type") or meta.get("contentType")
    out: list[Payload] = []
    for part in message.get("parts") or []:
        ct = _part_content_type(part) if not default_ct else default_ct
        out.append(Payload(content_type=ct, body=part_to_body(part), metadata=dict(meta)))
    if not out and default_ct:
        out.append(Payload(content_type=default_ct, body=meta.get("body"), metadata=dict(meta)))
    return out


def message_to_inputs(message: dict) -> dict[str, Any]:
    """将 A2A Message 转为 flow external_inputs 友好结构。"""
    payloads = message_to_payloads(message)
    inputs: dict[str, Any] = {"payloads": [p.to_dict() for p in payloads]}
    texts: list[str] = []
    files: list[dict] = []
    images: list[dict] = []
    industrial: list[dict] = []

    for p in payloads:
        if p.content_type == CONTENT_TEXT:
            texts.append(str(p.body))
        elif p.content_type == CONTENT_JSON:
            if isinstance(p.body, dict):
                inputs.update(p.body)
            else:
                inputs["json"] = p.body
        elif p.content_type == CONTENT_FILE_REF:
            files.append(p.body if isinstance(p.body, dict) else {"ref": p.body})
        elif p.content_type.startswith("image/") or p.content_type == "image/*":
            images.append(p.body if isinstance(p.body, dict) else {"ref": p.body})
        elif p.content_type == CONTENT_INDUSTRIAL:
            body = p.body if isinstance(p.body, dict) else {"value": p.body}
            industrial.append(body)
            inputs.update({k: v for k, v in body.items() if k in ("tag", "value", "unit", "alarm", "device_id")})

    if texts:
        joined = "\n".join(texts)
        inputs.setdefault("message", joined)
        inputs.setdefault("query", joined)
        inputs.setdefault("input", joined)
        inputs["text"] = joined
    if files:
        inputs["files"] = files
        inputs["file_ref"] = files[0]
    if images:
        inputs["images"] = images
        inputs["image_ref"] = images[0]
    if industrial:
        inputs["industrial"] = industrial
        inputs["industrial_event"] = industrial[-1]

    meta = message.get("metadata") or {}
    if meta.get("skill_id"):
        inputs["skill_id"] = meta["skill_id"]
    return inputs


def build_message_from_payload(payload: Payload, role: str = "user", **metadata) -> dict:
    """从 Payload 构建 A2A Message。"""
    parts: list[dict] = []
    if payload.content_type == CONTENT_TEXT:
        parts.append({"type": "text", "text": str(payload.body)})
    elif payload.content_type == CONTENT_JSON:
        parts.append({"type": "data", "data": {"content_type": CONTENT_JSON, "body": payload.body}})
    elif payload.content_type == CONTENT_INDUSTRIAL:
        body = payload.body if isinstance(payload.body, dict) else {"value": payload.body}
        parts.append({"type": "data", "data": {"content_type": CONTENT_INDUSTRIAL, **body}})
    elif payload.content_type.startswith("image/"):
        ref = payload.body if isinstance(payload.body, dict) else {"uri": str(payload.body)}
        parts.append({"type": "file", "file": {"mimeType": payload.content_type, **ref}})
    elif payload.content_type == CONTENT_FILE_REF:
        ref = payload.body if isinstance(payload.body, dict) else {"uri": str(payload.body)}
        parts.append({"type": "file", "file": ref})
    else:
        parts.append({"type": "text", "text": str(payload.body)})

    return {
        "role": role,
        "parts": parts,
        "metadata": {**payload.metadata, "content_type": payload.content_type, **metadata},
    }
