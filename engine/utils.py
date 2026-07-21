import re
from typing import Any


def _resolve_path(obj, path):
    if obj is None or not path:
        return None
    parts = path.split(".")
    cur = obj
    for p in parts:
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            return None
    return cur


def _smart_template(template, all_outputs, inputs, external_inputs, global_vars):
    """Prompt 模板替换：Q0 起走三层 scope + Key exclusion（见 core.scope_resolver）。"""
    try:
        from fangyu.core.scope_resolver import resolve_smart_template

        return resolve_smart_template(template, all_outputs, inputs, external_inputs, global_vars)
    except Exception:
        # fail-open：解析器异常时回退旧 flat（仍尽量挡密钥）
        if not template:
            return ""
        ctx = {}
        ctx.update(external_inputs or {})
        ctx.update(inputs or {})
        ctx.update(global_vars or {})
        for node_outputs in (all_outputs or {}).values():
            if isinstance(node_outputs, dict):
                ctx.update(node_outputs)

        def replacer(m):
            key = m.group(1).strip()
            leaf = key.split(".")[-1].lower()
            if any(s in leaf for s in ("api_key", "secret", "password", "token", "private_key")):
                return ""
            val = _resolve_path(ctx, key)
            return str(val) if val is not None else "{{" + key + "}}"

        return re.sub(r"\{\{([^}]+)\}\}", replacer, template)
