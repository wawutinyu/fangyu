"""Agent Workspace — Bundle 内可读写的工作目录（可绑外部项目根）。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_active: "AgentWorkspace | None" = None

WORKSPACE_CONFIG = "config/workspace.json"


class WorkspaceError(PermissionError):
    pass


class AgentWorkspace:
    """限制在 root 下的文件操作。"""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / ".fangyu").mkdir(exist_ok=True)

    def resolve(self, rel: str) -> Path:
        rel = (rel or ".").replace("\\", "/").lstrip("/")
        target = (self.root / rel).resolve()
        if target != self.root and self.root not in target.parents:
            raise WorkspaceError(f"路径越界 workspace: {rel}")
        return target

    def read(self, rel: str) -> str:
        path = self.resolve(rel)
        if not path.is_file():
            raise FileNotFoundError(rel)
        return path.read_text(encoding="utf-8")

    def write(self, rel: str, content: str) -> None:
        path = self.resolve(rel)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def list(self, rel: str = ".") -> list[str]:
        path = self.resolve(rel)
        if not path.is_dir():
            return [path.name] if path.is_file() else []
        return sorted(p.name for p in path.iterdir() if p.name != ".fangyu")

    def load_state(self) -> dict[str, Any]:
        state_path = self.resolve(".fangyu/state.json")
        if not state_path.is_file():
            return {}
        try:
            return json.loads(state_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}

    def save_state(self, state: dict[str, Any]) -> None:
        state_path = self.resolve(".fangyu/state.json")
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def resolve_workspace_root(
    bundle_root: str | Path,
    *,
    workspace_override: str | Path | None = None,
) -> Path:
    """决定 harness 工作区根：override > config/workspace.json > bundle/workspace。"""
    root = Path(bundle_root).resolve()
    if workspace_override:
        return Path(workspace_override).expanduser().resolve()
    cfg = root / WORKSPACE_CONFIG
    if cfg.is_file():
        try:
            data = json.loads(cfg.read_text(encoding="utf-8"))
            path = data.get("path")
            if path:
                return Path(str(path)).expanduser().resolve()
        except (json.JSONDecodeError, OSError, TypeError):
            pass
    return root / "workspace"


def bind_external_workspace(bundle_root: str | Path, external: str | Path) -> Path:
    """把外部项目根写入 bundle config，供 run/chat 使用。"""
    root = Path(bundle_root).resolve()
    target = Path(external).expanduser().resolve()
    if not target.is_dir():
        raise WorkspaceError(f"workspace 不是目录: {target}")
    cfg_dir = root / "config"
    cfg_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "path": str(target),
        "mode": "external",
        "bound_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
        .replace(microsecond=0)
        .isoformat(),
    }
    (cfg_dir / "workspace.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    (target / ".fangyu").mkdir(exist_ok=True)
    return target


def init_bundle_workspace(
    bundle_root: str | Path,
    *,
    workspace_override: str | Path | None = None,
) -> AgentWorkspace:
    """Bundle runtime / chat 启动时初始化 workspace（幂等）。"""
    global _active
    ws_root = resolve_workspace_root(bundle_root, workspace_override=workspace_override)
    ws = AgentWorkspace(ws_root)
    _active = ws
    return ws


def get_active_workspace() -> AgentWorkspace | None:
    return _active


def workspace_helpers() -> dict[str, Any]:
    ws = get_active_workspace()
    if not ws:
        return {}

    def ws_read(path: str) -> str:
        return ws.read(path)

    def ws_write(path: str, content: str) -> dict[str, str]:
        ws.write(path, content)
        return {"ok": "true", "path": path}

    def ws_list(path: str = ".") -> list[str]:
        return ws.list(path)

    def ws_state() -> dict[str, Any]:
        return ws.load_state()

    def ws_save_state(state: dict) -> dict[str, str]:
        ws.save_state(state)
        return {"ok": "true"}

    return {
        "ws_read": ws_read,
        "ws_write": ws_write,
        "ws_list": ws_list,
        "ws_state": ws_state,
        "ws_save_state": ws_save_state,
        "WORKSPACE": str(ws.root),
    }
