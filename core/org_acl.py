"""G2-C 企业组织 ACL — 成员 / 角色 / 权限（与 ATP 身份层分离）。

权限串格式：
  agent:call:<name|*>
  skill:use:<id|*>
  tool:use:<name|*>
  tool:deny:<name|*>   # 显式拒绝优先

策略文件：DATA_DIR/org_acl.json；Bundle 可带 config/acl.json（激活包时优先）。
ACL 关闭（enabled=false）时全部放行，兼容旧行为。
"""
from __future__ import annotations

import json
import threading
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Any

from fangyu.core.config import DATA_DIR, on_data_dir_change
from fangyu.core.exceptions import TrustError

_ACL_FILE = DATA_DIR / "org_acl.json"
_lock = threading.RLock()
_cache: dict[str, Any] | None = None
_principal_var: ContextVar[str | None] = ContextVar("fangyu_acl_principal", default=None)

DEFAULT_ACL: dict[str, Any] = {
    "version": "1.0",
    "org_id": "org_default",
    "org_name": "方隅默认组织",
    "enabled": False,
    "require_principal": False,
    "members": {
        "admin": {"name": "管理员", "roles": ["admin"]},
        "operator": {"name": "运营", "roles": ["operator"]},
        "viewer": {"name": "只读", "roles": ["viewer"]},
    },
    "roles": {
        "admin": {
            "description": "全权",
            "permissions": ["*"],
        },
        "operator": {
            "description": "可调 Agent、办公工具；禁 shell",
            "permissions": [
                "agent:call:*",
                "skill:use:*",
                "tool:use:read",
                "tool:use:write",
                "tool:use:list",
                "tool:use:search",
                "tool:use:apply_patch",
                "tool:use:write_deliverable",
                "tool:use:list_deliverables",
                "tool:use:task",
                "tool:use:glob",
                "tool:use:grep",
                "tool:use:search",
                "tool:use:webfetch",
                "tool:use:websearch",
                "tool:use:question",
                "tool:deny:shell",
            ],
        },
        "viewer": {
            "description": "只读工具",
            "permissions": [
                "agent:call:*",
                "skill:use:*",
                "tool:use:read",
                "tool:use:list",
                "tool:use:glob",
                "tool:use:grep",
                "tool:use:search",
                "tool:use:list_deliverables",
                "tool:use:webfetch",
                "tool:use:websearch",
                "tool:deny:write",
                "tool:deny:shell",
                "tool:deny:apply_patch",
                "tool:deny:write_deliverable",
                "tool:deny:task",
                "tool:deny:question",
            ],
        },
    },
}


class ACLError(TrustError):
    """组织 ACL 拒绝。"""

    def to_dict(self) -> dict:
        d = super().to_dict()
        d["type"] = "acl"
        return d


def refresh_acl_path(data_dir: Path | None = None) -> None:
    global _ACL_FILE, _cache
    from fangyu.core.config import DATA_DIR as cfg
    d = Path(data_dir) if data_dir is not None else cfg
    _ACL_FILE = d / "org_acl.json"
    _cache = None


on_data_dir_change(refresh_acl_path)


def acl_path() -> Path:
    return _ACL_FILE


def set_principal(principal_id: str | None):
    return _principal_var.set((principal_id or "").strip() or None)


def reset_principal(token) -> None:
    _principal_var.reset(token)


def get_principal() -> str | None:
    return _principal_var.get()


def _normalize(doc: dict[str, Any]) -> dict[str, Any]:
    out = json.loads(json.dumps(DEFAULT_ACL))
    out.update({k: v for k, v in doc.items() if k not in ("members", "roles")})
    if isinstance(doc.get("members"), dict):
        out["members"] = doc["members"]
    if isinstance(doc.get("roles"), dict):
        out["roles"] = doc["roles"]
    out["enabled"] = bool(out.get("enabled"))
    out["require_principal"] = bool(out.get("require_principal"))
    return out


def load_acl(*, force: bool = False) -> dict[str, Any]:
    global _cache
    with _lock:
        if _cache is not None and not force:
            return _cache
        if _ACL_FILE.is_file():
            try:
                raw = json.loads(_ACL_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                raw = {}
            _cache = _normalize(raw if isinstance(raw, dict) else {})
        else:
            _cache = _normalize({})
        return _cache


def save_acl(doc: dict[str, Any]) -> dict[str, Any]:
    global _cache
    normalized = _normalize(doc)
    with _lock:
        _ACL_FILE.parent.mkdir(parents=True, exist_ok=True)
        _ACL_FILE.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
        _cache = normalized
    return normalized


def init_acl(
    *,
    org_name: str = "方隅默认组织",
    enabled: bool = True,
    require_principal: bool = True,
) -> dict[str, Any]:
    doc = _normalize({})
    doc["org_name"] = org_name
    doc["org_id"] = f"org_{int(time.time())}"
    doc["enabled"] = enabled
    doc["require_principal"] = require_principal
    return save_acl(doc)


def load_bundle_acl(bundle_dir: str | Path) -> dict[str, Any] | None:
    path = Path(bundle_dir) / "config" / "acl.json"
    if not path.is_file():
        return None
    try:
        return _normalize(json.loads(path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, OSError):
        return None


def write_bundle_acl(bundle_dir: str | Path, doc: dict[str, Any] | None = None) -> Path:
    root = Path(bundle_dir)
    cfg = root / "config"
    cfg.mkdir(parents=True, exist_ok=True)
    path = cfg / "acl.json"
    payload = _normalize(doc if doc is not None else load_acl())
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def activate_bundle_acl(bundle_dir: str | Path) -> dict[str, Any] | None:
    """若 Bundle 含 acl.json，写入当前 DATA_DIR 生效（Bundle 运行时隔离后）。"""
    doc = load_bundle_acl(bundle_dir)
    if doc is None:
        return None
    return save_acl(doc)


def _member_permissions(doc: dict[str, Any], principal_id: str) -> list[str]:
    member = (doc.get("members") or {}).get(principal_id)
    if not member:
        return []
    roles = member.get("roles") or []
    perms: list[str] = []
    role_map = doc.get("roles") or {}
    for rid in roles:
        role = role_map.get(rid) or {}
        perms.extend(list(role.get("permissions") or []))
    # 成员级覆盖
    perms.extend(list(member.get("permissions") or []))
    return perms


def _match(pattern: str, kind: str, name: str) -> bool:
    """pattern like agent:call:foo or tool:deny:* ; kind in agent|skill|tool."""
    parts = pattern.split(":")
    if len(parts) < 3:
        return False
    p_kind, p_action, p_name = parts[0], parts[1], ":".join(parts[2:])
    if p_kind != kind:
        return False
    if kind == "agent" and p_action != "call":
        return False
    if kind == "skill" and p_action != "use":
        return False
    if kind == "tool" and p_action not in ("use", "deny"):
        return False
    if p_name == "*" or p_name == name:
        return True
    return False


def _allowed(perms: list[str], kind: str, name: str) -> tuple[bool, str]:
    if "*" in perms:
        # 仍尊重 tool:deny
        if kind == "tool":
            for p in perms:
                if p.startswith("tool:deny:") and _match(p, "tool", name):
                    return False, p
        return True, "*"
    # deny first for tools
    if kind == "tool":
        for p in perms:
            if p.startswith("tool:deny:") and _match(p, "tool", name):
                return False, p
    matched = False
    rule = ""
    for p in perms:
        if kind == "tool" and p.startswith("tool:deny:"):
            continue
        if _match(p, kind, name):
            matched = True
            rule = p
            break
    return matched, rule or f"{kind}:missing"


def assert_org_allowed(
    principal_id: str | None,
    *,
    agent: str | None = None,
    skill: str | None = None,
    tool: str | None = None,
    acl: dict[str, Any] | None = None,
) -> None:
    """校验主体对 agent/skill/tool 的权限；失败抛 ACLError 并写审计。"""
    doc = acl if acl is not None else load_acl()
    if not doc.get("enabled"):
        return

    from fangyu.core.constitution import audit_event

    pid = (principal_id or "").strip() or None
    if not pid:
        if doc.get("require_principal"):
            audit_event("acl_violation", {"rule": "require_principal", "agent": agent, "skill": skill, "tool": tool})
            raise ACLError(
                "require_principal",
                "组织 ACL 已启用且要求主体身份（principal_id）",
                context={"agent": agent, "skill_id": skill, "tool": tool},
            )
        return

    if pid not in (doc.get("members") or {}):
        audit_event("acl_violation", {"rule": "unknown_principal", "principal": pid})
        raise ACLError(
            "unknown_principal",
            f"未知成员 '{pid}'",
            context={"agent": agent, "skill_id": skill, "principal": pid},
        )

    perms = _member_permissions(doc, pid)

    if agent is not None:
        ok, rule = _allowed(perms, "agent", agent)
        if not ok:
            audit_event("acl_violation", {"rule": rule, "principal": pid, "agent": agent})
            raise ACLError(
                "agent_denied",
                f"成员 '{pid}' 无权调用 Agent '{agent}'",
                context={"agent": agent, "skill_id": skill, "principal": pid, "rule": rule},
            )

    if skill is not None:
        ok, rule = _allowed(perms, "skill", skill or "default")
        if not ok:
            audit_event("acl_violation", {"rule": rule, "principal": pid, "skill": skill})
            raise ACLError(
                "skill_denied",
                f"成员 '{pid}' 无权使用技能 '{skill}'",
                context={"agent": agent, "skill_id": skill, "principal": pid, "rule": rule},
            )

    if tool is not None:
        ok, rule = _allowed(perms, "tool", tool)
        if not ok:
            audit_event("acl_violation", {"rule": rule, "principal": pid, "tool": tool})
            raise ACLError(
                "tool_denied",
                f"成员 '{pid}' 无权使用工具 '{tool}'",
                context={"agent": agent, "skill_id": skill, "tool": tool, "principal": pid, "rule": rule},
            )


def add_member(member_id: str, *, name: str = "", roles: list[str] | None = None) -> dict[str, Any]:
    doc = load_acl(force=True)
    members = dict(doc.get("members") or {})
    members[member_id] = {
        "name": name or member_id,
        "roles": list(roles or ["viewer"]),
    }
    doc["members"] = members
    return save_acl(doc)


def set_member_roles(member_id: str, roles: list[str]) -> dict[str, Any]:
    doc = load_acl(force=True)
    members = dict(doc.get("members") or {})
    if member_id not in members:
        raise KeyError(f"成员不存在: {member_id}")
    members[member_id] = {**members[member_id], "roles": list(roles)}
    doc["members"] = members
    return save_acl(doc)


def remove_member(member_id: str) -> dict[str, Any]:
    doc = load_acl(force=True)
    members = dict(doc.get("members") or {})
    if member_id not in members:
        raise KeyError(f"成员不存在: {member_id}")
    del members[member_id]
    doc["members"] = members
    return save_acl(doc)


def enable_acl(enabled: bool = True, *, require_principal: bool | None = None) -> dict[str, Any]:
    doc = load_acl(force=True)
    doc["enabled"] = enabled
    if require_principal is not None:
        doc["require_principal"] = require_principal
    return save_acl(doc)


def principal_acl_status(principal_id: str | None) -> dict[str, Any]:
    """SSO / Bearer 主体在组织 ACL 中的状态（产品路径查询）。"""
    doc = load_acl()
    pid = (principal_id or "").strip()
    member = (doc.get("members") or {}).get(pid) if pid else None
    return {
        "enabled": bool(doc.get("enabled")),
        "require_principal": bool(doc.get("require_principal")),
        "principal_id": pid or None,
        "is_member": bool(member),
        "roles": list((member or {}).get("roles") or []) if member else [],
        "name": (member or {}).get("name") if member else None,
    }


def ensure_sso_member(
    principal_id: str,
    *,
    name: str = "",
    roles: list[str] | None = None,
    update_existing: bool = False,
) -> dict[str, Any]:
    """把 SSO 主体写入组织 ACL（已存在则默认保留角色）。"""
    pid = (principal_id or "").strip()
    if not pid:
        raise ValueError("principal_id 不能为空")
    doc = load_acl(force=True)
    members = dict(doc.get("members") or {})
    existing = members.get(pid)
    if existing and not update_existing:
        return {
            "ok": True,
            "created": False,
            "member_id": pid,
            "member": existing,
            "acl": doc,
            "status": principal_acl_status(pid),
        }
    role_list = list(roles or (existing or {}).get("roles") or ["operator"])
    members[pid] = {
        "name": (name or "").strip() or (existing or {}).get("name") or pid,
        "roles": role_list,
    }
    doc["members"] = members
    saved = save_acl(doc)
    return {
        "ok": True,
        "created": existing is None,
        "member_id": pid,
        "member": members[pid],
        "acl": saved,
        "status": principal_acl_status(pid),
    }
