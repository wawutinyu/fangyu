"""IM 入站统一层 — 文本 → Bundle chat / orchestrate → 回复文本。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

Mode = Literal["chat", "orchestrate"]


def load_im_config(bundle_dir: str | Path) -> dict[str, Any]:
    path = Path(bundle_dir) / "config" / "im.json"
    if not path.is_file():
        return {
            "channel": "generic",
            "mode": "chat",
            "enabled": True,
        }
    return json.loads(path.read_text(encoding="utf-8"))


def write_im_config(bundle_dir: str | Path, config: dict[str, Any]) -> Path:
    root = Path(bundle_dir)
    cfg = root / "config"
    cfg.mkdir(parents=True, exist_ok=True)
    path = cfg / "im.json"
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def handle_inbound_text(
    bundle_dir: str | Path,
    text: str,
    *,
    workspace: str | Path | None = None,
    mode: Mode | None = None,
) -> dict[str, Any]:
    """处理一条用户文本，返回统一结果。"""
    msg = (text or "").strip()
    if not msg:
        return {"success": False, "reply": "", "error": "empty message"}

    cfg = load_im_config(bundle_dir)
    if cfg.get("enabled") is False:
        return {"success": False, "reply": "", "error": "im channel disabled"}

    use_mode: Mode = mode or cfg.get("mode") or "chat"  # type: ignore[assignment]
    if use_mode == "orchestrate":
        topo = Path(bundle_dir) / "config" / "topology.json"
        if not topo.is_file():
            use_mode = "chat"

    if use_mode == "orchestrate":
        from fangyu.engine.bundle_orchestrate import run_topology

        out = run_topology(bundle_dir, msg, workspace=workspace)
        reply = str(out.get("final_output") or out.get("error") or "")
        return {
            "success": bool(out.get("success")),
            "reply": reply,
            "mode": "orchestrate",
            "error": out.get("error"),
            "steps": out.get("steps"),
        }

    from fangyu.engine.bundle_chat import chat_once

    out = chat_once(bundle_dir, msg, workspace=workspace)
    reply = str(out.get("result") or out.get("error") or "")
    return {
        "success": bool(out.get("success")),
        "reply": reply,
        "mode": "chat",
        "error": out.get("error"),
        "agent": out.get("agent"),
    }
