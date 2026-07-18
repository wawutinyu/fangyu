"""真 Agentic Loop — LLM ↔ 工具多轮，直到 done 或达 max_turns。

协议（每轮一个 JSON 对象，无 Markdown 围栏）：
  {"action":"plan","steps":["步骤1","步骤2",...]}   # 长任务先规划（可更新）
  {"action":"tool","name":"<tool>","args":{...}}
  {"action":"done","result":"<给用户的结论>"}

复杂仓稳定性：工具输出截断、重复调用告警、规划进度回灌、上下文压缩。
"""
from __future__ import annotations

import json
import re
from collections.abc import Awaitable, Callable
from typing import Any

ToolFn = Callable[..., Any]
LlmFn = Callable[[list[dict[str, str]]], Awaitable[str]]

DEFAULT_SYSTEM = (
    "你是可调用工具的执行 Agent。每轮只输出一个 JSON 对象，不要 Markdown 围栏。\n"
    '规划: {"action":"plan","steps":["...","..."]}\n'
    '调用工具: {"action":"tool","name":"<name>","args":{...}}\n'
    '结束任务: {"action":"done","result":"<给用户的结论>"}\n'
    "可用工具会在用户消息中列出。"
)

CODING_SYSTEM = (
    "你是方隅 OpenCode harness：在绑定工作区内完成编码任务。\n"
    "每轮只输出一个 JSON 对象，不要 Markdown 围栏。\n"
    '1) 规划（多步任务必须先 plan，可随时用新 plan 修正）:\n'
    '   {"action":"plan","steps":["探索相关文件","修改 A","跑验证","总结"]}\n'
    '2) 工具: {"action":"tool","name":"<name>","args":{...}}\n'
    "   仓内: read/write/list/glob/grep/search/apply_patch/shell\n"
    "   外网: websearch / webfetch；不确定问人: question\n"
    "   技能: skill_load 按需加载工厂技能全文（目录已在 system 摘要里）\n"
    "   shell：只读命令可直接跑；写文件/安装等须 args.confirm=true（ask 策略）\n"
    "   MCP：mcp_current_time 等（若工具表中有）\n"
    '3) 委派子 Agent:\n'
    '   单个: {"action":"tool","name":"task","args":{"subagent_type":"explore|general|review|scout","prompt":"...","description":"短描述"}}\n'
    '   并行: {"action":"tool","name":"task","args":{"tasks":[{"subagent_type":"explore","prompt":"..."},{"subagent_type":"scout","prompt":"..."}]}}\n'
    '   后台: 同上并加 "background":true（完成后自动回灌；勿轮询）\n'
    '   可用 task_id 续跑。子 Agent 默认不能再 task。\n'
    '4) 结束: {"action":"done","result":"<结论>"}\n'
    "稳定性要求：\n"
    "- 陌生代码库可先 task explore，或自行 glob/grep/read，再改文件；禁止臆造路径。\n"
    "- 外部资料用 scout 或 websearch/webfetch；引用带来源。\n"
    "- 改完尽量验证（测试/最小命令）；失败则根据错误调整。\n"
    "- 一次改动尽量小而可验证；不要盲目重复同一调用。\n"
    "- 危险命令不要执行；只在工作区内读写。\n"
    "可用工具会在用户消息中列出。"
)

PLAN_SYSTEM = (
    "你是方隅 Plan 主角色：只读分析与规划，不直接改仓库。\n"
    "每轮只输出一个 JSON 对象，不要 Markdown 围栏。\n"
    '1) 可用 plan 列出步骤\n'
    '2) 只用只读工具: read/list/glob/grep/search/webfetch/websearch/question，以及只读 task（explore/review/scout）\n'
    '3) 禁止 write / apply_patch / shell / general 子 Agent\n'
    '4) 结束: {"action":"done","result":"<完整实施计划，含文件路径与验证建议>"}\n'
    "目标是产出可交给 Build 执行的计划，而不是自己改代码。\n"
    "可用工具会在用户消息中列出。"
)

_MAX_OBS_CHARS = 6000
_MAX_MESSAGES = 28  # system + user + 往返；超出则压缩


def _extract_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("empty LLM response")
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        raise ValueError(f"no JSON object in LLM response: {raw[:200]}")
    data = json.loads(m.group(0))
    if not isinstance(data, dict):
        raise ValueError("JSON root must be object")
    return data


def _invoke_tool(fn: ToolFn, args: dict[str, Any]) -> Any:
    return fn(**(args or {}))


def _truncate_obs(obs: str, limit: int = _MAX_OBS_CHARS) -> str:
    if len(obs) <= limit:
        return obs
    return obs[: limit - 80] + f"\n…(truncated, total {len(obs)} chars)"


def _compact_messages(messages: list[dict[str, str]], plan_steps: list[str]) -> list[dict[str, str]]:
    """保留 system + 首条 user + 规划摘要 + 最近若干轮。"""
    if len(messages) <= _MAX_MESSAGES:
        return messages
    system = messages[0]
    first_user = messages[1] if len(messages) > 1 else {"role": "user", "content": ""}
    tail = messages[-(_MAX_MESSAGES - 3) :]
    plan_note = {
        "role": "user",
        "content": "（上下文已压缩）当前计划：\n"
        + "\n".join(f"{i+1}. {s}" for i, s in enumerate(plan_steps or ["(无)"]))
        + "\n请继续执行，勿重复已完成步骤。",
    }
    return [system, first_user, plan_note, *tail]


def _plan_progress_nudge(plan_steps: list[str], turn: int, max_turns: int) -> str:
    remaining = max_turns - turn
    lines = "\n".join(f"{i+1}. {s}" for i, s in enumerate(plan_steps))
    return (
        f"进度提醒：还有约 {remaining} 轮。当前计划：\n{lines}\n"
        "请执行下一步（tool），或更新 plan，全部完成后 done。"
    )


async def run_agent_loop(
    *,
    goal: str,
    tools: dict[str, ToolFn],
    llm: LlmFn,
    max_turns: int = 8,
    system: str = DEFAULT_SYSTEM,
    require_plan: bool = False,
    enable_task: bool = False,
    task_depth: int = 0,
    max_task_depth: int = 1,
    task_max_turns: int | None = None,
    agent_mode: str = "build",
    shell_policy: str | None = None,
) -> dict[str, Any]:
    """执行多轮工具环（含可选长任务规划 / task 子 Agent）。

    agent_mode: build（默认可写）| plan（只读规划主角色）
    shell_policy: allow | ask | deny（默认 ask）
    """
    from fangyu.engine.shell_policy import reset_shell_policy, set_shell_policy

    if max_turns < 1:
        return {
            "success": False, "result": None, "turns": 0,
            "trace": [], "error": "max_turns < 1", "plan": [],
        }

    mode = (agent_mode or "build").strip().lower()
    if mode not in ("build", "plan"):
        mode = "build"

    policy_token = set_shell_policy(shell_policy or "ask")
    try:
        out = await _run_agent_loop_body(
            goal=goal,
            tools=tools,
            llm=llm,
            max_turns=max_turns,
            system=system,
            require_plan=require_plan,
            enable_task=enable_task,
            task_depth=task_depth,
            max_task_depth=max_task_depth,
            task_max_turns=task_max_turns,
            agent_mode=mode,
        )
        if task_depth == 0:
            try:
                from fangyu.engine.harness_trace import append_harness_trace, summarize_loop_result

                append_harness_trace(
                    summarize_loop_result(goal=goal, out=out, agent_mode=mode),
                )
            except Exception:
                pass
        return out
    finally:
        reset_shell_policy(policy_token)


async def _run_agent_loop_body(
    *,
    goal: str,
    tools: dict[str, ToolFn],
    llm: LlmFn,
    max_turns: int,
    system: str,
    require_plan: bool,
    enable_task: bool,
    task_depth: int,
    max_task_depth: int,
    task_max_turns: int | None,
    agent_mode: str,
) -> dict[str, Any]:
    tools = dict(tools)

    if agent_mode == "plan":
        from fangyu.core.materials import role_tool_ids
        from fangyu.engine.bundle_tools import builtin_tool_impls

        allowed = set(role_tool_ids("plan")) | {"task"}
        impls = builtin_tool_impls()
        # 保留已解析的 mcp_* 只读工具
        filtered = {
            k: v for k, v in tools.items()
            if k in allowed or k.startswith("mcp_")
        }
        if not filtered:
            filtered = {k: impls[k] for k in role_tool_ids("plan") if k in impls}
        tools = filtered
        if system == DEFAULT_SYSTEM or system == CODING_SYSTEM:
            system = PLAN_SYSTEM

    task_runtime = None
    if enable_task and task_depth < max_task_depth and "task" not in tools:
        from fangyu.engine.subagent_task import TaskRuntime

        task_runtime = TaskRuntime(
            llm=llm,
            depth=task_depth,
            max_depth=max_task_depth,
            default_max_turns=task_max_turns,
        )
        tools["task"] = task_runtime.make_tool()

    # plan 模式：限制 task 只能派只读子角色
    if agent_mode == "plan" and "task" in tools:
        _orig_task = tools["task"]

        async def _plan_safe_task(**kwargs):
            kind = str(kwargs.get("subagent_type") or "explore").lower()
            if kind == "general":
                return {
                    "ok": False,
                    "error": "plan 模式禁止 general 子 Agent（会改文件）。请用 explore/review/scout。",
                }
            tasks = kwargs.get("tasks")
            if isinstance(tasks, list):
                for item in tasks:
                    if isinstance(item, dict) and str(item.get("subagent_type") or "").lower() == "general":
                        return {
                            "ok": False,
                            "error": "plan 模式禁止 tasks 中含 general。",
                        }
            return await _orig_task(**kwargs)

        _plan_safe_task.__name__ = "task"
        tools["task"] = _plan_safe_task

    tool_names = sorted(tools.keys())
    catalog = ", ".join(tool_names) if tool_names else "(无)"
    plan_hint = ""
    if require_plan and agent_mode != "plan":
        plan_hint = "\n本任务要求：在调用任何 tool 之前，先输出 action=plan。"
    task_hint = ""
    if "task" in tools:
        task_hint = (
            "\n可用 task 委派 explore/general/review/scout；"
            "可用 tasks[] 并行；background=true 后台回灌；默认不可嵌套 task。"
        )
        if agent_mode == "plan":
            task_hint = "\nplan 模式仅可 task 委派 explore/review/scout（只读）。"
    mode_hint = f"\n当前 agent_mode={agent_mode}。"

    messages: list[dict[str, str]] = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": f"目标：{goal}\n可用工具：{catalog}{plan_hint}{task_hint}{mode_hint}\n请开始。",
        },
    ]
    trace: list[dict[str, Any]] = []
    plan_steps: list[str] = []
    saw_tool = False
    last_tool_sig: str | None = None
    repeat_tool = 0
    parse_errors = 0

    def _flush_bg_injects() -> None:
        if not task_runtime:
            return
        for item in task_runtime.drain_injects():
            obs = json.dumps({"tool": "task", "ok": True, "output": item}, ensure_ascii=False, default=str)
            messages.append({
                "role": "user",
                "content": f"后台 task 完成（自动回灌）：{obs}",
            })
            trace.append({"turn": "bg", "tool": "task", "background_inject": item})

    async def _finalize_bg() -> None:
        if not task_runtime:
            return
        extras = await task_runtime.wait_background(timeout=120)
        for item in extras:
            obs = json.dumps({"tool": "task", "ok": True, "output": item}, ensure_ascii=False, default=str)
            messages.append({
                "role": "user",
                "content": f"后台 task 完成（结束前回收）：{obs}",
            })
            trace.append({"turn": "bg", "tool": "task", "background_inject": item})

    for turn in range(1, max_turns + 1):
        _flush_bg_injects()
        messages = _compact_messages(messages, plan_steps)
        try:
            reply = await llm(messages)
        except Exception as exc:
            await _finalize_bg()
            return {
                "success": False,
                "result": None,
                "turns": turn - 1,
                "trace": trace,
                "error": f"llm error: {exc}",
                "plan": plan_steps,
            }

        messages.append({"role": "assistant", "content": reply})
        trace.append({"turn": turn, "llm": reply})

        try:
            action = _extract_json(reply)
            parse_errors = 0
        except (ValueError, json.JSONDecodeError) as exc:
            parse_errors += 1
            fix = f"上轮输出不是合法协议 JSON（{exc}）。请只输出 plan / tool / done 的 JSON。"
            if parse_errors >= 2 and plan_steps:
                fix += " 若卡住，可先输出新的 plan 再继续。"
            messages.append({"role": "user", "content": fix})
            trace.append({"turn": turn, "parse_error": str(exc)})
            continue

        kind = str(action.get("action") or "").lower()

        if kind == "plan":
            raw_steps = action.get("steps") or action.get("plan") or []
            if isinstance(raw_steps, str):
                plan_steps = [s.strip() for s in raw_steps.split("\n") if s.strip()]
            elif isinstance(raw_steps, list):
                plan_steps = [str(s).strip() for s in raw_steps if str(s).strip()]
            else:
                plan_steps = []
            if not plan_steps:
                messages.append({
                    "role": "user",
                    "content": 'plan.steps 必须是非空字符串数组。例: {"action":"plan","steps":["读文件","改代码","验证"]}',
                })
                continue
            trace.append({"turn": turn, "plan": plan_steps})
            messages.append({
                "role": "user",
                "content": "计划已记录。请开始执行第 1 步（action=tool），必要时可更新 plan。",
            })
            continue

        if kind == "done":
            if require_plan and not plan_steps and not saw_tool:
                messages.append({
                    "role": "user",
                    "content": "尚未规划也未调用工具。请先 plan，再执行，最后 done。",
                })
                continue
            await _finalize_bg()
            _flush_bg_injects()
            result = action.get("result")
            text = "" if result is None else str(result)
            return {
                "success": True,
                "result": text,
                "turns": turn,
                "trace": trace,
                "error": None,
                "plan": plan_steps,
            }

        if kind != "tool":
            messages.append({
                "role": "user",
                "content": f'未知 action={kind!r}。请使用 "plan"、"tool" 或 "done"。',
            })
            continue

        if require_plan and not plan_steps:
            messages.append({
                "role": "user",
                "content": '请先输出 plan（steps 数组），再调用 tool。',
            })
            continue

        name = str(action.get("name") or "")
        args = action.get("args") if isinstance(action.get("args"), dict) else {}
        if name not in tools:
            obs = f"工具不存在: {name}。可用: {catalog}"
            messages.append({"role": "user", "content": obs})
            trace.append({"turn": turn, "tool": name, "error": obs})
            continue

        sig = f"{name}:{json.dumps(args, sort_keys=True, ensure_ascii=False)}"
        if sig == last_tool_sig:
            repeat_tool += 1
        else:
            repeat_tool = 0
            last_tool_sig = sig

        try:
            from fangyu.core.org_acl import assert_org_allowed, get_principal
            assert_org_allowed(get_principal(), tool=name)
        except Exception as exc:
            obs = json.dumps({"tool": name, "ok": False, "error": str(exc)}, ensure_ascii=False)
            messages.append({"role": "user", "content": f"工具结果：{obs}"})
            trace.append({"turn": turn, "tool": name, "args": args, "observation": obs})
            continue

        try:
            out = _invoke_tool(tools[name], args)
            if hasattr(out, "__await__"):
                out = await out  # type: ignore[misc]
            obs = json.dumps({"tool": name, "ok": True, "output": out}, ensure_ascii=False, default=str)
        except Exception as exc:
            obs = json.dumps({"tool": name, "ok": False, "error": str(exc)}, ensure_ascii=False)

        obs = _truncate_obs(obs)
        saw_tool = True
        user_msg = f"工具结果：{obs}"
        if repeat_tool >= 2:
            user_msg += (
                "\n注意：你已连续多次调用相同工具与参数。请换策略："
                "read/search 换路径，或更新 plan，勿空转。"
            )
        if plan_steps and turn % 4 == 0:
            user_msg += "\n" + _plan_progress_nudge(plan_steps, turn, max_turns)

        messages.append({"role": "user", "content": user_msg})
        trace.append({
            "turn": turn, "tool": name, "args": args,
            "observation": obs, "repeat": repeat_tool,
        })

    await _finalize_bg()
    return {
        "success": False,
        "result": None,
        "turns": max_turns,
        "trace": trace,
        "error": f"exceeded max_turns={max_turns}",
        "plan": plan_steps,
    }
