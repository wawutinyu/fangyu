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
    if not template:
        return ""
    ctx = {}
    ctx.update(external_inputs)
    ctx.update(inputs)
    ctx.update(global_vars)
    for node_outputs in all_outputs.values():
        if isinstance(node_outputs, dict):
            ctx.update(node_outputs)

    def replacer(m):
        key = m.group(1).strip()
        val = _resolve_path(ctx, key)
        return str(val) if val is not None else "{{" + key + "}}"

    return re.sub(r"\{\{([^}]+)\}\}", replacer, template)
