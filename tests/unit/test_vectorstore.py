"""方隅·知向量层单测。"""

from __future__ import annotations

from pathlib import Path

from fangyu.engine.vectorstore import (
    VectorRecord,
    VectorStore,
    reset_default_store_for_tests,
)
from fangyu.engine.vectorstore.mathutil import cosine_similarity, text_similarity


def test_cosine_and_text():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == 0.0
    assert text_similarity("巡检报告", "完成巡检并写入报告") > 0


def test_collection_upsert_search_delete(tmp_path: Path):
    store = VectorStore.open(tmp_path / "vector")
    col = store.collection("knowledge")

    col.upsert(
        [
            VectorRecord(
                id="chunk:1",
                vector=[1.0, 0.0, 0.0],
                payload={"content": "产线巡检完成", "doc_id": 1, "chunk_id": 1},
            ),
            VectorRecord(
                id="chunk:2",
                vector=[0.0, 1.0, 0.0],
                payload={"content": "文档助手摘要", "doc_id": 2, "chunk_id": 2},
            ),
        ]
    )
    assert col.count() == 2

    hits = col.search([1.0, 0.0, 0.0], query_text="巡检", top_k=2)
    assert hits
    assert hits[0].id == "chunk:1"
    assert hits[0].payload["chunk_id"] == 1

    n = col.delete_where(doc_id=1)
    assert n == 1
    assert col.count() == 1
    assert col.delete(["chunk:2"]) == 1
    assert col.count() == 0


def test_payload_filter_and_count_where(tmp_path: Path):
    store = VectorStore.open(tmp_path / "vector")
    col = store.collection("memory")
    col.upsert(
        [
            VectorRecord(id="m1", vector=None, payload={"scope": "user", "content": "喜欢咖啡", "key": "a"}),
            VectorRecord(id="m2", vector=None, payload={"scope": "agent", "content": "喜欢茶", "key": "b"}),
        ]
    )
    assert col.count_where(scope="user") == 1
    hits = col.search(None, query_text="喜欢", top_k=5, payload_filter={"scope": "user"})
    assert len(hits) == 1
    assert hits[0].id == "m1"


def test_default_store_reset(tmp_path: Path):
    store = reset_default_store_for_tests(tmp_path / "v2")
    col = store.collection("mem")
    col.upsert([VectorRecord(id="a", vector=None, payload={"content": "hello world"})])
    hits = col.search(None, query_text="hello", top_k=1)
    assert len(hits) == 1
    assert hits[0].id == "a"
