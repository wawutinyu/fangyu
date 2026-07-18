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
