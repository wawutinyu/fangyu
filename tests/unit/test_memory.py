"""engine.memory — JSON scope 读写（向量层 mock，避免依赖大模型）"""
from pathlib import Path

import pytest

from fangyu.engine import memory


@pytest.fixture(autouse=True)
def _isolate_memory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    mem_dir = tmp_path / "memory"
    mem_dir.mkdir()
    monkeypatch.setattr(memory, "MEMORY_DIR", mem_dir)
    monkeypatch.setattr(memory, "_upsert_memory_vector", lambda *a, **k: None)
    monkeypatch.setattr(memory, "_delete_memory_vector", lambda *a, **k: None)
    yield


def test_write_read_delete():
    memory.memory_write("user", "fav_color", "blue")
    assert memory.memory_read("user", "fav_color") == "blue"
    assert memory.memory_list("user") == [{"key": "fav_color", "value": "blue"}]
    memory.memory_delete("user", "fav_color")
    assert memory.memory_read("user", "fav_color") is None


def test_memory_replace():
    memory.memory_write("session", "f1", "old fact")
    assert memory.memory_replace("session", "old fact", "new fact") is True
    assert memory.memory_read("session", "f1") == "new fact"
    assert memory.memory_replace("session", "missing", "x") is False


def test_scopes_are_isolated():
    memory.memory_write("user", "k", "u")
    memory.memory_write("global", "k", "g")
    assert memory.memory_read("user", "k") == "u"
    assert memory.memory_read("global", "k") == "g"
