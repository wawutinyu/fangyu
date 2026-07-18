"""Bundle Chat — 本机对话壳：加载 bundle → harness 多轮 → 写会话。"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Callable, Awaitable

from fangyu.core.agent_bundle import activate_bundle_runtime_context, load_agent_bundle
from fangyu.engine.bundle_session import append_chat, load_chat
from fangyu.engine.bundle_tools import coding_toolbelt
from fangyu.engine.executor import register_executors
from fangyu.engine.scheduler import run_flow
from fangyu.engine.workspace import bind_external_workspace, init_bundle_workspace


async def _run_default_skill(
    bundle: dict[str, Any],
    text: str,
    *,
    llm: Callable[[list[dict[str, str]]], Awaitable[str]] | None = None,
) -> dict[str, Any]:
    skills = bundle.get("skills") or {}
    skill_id = "default" if "default" in skills else (next(iter(skills), "") if skills else "")
    flow = skills.get(skill_id) if skill_id else None
    if not flow or not flow.get("nodes"):
        return {"success": False, "result": "Bundle 无可用 skill", "error": "no skill"}

    global_vars: dict[str, Any] = {
        "_agent_name": (bundle.get("agent_card") or {}).get("name") or "agent",
        "_skill_id": skill_id,
    }
    if llm is not None:
        global_vars["_agent_loop_llm"] = llm

    result = await run_flow(
        nodes=flow.get("nodes") or [],
        edges=flow.get("edges") or [],
        external_inputs={"query": text, "message": text, "input": text},
        global_vars=global_vars,
    )
    rows = result.get("results") or []
    # prefer agent-loop outputs
    loop_row = next((r for r in rows if r.get("type") == "agent-loop"), None)
    out = (loop_row or (rows[-1] if rows else {})).get("outputs") or {}
    summary = out.get("result")
    if summary is None and result.get("success"):
        summary = "(完成，无文本输出)"
    if not result.get("success"):
        err = result.get("error") or out.get("error") or "执行失败"
        return {
            "success": False,
            "result": str(summary) if summary else None,
            "error": str(err),
            "outputs": out,
            "flow": result,
        }
    return {
        "success": True,
        "result": str(summary) if summary is not None else "",
        "error": out.get("error"),
        "outputs": out,
        "flow": result,
    }


def prepare_bundle_chat(
    bundle_dir: str | Path,
    *,
    workspace: str | Path | None = None,
) -> dict[str, Any]:
    """激活包内 DATA_DIR + workspace，返回 bundle 上下文。"""
    register_executors()
    root = Path(bundle_dir).resolve()
    bundle = load_agent_bundle(root)
    activate_bundle_runtime_context(root)
    if workspace:
        bind_external_workspace(root, workspace)
        ws = init_bundle_workspace(root, workspace_override=workspace)
    else:
        ws = init_bundle_workspace(root)
    return {"bundle": bundle, "root": root, "workspace": ws.root}


def chat_once(
    bundle_dir: str | Path,
    message: str,
    *,
    workspace: str | Path | None = None,
    llm: Callable[[list[dict[str, str]]], Awaitable[str]] | None = None,
    persist: bool = True,
) -> dict[str, Any]:
    """单轮对话（内部可多轮 tool-loop）。"""
    ctx = prepare_bundle_chat(bundle_dir, workspace=workspace)
    text = (message or "").strip()
    if not text:
        return {"success": False, "result": None, "error": "空消息"}
    if persist:
        append_chat("user", text)
    out = asyncio.run(_run_default_skill(ctx["bundle"], text, llm=llm))
    reply = out.get("result") or out.get("error") or "(无输出)"
    if persist:
        append_chat(
            "assistant",
            str(reply),
            success=bool(out.get("success")),
            error=out.get("error"),
            turns=(out.get("outputs") or {}).get("turns"),
        )
    return {
        **out,
        "workspace": str(ctx["workspace"]),
        "agent": (ctx["bundle"].get("agent_card") or {}).get("name"),
        "history_len": len(load_chat()),
    }


def format_failure_hint(err: str | None) -> str:
    raw = (err or "").strip()
    if not raw:
        return ""
    low = raw.lower()
    if "api key" in low or "未配置" in raw:
        return (
            f"{raw}\n下一步：在环境变量或 Bundle 运行环境配置 DEEPSEEK_API_KEY / OPENAI_API_KEY。"
        )
    if "workspace" in low or "越界" in raw:
        return f"{raw}\n下一步：检查 --workspace 是否指向可写项目目录。"
    return raw
