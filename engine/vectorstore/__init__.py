"""方隅·知 — 自有向量层。

本地持久化向量集合，供知识库 / 记忆 / Agent 共用。
第一版：SQLite + 混合检索（余弦 + n-gram）；API 稳定后可换 HNSW 后端。
"""

from .store import Collection, VectorStore, get_default_store, reset_default_store_for_tests
from .types import SearchHit, VectorRecord

__all__ = [
    "Collection",
    "SearchHit",
    "VectorRecord",
    "VectorStore",
    "get_default_store",
    "reset_default_store_for_tests",
]
