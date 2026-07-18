"""Shell 执行策略：allow | ask | deny（工厂人审闸最小实现）。"""
from __future__ import annotations

import re
from contextvars import ContextVar

_shell_policy: ContextVar[str] = ContextVar("fangyu_shell_policy", default="ask")

# 只读/低危：ask 模式下无需 confirm
_SHELL_READONLY = re.compile(
    r"^\s*("
    r"ls|pwd|whoami|date|uname|"
    r"git\s+(status|diff|log|show|branch|rev-parse)|"
    r"head|tail|wc|cat|rg|grep|find|"
    r"python3?\s+-m\s+pytest|pytest"
    r")(\s|$)",
    re.I,
)


def get_shell_policy() -> str:
    return (_shell_policy.get() or "ask").strip().lower()


def set_shell_policy(policy: str):
    p = (policy or "ask").strip().lower()
    if p not in ("allow", "ask", "deny"):
        p = "ask"
    return _shell_policy.set(p)


def reset_shell_policy(token) -> None:
    _shell_policy.reset(token)


def shell_needs_confirm(command: str) -> bool:
    """ask 策略下，非只读命令需要 confirm=true。"""
    cmd = (command or "").strip()
    if not cmd:
        return False
    if get_shell_policy() != "ask":
        return False
    return _SHELL_READONLY.match(cmd) is None
