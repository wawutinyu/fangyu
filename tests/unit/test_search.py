"""engine.search — 会话消息索引与检索"""
from pathlib import Path

import pytest

from fangyu.engine import search


@pytest.fixture(autouse=True)
def _isolate_search_index(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    idx_dir = tmp_path / "search"
    idx_dir.mkdir()
    monkeypatch.setattr(search, "INDEX_DIR", idx_dir)
    monkeypatch.setattr(search, "INDEX_FILE", idx_dir / "conversations.jsonl")
    yield


def test_index_and_search():
    search.index_message("s1", "user", "hello fangyu agent")
    search.index_message("s1", "assistant", "hi there")
    search.index_message("s2", "user", "unrelated topic")
    hits = search.search_messages("fangyu")
    assert len(hits) == 1
    assert hits[0]["content"] == "hello fangyu agent"
    assert hits[0]["session_id"] == "s1"


def test_search_filter_by_session():
    search.index_message("a", "user", "alpha beta")
    search.index_message("b", "user", "alpha gamma")
    hits = search.search_messages("alpha", session_id="b")
    assert len(hits) == 1
    assert hits[0]["session_id"] == "b"


def test_search_limit_and_ranking():
    search.index_message("s", "user", "token")
    search.index_message("s", "user", "token token token")
    search.index_message("s", "user", "token token")
    hits = search.search_messages("token", limit=2)
    assert len(hits) == 2
    assert hits[0]["content"].count("token") >= hits[1]["content"].count("token")


def test_empty_query_no_hits():
    search.index_message("s", "user", "something")
    assert search.search_messages("") == []
