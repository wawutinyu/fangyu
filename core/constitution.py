"""AI 社会宪法 — 规则加载、执行前检查、审计日志"""
from __future__ import annotations

import hashlib
import json
import time
from typing import Any

from .config import DATA_DIR

CONSTITUTION_FILE = DATA_DIR / "constitution.json"
AUDIT_FILE = DATA_DIR / "audit.log"

DEFAULT_CONSTITUTION: dict[str, Any] = {
    "version": "1.0",
    "name": "fangyu 基本宪法",
    "enabled": True,
    "values": [
        "不得伤害人类",
        "不得泄露用户隐私",
        "必须为人类服务",
    ],
    "forbidden_actions": [
        "shell_execution",
        "file_operations",
    ],
    "forbidden_node_types": [],
    "require_audit": True,
    "policies": [],
}


class ConstitutionViolation(ValueError):
    """违反宪法约束。"""

    def __init__(self, rule: str, message: str, *, context: dict | None = None):
        self.rule = rule
        self.context = context or {}
        super().__init__(message)

    def to_dict(self) -> dict:
        return {
            "type": "constitution",
            "rule": self.rule,
            "message": str(self),
            "violations": self.context.get("violations", []),
            "context": self.context.get("context"),
        }


def violation_to_dict(exc: Exception) -> dict:
    if hasattr(exc, "to_dict") and callable(exc.to_dict):
        return exc.to_dict()
    return {"type": "unknown", "message": str(exc)}


def _ensure_files():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CONSTITUTION_FILE.exists():
        CONSTITUTION_FILE.write_text(
            json.dumps(DEFAULT_CONSTITUTION, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def load_constitution() -> dict[str, Any]:
    _ensure_files()
    try:
        data = json.loads(CONSTITUTION_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return {**DEFAULT_CONSTITUTION, **data}
    except (json.JSONDecodeError, OSError):
        pass
    return dict(DEFAULT_CONSTITUTION)


def save_constitution(data: dict[str, Any]) -> dict[str, Any]:
    _ensure_files()
    merged = {**DEFAULT_CONSTITUTION, **data}
    CONSTITUTION_FILE.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    audit_event("constitution_updated", {"name": merged.get("name"), "version": merged.get("version")})
    return merged


def _read_last_audit_hash() -> str:
    if not AUDIT_FILE.exists():
        return "0" * 64
    try:
        for line in reversed([ln for ln in AUDIT_FILE.read_text(encoding="utf-8").splitlines() if ln.strip()]):
            entry = json.loads(line)
            if entry.get("hash"):
                return str(entry["hash"])
        return "0" * 64
    except (json.JSONDecodeError, OSError):
        return "0" * 64


def audit_event(event_type: str, details: dict | None = None) -> None:
    constitution = load_constitution()
    if not constitution.get("require_audit", True):
        return
    prev_hash = _read_last_audit_hash()
    payload = {
        "ts": time.time(),
        "event": event_type,
        "details": details or {},
        "prev_hash": prev_hash,
    }
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    entry_hash = hashlib.sha256(f"{prev_hash}:{canonical}".encode()).hexdigest()
    entry = {**payload, "hash": entry_hash}
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with AUDIT_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        pass
    try:
        from .collaboration import fanout_audit
        fanout_audit(event_type, details)
    except Exception:
        pass


def verify_audit_chain(limit: int = 200) -> dict[str, Any]:
    """验证审计链完整性，返回 {valid, checked, broken_at}。

    ``limit>0`` 时只检查最近 N 条。若日志比窗口更长，窗口不从创世哈希起步，
    会以窗口内首条带 hash 记录的 ``prev_hash`` 为锚点，只验证窗口内连续性
    （避免律面板 ``?limit=200`` 对长日志误报 ``prev_hash_mismatch``）。
    """
    if not AUDIT_FILE.exists():
        return {"valid": True, "checked": 0, "broken_at": None, "legacy_skipped": 0, "window_truncated": False}
    all_lines = [ln for ln in AUDIT_FILE.read_text(encoding="utf-8").splitlines() if ln.strip()]
    truncated = bool(limit > 0 and len(all_lines) > limit)
    lines = all_lines[-limit:] if limit > 0 else all_lines
    prev = "0" * 64
    checked = 0
    legacy_skipped = 0
    anchored = not truncated
    for i, line in enumerate(lines):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            return {
                "valid": False,
                "checked": i,
                "broken_at": i,
                "reason": "invalid_json",
                "legacy_skipped": legacy_skipped,
                "window_truncated": truncated,
            }
        if "hash" not in entry:
            legacy_skipped += 1
            continue
        if not anchored:
            prev = str(entry.get("prev_hash") or ("0" * 64))
            anchored = True
        if entry.get("prev_hash") != prev:
            return {
                "valid": False,
                "checked": checked,
                "broken_at": i,
                "reason": "prev_hash_mismatch",
                "legacy_skipped": legacy_skipped,
                "window_truncated": truncated,
            }
        payload = {k: entry[k] for k in ("ts", "event", "details", "prev_hash") if k in entry}
        canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        expected = hashlib.sha256(f"{prev}:{canonical}".encode()).hexdigest()
        if entry.get("hash") != expected:
            return {
                "valid": False,
                "checked": checked,
                "broken_at": i,
                "reason": "hash_mismatch",
                "legacy_skipped": legacy_skipped,
                "window_truncated": truncated,
            }
        prev = entry.get("hash", prev)
        checked += 1
    return {
        "valid": True,
        "checked": checked,
        "broken_at": None,
        "legacy_skipped": legacy_skipped,
        "window_truncated": truncated,
    }


def read_audit_log(limit: int = 50) -> list[dict]:
    if not AUDIT_FILE.exists():
        return []
    lines = AUDIT_FILE.read_text(encoding="utf-8").splitlines()
    entries: list[dict] = []
    for line in reversed(lines[-limit:]):
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return entries


def _node_payload(node: dict) -> dict:
    data = node.get("data")
    if isinstance(data, dict):
        return data
    return node


def _node_type(node: dict) -> str:
    payload = _node_payload(node)
    return payload.get("originType") or node.get("type") or ""


def _node_config(node: dict) -> dict:
    payload = _node_payload(node)
    cfg = payload.get("config") or node.get("config") or {}
    return cfg if isinstance(cfg, dict) else {}


def _iter_nodes(nodes: list) -> list[dict]:
    collected: list[dict] = []

    def walk(items: list):
        for node in items or []:
            if not isinstance(node, dict):
                continue
            collected.append(node)
            payload = _node_payload(node)
            inner = payload.get("inner_nodes") or node.get("inner_nodes") or []
            if inner:
                walk(inner)

    walk(nodes)
    return collected


def _get_field(obj: dict, path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _node_view(node: dict) -> dict:
    """扁平视图，供策略 field 路径读取。"""
    payload = _node_payload(node)
    cfg = _node_config(node)
    return {
        "id": node.get("id", ""),
        "type": _node_type(node),
        "label": payload.get("label") or node.get("name") or node.get("id", ""),
        "config": cfg,
        "originType": _node_type(node),
    }


def _match_when(node: dict, when: dict) -> bool:
    if not isinstance(when, dict):
        return True
    view = _node_view(node)
    node_type = view["type"]
    if "node_type" in when and when["node_type"] != node_type:
        return False
    if "node_type_in" in when:
        allowed = when["node_type_in"]
        if not isinstance(allowed, list) or node_type not in allowed:
            return False
    return True


def _eval_assert(node: dict, spec: dict) -> tuple[bool, Any]:
    """返回 (passed, actual_value)。"""
    if not isinstance(spec, dict):
        return True, None
    field = spec.get("field", "")
    actual = _get_field(_node_view(node), field)
    op = spec.get("op", "truthy")
    expected = spec.get("value")

    if op == "truthy":
        return bool(actual), actual
    if op == "nonempty":
        return bool(str(actual or "").strip()), actual
    if op == "eq":
        return actual == expected, actual
    if op == "neq":
        return actual != expected, actual
    if op == "in":
        return actual in (expected or []), actual
    if op == "not_in":
        return actual not in (expected or []), actual
    if op == "contains":
        return expected is not None and str(expected) in str(actual or ""), actual
    if op == "not_contains":
        return expected is None or str(expected) not in str(actual or ""), actual
    if op == "gt":
        try:
            return float(actual) > float(expected), actual
        except (TypeError, ValueError):
            return False, actual
    if op == "gte":
        try:
            return float(actual) >= float(expected), actual
        except (TypeError, ValueError):
            return False, actual
    if op == "lt":
        try:
            return float(actual) < float(expected), actual
        except (TypeError, ValueError):
            return False, actual
    if op == "lte":
        try:
            return float(actual) <= float(expected), actual
        except (TypeError, ValueError):
            return False, actual
    return True, actual


def _format_policy_message(template: str, *, actual: Any, node: dict) -> str:
    view = _node_view(node)
    return (
        template.replace("{actual}", str(actual))
        .replace("{value}", str(actual))
        .replace("{node_type}", view["type"])
        .replace("{label}", view["label"])
        .replace("{node_id}", view["id"])
    )


def evaluate_policies(nodes: list, *, context: str = "flow") -> list[dict]:
    """评估可组合 policies，返回违规列表。"""
    constitution = load_constitution()
    if not constitution.get("enabled", True):
        return []

    policies = constitution.get("policies") or []
    violations: list[dict] = []

    for node in _iter_nodes(nodes):
        for policy in policies:
            if not isinstance(policy, dict) or not policy.get("enabled", True):
                continue
            when = policy.get("when") or {}
            if not _match_when(node, when):
                continue
            passed, actual = _eval_assert(node, policy.get("assert") or {})
            if passed:
                continue
            on_fail = policy.get("on_fail") or {}
            severity = str(on_fail.get("action") or policy.get("action") or "deny").lower()
            if severity not in ("warn", "deny"):
                severity = "deny"
            view = _node_view(node)
            violations.append({
                "rule": on_fail.get("rule") or policy.get("id") or "policy",
                "severity": severity,
                "policy_id": policy.get("id"),
                "node_id": view["id"],
                "node_type": view["type"],
                "label": view["label"],
                "actual": actual,
                "message": _format_policy_message(
                    on_fail.get("message") or f"违反策略 {policy.get('id')}",
                    actual=actual,
                    node=node,
                ),
                "context": context,
            })
    return violations


def scan_flow(nodes: list, *, context: str = "flow") -> list[dict]:
    """扫描 Flow 是否含违宪节点/工具，返回违规列表。"""
    constitution = load_constitution()
    if not constitution.get("enabled", True):
        return []

    forbidden_actions = set(constitution.get("forbidden_actions") or [])
    forbidden_types = set(constitution.get("forbidden_node_types") or [])
    violations: list[dict] = []

    for node in _iter_nodes(nodes):
        node_id = node.get("id", "")
        origin_type = _node_type(node)
        config = _node_config(node)
        label = _node_payload(node).get("label") or node.get("name") or node_id

        if origin_type in forbidden_types:
            violations.append({
                "rule": "forbidden_node_type",
                "severity": "deny",
                "node_id": node_id,
                "node_type": origin_type,
                "label": label,
                "message": f"节点类型 '{origin_type}' 被宪法禁止",
                "context": context,
            })

        if origin_type == "tool-call":
            tool_name = str(config.get("tool_name") or "").strip()
            if tool_name in forbidden_actions:
                violations.append({
                    "rule": "forbidden_action",
                    "severity": "deny",
                    "node_id": node_id,
                    "node_type": origin_type,
                    "tool_name": tool_name,
                    "label": label,
                    "message": f"工具 '{tool_name}' 被宪法禁止",
                    "context": context,
                })

    violations.extend(evaluate_policies(nodes, context=context))
    return violations


def classify_violations(violations: list[dict]) -> tuple[list[dict], list[dict]]:
    deny: list[dict] = []
    warn: list[dict] = []
    for v in violations:
        if str(v.get("severity", "deny")).lower() == "warn":
            warn.append(v)
        else:
            deny.append(v)
    return deny, warn


def apply_flow_governance(nodes: list, *, context: str = "flow") -> dict[str, list[dict]]:
    """扫描 Flow，返回 deny / warn 分级结果。"""
    all_v = scan_flow(nodes, context=context)
    deny, warn = classify_violations(all_v)
    if warn:
        audit_event("constitution_warning", {"context": context, "warnings": warn})
    return {"deny": deny, "warn": warn, "all": all_v}


def assert_flow_allowed(nodes: list, *, context: str = "flow") -> list[dict]:
    """仅 deny 级违规会抛错；返回 warn 列表供调用方附带在结果中。"""
    gov = apply_flow_governance(nodes, context=context)
    if gov["deny"]:
        first = gov["deny"][0]
        audit_event("constitution_violation", {"context": context, "violations": gov["deny"]})
        raise ConstitutionViolation(
            first.get("rule", "constitution"),
            first.get("message", "违反宪法约束"),
            context={"violations": gov["deny"], "warnings": gov["warn"], "context": context},
        )
    return gov["warn"]


def check_tool_allowed(tool_name: str, *, context: str = "tool") -> None:
    constitution = load_constitution()
    if not constitution.get("enabled", True):
        return
    forbidden = set(constitution.get("forbidden_actions") or [])
    if tool_name in forbidden:
        audit_event("constitution_violation", {
            "context": context,
            "tool_name": tool_name,
            "rule": "forbidden_action",
        })
        raise ConstitutionViolation(
            "forbidden_action",
            f"工具 '{tool_name}' 被宪法禁止（{constitution.get('name', 'constitution')}）",
            context={"tool_name": tool_name, "context": context},
        )


def check_agent_action(*, agent: str, skill_id: str = "", context: str = "a2a") -> None:
    """Agent 调用前的轻量检查（主要依赖 flow 扫描）。"""
    constitution = load_constitution()
    if not constitution.get("enabled", True):
        return
    audit_event("agent_action", {"agent": agent, "skill_id": skill_id, "context": context})
