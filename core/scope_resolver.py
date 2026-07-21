"""Q0：三层变量 scope + API Key exclusion。

兼容旧 {{var}} flat 查找；{{env.x}} / {{input.x}} / {{node.x}} 优先。
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any


_DEFAULT_EXCLUSION = [
    "openai_api_key",
    "deepseek_api_key",
    "anthropic_api_key",
    "api_key",
    "secret",
    "password",
    "private_key",
    "access_token",
    "shared_secret",
    "webhook_secret",
]

_SECRET_KEY_RE = re.compile(
    r"(api[_-]?key|secret|password|token|private[_-]?key|credential)",
    re.IGNORECASE,
)


@dataclass
class ScopeConfig:
    env_exclusion: list[str] = field(default_factory=lambda: list(_DEFAULT_EXCLUSION))
    token_budget: int = 8000
    truncation_strategy: str = "tail"  # tail | middle | head
    enable_env_scope: bool = True
    enable_input_scope: bool = True
    enable_node_scope: bool = True
    # 找不到变量时：compat 保留 {{var}}；strict 返回空串
    missing_mode: str = "compat"


@dataclass
class TemplateContext:
    env: dict[str, Any]
    inputs: dict[str, Any]
    node_outputs: dict[str, Any]
    flat: dict[str, Any] = field(default_factory=dict)


def estimate_tokens(text: str) -> int:
    """粗估 token：中文≈2、其它≈0.3。"""
    if not text:
        return 0
    cn = sum(1 for c in text if "\u4e00" <= c <= "\u9fff")
    other = max(0, len(text) - cn)
    return int(cn * 2 + other * 0.3) + 1


def _is_excluded(key: str, exclusion: list[str]) -> bool:
    leaf = key.split(".")[-1].strip().lower()
    full = key.strip().lower()
    for item in exclusion:
        it = (item or "").strip().lower()
        if not it:
            continue
        if leaf == it or full == it or leaf.endswith(it) or it in leaf:
            return True
    return bool(_SECRET_KEY_RE.search(leaf))


def _resolve_path(obj: Any, path: str) -> Any:
    if obj is None or not path:
        return None
    cur = obj
    for p in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            return None
    return cur


def _filter_env(env: dict[str, Any], exclusion: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in (env or {}).items():
        if _is_excluded(str(k), exclusion):
            continue
        out[k] = v
    return out


def build_template_context(
    all_outputs: dict,
    inputs: dict,
    external_inputs: dict,
    global_vars: dict,
    config: ScopeConfig | None = None,
) -> TemplateContext:
    cfg = config or ScopeConfig()
    flat: dict[str, Any] = {}
    flat.update(external_inputs or {})
    flat.update(inputs or {})
    flat.update(global_vars or {})
    for node_outputs in (all_outputs or {}).values():
        if isinstance(node_outputs, dict):
            flat.update(node_outputs)

    node_flat: dict[str, Any] = {}
    for node_id, node_outputs in (all_outputs or {}).items():
        if isinstance(node_outputs, dict):
            node_flat[str(node_id)] = node_outputs
            node_flat.update(node_outputs)

    env_raw = dict(global_vars or {})
    return TemplateContext(
        env=_filter_env(env_raw, cfg.env_exclusion),
        inputs={**(external_inputs or {}), **(inputs or {})},
        node_outputs=node_flat,
        flat=flat,
    )


def _lookup(key: str, ctx: TemplateContext, cfg: ScopeConfig) -> Any | None:
    key = (key or "").strip()
    if not key:
        return None

    if key.startswith("env.") and cfg.enable_env_scope:
        sub = key[4:]
        if _is_excluded(sub, cfg.env_exclusion) or _is_excluded(key, cfg.env_exclusion):
            return ""
        val = _resolve_path(ctx.env, sub)
        return "" if val is None and _is_excluded(sub, cfg.env_exclusion) else val

    if key.startswith("input.") and cfg.enable_input_scope:
        return _resolve_path(ctx.inputs, key[6:])

    if key.startswith("node.") and cfg.enable_node_scope:
        return _resolve_path(ctx.node_outputs, key[5:])

    # flat 兼容：密钥字段永不拼进 prompt
    if _is_excluded(key, cfg.env_exclusion):
        return ""
    return _resolve_path(ctx.flat, key)


def truncate_to_budget(text: str, budget: int, strategy: str = "tail") -> str:
    if budget <= 0 or estimate_tokens(text) <= budget:
        return text
    # 粗按字符截：budget tokens ≈ budget/0.5 chars 上限；用二分估
    lo, hi = 0, len(text)
    marker = "\n[TRUNCATED]"
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if strategy == "head":
            cand = text[:mid] + marker
        elif strategy == "middle":
            keep = mid // 2
            cand = text[:keep] + marker + text[-(mid - keep) :]
        else:
            cand = text[-mid:] if mid < len(text) else text
            if mid < len(text):
                cand = marker + cand
        if estimate_tokens(cand) <= budget:
            lo = mid
        else:
            hi = mid - 1
    mid = lo
    if strategy == "head":
        return text[:mid] + marker
    if strategy == "middle":
        keep = mid // 2
        return text[:keep] + marker + text[-(mid - keep) :]
    return (marker + text[-mid:]) if mid < len(text) else text


def resolve_template(
    template: str,
    ctx: TemplateContext,
    config: ScopeConfig | None = None,
) -> str:
    """替换 {{env.x}} / {{input.x}} / {{node.x}}；兼容 flat {{x}}。"""
    if not template:
        return ""
    cfg = config or ScopeConfig()

    def replacer(m: re.Match) -> str:
        key = m.group(1).strip()
        val = _lookup(key, ctx, cfg)
        if val is None:
            if cfg.missing_mode == "strict":
                return ""
            return "{{" + key + "}}"
        return str(val)

    out = re.sub(r"\{\{([^}]+)\}\}", replacer, template)
    return truncate_to_budget(out, cfg.token_budget, cfg.truncation_strategy)


def resolve_smart_template(
    template: str,
    all_outputs: dict,
    inputs: dict,
    external_inputs: dict,
    global_vars: dict,
    config: ScopeConfig | None = None,
) -> str:
    """供 engine.utils._smart_template 委托。"""
    raw = (os.getenv("FANGYU_SCOPE_MODE") or "compat").strip().lower()
    cfg = config or ScopeConfig()
    if raw in ("off", "0", "false"):
        # 紧急回滚：旧 flat 行为，但仍排除密钥
        flat: dict[str, Any] = {}
        flat.update(external_inputs or {})
        flat.update(inputs or {})
        flat.update(global_vars or {})
        for node_outputs in (all_outputs or {}).values():
            if isinstance(node_outputs, dict):
                flat.update(node_outputs)

        def old_replacer(m: re.Match) -> str:
            key = m.group(1).strip()
            if _is_excluded(key, cfg.env_exclusion):
                return ""
            val = _resolve_path(flat, key)
            return str(val) if val is not None else "{{" + key + "}}"

        return re.sub(r"\{\{([^}]+)\}\}", old_replacer, template or "")

    if raw == "strict":
        cfg.missing_mode = "strict"
    ctx = build_template_context(all_outputs, inputs, external_inputs, global_vars, cfg)
    return resolve_template(template, ctx, cfg)
