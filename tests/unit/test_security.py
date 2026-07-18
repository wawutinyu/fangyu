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


def test_code_execution_uses_sandbox_not_subprocess():
    """用户代码应走 sandbox，禁止任意 import/subprocess。"""
    tool = tool_registry.get_tool("code_execution")
    assert tool is not None
    impl = tool.get("implementation") or {}
    assert impl.get("type") == "sandbox"
    assert "subprocess" not in str(impl)

    async def _run():
        ok = await tool_registry.execute_tool("code_execution", {"code": "result = 1 + 2"}, {})
        assert ok == 3
        blocked = await tool_registry.execute_tool(
            "code_execution",
            {"code": "import os; result = os.getcwd()"},
            {},
        )
        assert isinstance(blocked, dict)
        assert "error" in blocked
        assert "禁止" in blocked["error"] or "import" in blocked["error"].lower()

    asyncio.run(_run())


def test_trust_registry_is_unified():
    from fangyu.a2a.trust.registry import TrustRegistry as A2A
    from fangyu.engine.trust_runtime import TrustRegistry as Engine

    assert A2A is Engine
    A2A._identities.clear()
    A2A._policies.clear()
    A2A._revoked.clear()
    Engine.register("unify_test", "pubkey", ["*"])
    assert A2A.get_public_key("unify_test") == "pubkey"
