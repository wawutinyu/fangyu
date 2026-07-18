"""Setup Copilot · 行 — 自然语言 → 本机 Worker 启动预览（不自动起进程）。"""
from __future__ import annotations

import re
from typing import Any

DEFAULT_CAPABILITIES = ["shell", "run_flow", "read_file", "write_file", "adapter_invoke"]


def _slug_name(text: str) -> str:
    raw = (text or "").strip().splitlines()[0] if text else ""
    raw = re.sub(r"[^\w\u4e00-\u9fff\-]+", "-", raw, flags=re.UNICODE).strip("-")
    if not raw:
        return "mac-worker"
    return raw[:40]


def build_worker_preview(description: str) -> dict[str, Any]:
    """根据用户一句话生成 Worker 名称、白话确认与本机启动命令。"""
    desc = (description or "").strip() or "本机执行助手"
    name = _slug_name(desc)
    risks: list[str] = [
        "Worker 跑在本机，可执行 shell / 读写工作区文件；请只在信任的机器上启动。",
        "启动后才会出现在「行」舰队；Studio 不会远程替你拉起进程。",
    ]
    plain = (
        f"即将在本机准备 Worker「{name}」。\n"
        f"你的描述：{desc}\n"
        f"能力：{'、'.join(DEFAULT_CAPABILITIES)}\n"
        f"\n"
        f"确认后请在本机 Terminal 运行下面的命令（或双击 ~/Applications/Fangyu-Worker.command）。"
        f"出现在线后即可从序派发任务。"
    )
    confirm_prompt = (
        f"我确认在本机启动 Worker「{name}」，允许它以声明能力执行序派发的任务；"
        f"异常时我将停止进程并在行面板复查。"
    )
    install_cmd = (
        f'cd ~/Projects/fangyu && FANGYU_WORKER_NAME="{name}" ./dev-worker.sh'
    )
    return {
        "name": name,
        "description": desc,
        "capabilities": list(DEFAULT_CAPABILITIES),
        "risks": risks,
        "plain": plain,
        "confirm_prompt": confirm_prompt,
        "install_cmd": install_cmd,
        "env": {"FANGYU_WORKER_NAME": name},
    }
