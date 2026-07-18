"""全局测试 fixture — 每个用例前重置关键进程内状态。"""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _reset_fangyu_global_state():
    from fangyu.a2a.trust.registry import reset_trust_for_tests
    from fangyu.core.collaboration import reset_collaboration
    from fangyu.engine.embedding import reset_embedding_for_tests
    from fangyu.engine.registry import register_executors, reset_registry_for_tests
    from fangyu.engine import variable as variable_mod

    from fangyu.core.platform_identity import ensure_platform_identity, reset_platform_identity_for_tests

    reset_trust_for_tests()
    reset_embedding_for_tests()
    reset_collaboration()
    reset_registry_for_tests()
    register_executors()
    variable_mod._ephemeral.clear()
    reset_platform_identity_for_tests()
    ensure_platform_identity()
    yield
    reset_trust_for_tests()
    reset_embedding_for_tests()
    variable_mod._ephemeral.clear()
