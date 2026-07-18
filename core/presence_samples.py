"""内置观回放样例包（跨机 Presence 等）。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fangyu.core.collaboration import pack_to_snapshot, validate_replay_pack

_SAMPLES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "presence"


def samples_dir() -> Path:
    return _SAMPLES_DIR


def list_sample_meta() -> list[dict[str, Any]]:
    root = samples_dir()
    if not root.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for path in sorted(root.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            pack = validate_replay_pack(raw)
        except (OSError, json.JSONDecodeError, ValueError, TypeError):
            continue
        sid = str(raw.get("id") or path.stem)
        out.append({
            "id": sid,
            "title": str(raw.get("title") or sid),
            "path": str(path),
            "events": len(pack.get("events") or []),
            "presence": len(pack.get("presence") or []),
            "exported_at": pack.get("exported_at") or "",
        })
    return out


def load_sample_pack(sample_id: str) -> dict[str, Any]:
    sid = (sample_id or "").strip()
    if not sid or "/" in sid or "\\" in sid or ".." in sid:
        raise FileNotFoundError(f"样例不存在: {sample_id}")
    path = samples_dir() / f"{sid}.json"
    if not path.is_file():
        for meta in list_sample_meta():
            if meta["id"] == sid:
                path = Path(meta["path"])
                break
        else:
            raise FileNotFoundError(f"样例不存在: {sample_id}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    pack = validate_replay_pack(raw)
    # 保留展示用 title（validate 会丢掉扩展字段）
    if raw.get("title"):
        pack = {**pack, "title": str(raw["title"])}
    return pack


def load_sample_snapshot(sample_id: str) -> dict[str, Any]:
    pack = load_sample_pack(sample_id)
    return pack_to_snapshot(pack)
