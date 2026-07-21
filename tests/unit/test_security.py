"""安全相关：危险工具默认禁用"""
import asyncio
from unittest.mock import patch

import pytest

from fangyu.core.constitution import ConstitutionViolation
from fangyu.engine import tool_registry


@pytest.fixture(autouse=True)
def _reload_builtins():
    """每个测试前按环境变量重新注册内置工具；关闭 ACL 避免污染单测。"""
    from fangyu.core.org_acl import enable_acl

    enable_acl(False, require_principal=False)
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


def test_shell_execution_uses_argv_not_shell_true():
    """S0-B1：shell 走原生 argv，无 shell=True。"""
    from fangyu.core.config import settings

    tool = tool_registry.get_tool("shell_execution")
    assert tool is not None
    assert (tool.get("implementation") or {}).get("type") == "native"

    async def _run():
        with patch.object(settings, "ALLOW_DANGEROUS_TOOLS", True), patch(
            "fangyu.core.constitution.check_tool_allowed", lambda *_a, **_k: None
        ):
            tool_registry.register_builtins()
            out = await tool_registry.execute_tool(
                "shell_execution", {"command": "echo fangyu-s0"}, {}
            )
            assert isinstance(out, dict)
            assert out.get("returncode") == 0
            assert "fangyu-s0" in (out.get("stdout") or "")

    asyncio.run(_run())


def test_reject_register_dangerous_impl():
    from fangyu.core.config import settings

    with patch.object(settings, "ALLOW_DANGEROUS_TOOLS", False):
        r = tool_registry.register_tool(
            "evil_shell_s0",
            "x",
            {},
            {"type": "code", "code": "import subprocess; result = subprocess.run('id', shell=True)"},
        )
        assert r["success"] is False
        assert "危险" in r.get("error", "")


def test_file_operations_rejects_path_escape():
    from fangyu.core.config import settings

    async def _run():
        with patch.object(settings, "ALLOW_DANGEROUS_TOOLS", True), patch(
            "fangyu.core.constitution.check_tool_allowed", lambda *_a, **_k: None
        ):
            tool_registry.register_builtins()
            with pytest.raises(ValueError, match="escape"):
                await tool_registry.execute_tool(
                    "file_operations",
                    {"action": "read", "path": "/etc/passwd"},
                    {},
                )

    asyncio.run(_run())


def test_nonce_fifo_no_full_clear():
    """S0-D3：超限淘汰最旧条，不整表 clear。"""
    from fangyu.a2a.trust.registry import TrustRegistry

    TrustRegistry.reset()
    orig = TrustRegistry._NONCE_CAP
    try:
        TrustRegistry._NONCE_CAP = 3
        assert TrustRegistry.check_nonce("a")
        assert TrustRegistry.check_nonce("b")
        assert TrustRegistry.check_nonce("c")
        assert TrustRegistry.check_nonce("d")  # 淘汰 a → b,c,d
        assert TrustRegistry.check_nonce("c") is False  # 仍在表中
        assert TrustRegistry.check_nonce("a")  # a 可再次使用 → 淘汰 b → c,d,a
        assert TrustRegistry.check_nonce("d") is False
    finally:
        TrustRegistry._NONCE_CAP = orig
        TrustRegistry.reset()


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
