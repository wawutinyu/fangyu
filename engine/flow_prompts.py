"""Flow 画布全局提示词注入 — 序内预览与行端 run_flow 共用。"""
from __future__ import annotations

from typing import Any


def inject_canvas_prompts(global_vars: dict[str, Any]) -> dict[str, Any]:
    """将 globalPrompts 扁平化到 global_vars，供 LLM 节点 fallback。"""
    gp = global_vars.get("globalPrompts")
    if not isinstance(gp, dict):
        return global_vars

    sys_p = gp.get("system_prompt") or ""
    user_tpl = gp.get("user_prompt_template") or ""
    ctx = gp.get("context") or ""

    if sys_p and not global_vars.get("_global_system_prompt"):
        global_vars["_global_system_prompt"] = sys_p
    if user_tpl and not global_vars.get("_global_user_template"):
        global_vars["_global_user_template"] = user_tpl
    if ctx and not global_vars.get("_global_context"):
        global_vars["_global_context"] = ctx

    return global_vars
