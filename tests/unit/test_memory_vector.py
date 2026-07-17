"""记忆 × 方隅·知向量层。"""

from __future__ import annotations

from pathlib import Path

import fangyu.engine.memory as memory_mod
from fangyu.engine.vectorstore import reset_default_store_for_tests


def test_memory_write_search_uses_vectorstore(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(memory_mod, "MEMORY_DIR", tmp_path / "memory")
    reset_default_store_for_tests(tmp_path / "vector")
    # 单测不加载重型 embedding 模型
    monkeypatch.setattr(memory_mod, "get_embedding_sync", lambda _t: None)

    memory_mod.memory_write("user", "pref", "用户喜欢深色主题和快捷键")
    results = memory_mod.memory_search("user", "深色主题", limit=5)
    assert results
    assert results[0]["key"] == "pref"
    assert "score" in results[0]

    memory_mod.memory_delete("user", "pref")
    assert memory_mod.memory_read("user", "pref") is None
