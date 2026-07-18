"""编排边 ACL — topology 上 caller→callee 谁可调谁。

默认放行：边上无 acl / 无匹配规则 → allow。
有声明则 fail-closed，并写 audit `edge_acl_violation`。

边声明示例::

    {
      "source": "scout",
      "target": "writer",
      "type": "depends",
      "acl": {
        "allowed_callers": ["scout"],
        "deny_callers": []
      }
    }

顶层可选::

    "edge_acl": {"enabled": true}   # false 时整表旁路
"""
from __future__ import annotations

from typing import Any

from fangyu.core.topology_export import collect_depends_edges
from fangyu.engine.trust_runtime import TrustViolation


class TopologyACLError(TrustViolation):
    """拓扑边调用被拒绝。"""

    def __init__(self, message: str, *, context: dict[str, Any] | None = None):
        super().__init__("edge_acl", message, context=context or {})

    def to_dict(self) -> dict:
        d = super().to_dict()
        d["type"] = "edge_acl"
        return d


def edge_acl_enabled(topology: dict[str, Any] | None) -> bool:
    if not topology or not isinstance(topology, dict):
        return False
    cfg = topology.get("edge_acl")
    if isinstance(cfg, dict) and cfg.get("enabled") is False:
        return False
    # 有任意边带 acl，或顶层 enabled=true，或 rules 非空 → 启用检查
    if isinstance(cfg, dict) and cfg.get("enabled") is True:
        return True
    if isinstance(cfg, dict) and (cfg.get("rules") or []):
        return True
    for e in collect_depends_edges(topology):
        if isinstance(e.get("acl"), dict) and e["acl"]:
            return True
    return False


def _norm_id(value: Any) -> str:
    return str(value or "").strip()


def _caller_matches(caller: str, patterns: list[Any]) -> bool:
    c = _norm_id(caller)
    for p in patterns or []:
        pat = _norm_id(p)
        if not pat:
            continue
        if pat == "*":
            return True
        if pat == c:
            return True
    return False


def _edge_decision(caller: str, acl: dict[str, Any]) -> str | None:
    """返回 'allow' | 'deny' | None(无明确意见)。"""
    if not isinstance(acl, dict) or not acl:
        return None
    deny = list(acl.get("deny_callers") or acl.get("deny") or [])
    allow = list(acl.get("allowed_callers") or acl.get("allow") or [])
    if deny and _caller_matches(caller, deny):
        return "deny"
    if allow:
        return "allow" if _caller_matches(caller, allow) else "deny"
    return None


def lookup_inbound_acls(
    topology: dict[str, Any],
    callee: str,
) -> list[dict[str, Any]]:
    """指向 callee 的边 acl + 顶层 rules。"""
    tgt = _norm_id(callee)
    out: list[dict[str, Any]] = []
    if not tgt:
        return out

    cfg = topology.get("edge_acl") if isinstance(topology.get("edge_acl"), dict) else {}
    for rule in cfg.get("rules") or []:
        if not isinstance(rule, dict):
            continue
        r_callee = _norm_id(rule.get("callee") or rule.get("target"))
        if r_callee not in (tgt, "*"):
            continue
        effect = str(rule.get("effect") or "allow").lower()
        r_caller = _norm_id(rule.get("caller") or rule.get("source")) or "*"
        if effect == "deny":
            out.append({"deny_callers": [r_caller], "from": "rule"})
        else:
            out.append({"allowed_callers": [r_caller], "from": "rule"})

    for e in collect_depends_edges(topology):
        if _norm_id(e.get("target")) != tgt:
            continue
        acl = e.get("acl")
        if isinstance(acl, dict) and acl:
            out.append(dict(acl))
    return out


def lookup_edge_acl(
    topology: dict[str, Any],
    caller: str,
    callee: str,
) -> dict[str, Any] | None:
    """兼容旧名：合并指向 callee 的策略为一次判定用的 acl 视图。"""
    inbound = lookup_inbound_acls(topology, callee)
    if not inbound:
        return None
    deny: list[str] = []
    allow: list[str] = []
    for acl in inbound:
        deny.extend(str(x) for x in (acl.get("deny_callers") or acl.get("deny") or []) if x)
        allow.extend(str(x) for x in (acl.get("allowed_callers") or acl.get("allow") or []) if x)
    merged: dict[str, Any] = {}
    if deny:
        merged["deny_callers"] = deny
    if allow:
        merged["allowed_callers"] = allow
    return merged or None


def assert_topology_edge_allowed(
    caller: str,
    callee: str,
    *,
    topology: dict[str, Any] | None,
    principal: str | None = None,
) -> None:
    """校验 caller 是否可调 callee。无声明则放行。

    规则（指向 callee 的边 / 顶层 rules）：
    - deny_callers 命中 → 拒绝
    - 存在 allowed_callers 且均未命中 → 拒绝
    - 仅 deny 未命中且无 allow 列表 → 放行
    """
    if not topology or not edge_acl_enabled(topology):
        return
    src = _norm_id(caller) or "user"
    tgt = _norm_id(callee)
    if not tgt or src == tgt:
        return

    inbound = lookup_inbound_acls(topology, tgt)
    if not inbound:
        return

    has_allow_list = False
    allow_hit = False
    for acl in inbound:
        decision = _edge_decision(src, acl)
        if decision == "deny":
            from fangyu.core.constitution import audit_event
            ctx = {
                "caller": src,
                "callee": tgt,
                "principal": principal,
                "acl": acl,
                "rule": "edge_acl_deny",
            }
            audit_event("edge_acl_violation", ctx)
            raise TopologyACLError(
                f"编排边 ACL 拒绝：'{src}' 不可调用 '{tgt}'",
                context=ctx,
            )
        allow = list(acl.get("allowed_callers") or acl.get("allow") or [])
        if allow:
            has_allow_list = True
            if _caller_matches(src, allow):
                allow_hit = True

    if has_allow_list and not allow_hit:
        from fangyu.core.constitution import audit_event
        ctx = {
            "caller": src,
            "callee": tgt,
            "principal": principal,
            "acl": {"allowed_callers": "unmatched"},
            "rule": "edge_acl_allow_miss",
        }
        audit_event("edge_acl_violation", ctx)
        raise TopologyACLError(
            f"编排边 ACL 拒绝：'{src}' 不在 '{tgt}' 的允许调用方列表中",
            context=ctx,
        )


def assert_stage_handoff_allowed(
    callers: list[str],
    callees: list[str],
    *,
    topology: dict[str, Any],
    principal: str | None = None,
) -> None:
    """波次切换：对上一波每个 caller → 本波每个 callee 校验（无边 acl 则放行）。"""
    if not edge_acl_enabled(topology):
        return
    prev = [c for c in (_norm_id(x) for x in callers) if c] or ["user"]
    nxt = [c for c in (_norm_id(x) for x in callees) if c]
    for caller in prev:
        for callee in nxt:
            assert_topology_edge_allowed(
                caller, callee, topology=topology, principal=principal,
            )
