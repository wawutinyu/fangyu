"""安全相关：危险工具默认禁用"""
import asyncio
from unittest.mock import patch

import pytest

from fangyu.core.constitution import ConstitutionViolation
from fangyu.engine import tool_registry


@pytest.fixture(autouse=True)
def _reload_builtins():
    """每个测试前按环境变量重新注册内置工具。"""
    tool_registry.register_builtins()
    yield


def test_dangerous_tools_disabled_by_default():
    for name in tool_registry.DANGEROUS_TOOL_NAMES:
        tool = tool_registry.get_tool(name)
        assert tool is not None, f"内置工具 {name} 应已注册"
        assert tool.get("enabled") is False
        assert tool.get("dangerous") is True


def test_dangerous_tools_blocked_on_execute():
    async def _run():
        for name in tool_registry.DANGEROUS_TOOL_NAMES:
            with pytest.raises((ValueError, ConstitutionViolation), match="禁止|已禁用"):
                await tool_registry.execute_tool(name, {}, {})

    asyncio.run(_run())


def test_dangerous_tools_enabled_when_env_set():
    from fangyu.core.config import settings

    with patch.object(settings, "ALLOW_DANGEROUS_TOOLS", True):
        tool_registry.register_builtins()
        for name in tool_registry.DANGEROUS_TOOL_NAMES:
            tool = tool_registry.get_tool(name)
            assert tool.get("enabled") is True


def test_safe_tools_remain_enabled():
    tool = tool_registry.get_tool("web_search")
    if tool:
        assert tool.get("enabled", True) is True
