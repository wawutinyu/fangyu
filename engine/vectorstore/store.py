"""方隅·知 — 本地向量集合（SQLite 持久化 + 暴力/混合检索）。

这是方隅自有向量层的第一版后端：不依赖外部向量库进程。
后续可换 HNSW 等索引，对外 Collection API 保持稳定。
"""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterable

from .mathutil import cosine_similarity, pack_f32, text_similarity, unpack_f32
from .types import SearchHit, VectorRecord

_SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vectors (
    id TEXT PRIMARY KEY,
    dim INTEGER NOT NULL DEFAULT 0,
    vector BLOB,
    payload TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_vectors_dim ON vectors(dim);
"""


class Collection:
    def __init__(self, name: str, db_path: Path):
        self.name = name
        self.db_path = db_path
        self._lock = threading.RLock()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def upsert(self, records: Iterable[VectorRecord]) -> int:
        rows = list(records)
        if not rows:
            return 0
        with self._lock, self._connect() as conn:
            for r in rows:
                blob = pack_f32(r.vector) if r.vector else None
                dim = len(r.vector) if r.vector else 0
                payload = json.dumps(r.payload or {}, ensure_ascii=False)
                conn.execute(
                    """
                    INSERT INTO vectors(id, dim, vector, payload)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        dim=excluded.dim,
                        vector=excluded.vector,
                        payload=excluded.payload
                    """,
                    (r.id, dim, blob, payload),
                )
            conn.commit()
        return len(rows)

    def delete(self, ids: Iterable[str]) -> int:
        id_list = [i for i in ids if i]
        if not id_list:
            return 0
        with self._lock, self._connect() as conn:
            qmarks = ",".join("?" * len(id_list))
            cur = conn.execute(f"DELETE FROM vectors WHERE id IN ({qmarks})", id_list)
            conn.commit()
            return cur.rowcount

    def delete_where(self, **payload_eq: Any) -> int:
        """按 payload 精确字段删除（全表扫 JSON，适合本机小库）。"""
        if not payload_eq:
            return 0
        removed = 0
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT id, payload FROM vectors").fetchall()
            to_del: list[str] = []
            for row in rows:
                try:
                    payload = json.loads(row["payload"] or "{}")
                except json.JSONDecodeError:
                    payload = {}
                if all(payload.get(k) == v for k, v in payload_eq.items()):
                    to_del.append(row["id"])
            if to_del:
                qmarks = ",".join("?" * len(to_del))
                cur = conn.execute(f"DELETE FROM vectors WHERE id IN ({qmarks})", to_del)
                removed = cur.rowcount
                conn.commit()
        return removed

    def count_where(self, **payload_eq: Any) -> int:
        if not payload_eq:
            return self.count()
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT payload FROM vectors").fetchall()
        n = 0
        for row in rows:
            try:
                payload = json.loads(row["payload"] or "{}")
            except json.JSONDecodeError:
                payload = {}
            if all(payload.get(k) == v for k, v in payload_eq.items()):
                n += 1
        return n

    def count(self) -> int:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS c FROM vectors").fetchone()
            return int(row["c"] if row else 0)

    def get(self, ids: Iterable[str]) -> list[VectorRecord]:
        id_list = [i for i in ids if i]
        if not id_list:
            return []
        with self._lock, self._connect() as conn:
            qmarks = ",".join("?" * len(id_list))
            rows = conn.execute(
                f"SELECT id, vector, payload FROM vectors WHERE id IN ({qmarks})",
                id_list,
            ).fetchall()
        out: list[VectorRecord] = []
        for row in rows:
            vec = unpack_f32(row["vector"]) if row["vector"] else None
            try:
                payload = json.loads(row["payload"] or "{}")
            except json.JSONDecodeError:
                payload = {}
            out.append(VectorRecord(id=row["id"], vector=vec, payload=payload))
        return out

    def search(
        self,
        vector: list[float] | None = None,
        *,
        query_text: str = "",
        top_k: int = 5,
        vector_weight: float = 0.6,
        text_weight: float = 0.4,
        text_field: str = "content",
        payload_filter: dict[str, Any] | None = None,
    ) -> list[SearchHit]:
        """混合检索：向量余弦 + payload 文本 n-gram。"""
        top_k = max(1, int(top_k))
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT id, vector, payload FROM vectors").fetchall()

        scored: list[SearchHit] = []
        for row in rows:
            try:
                payload = json.loads(row["payload"] or "{}")
            except json.JSONDecodeError:
                payload = {}
            if payload_filter and not all(payload.get(k) == v for k, v in payload_filter.items()):
                continue
            vec_score = 0.0
            if vector and row["vector"]:
                stored = unpack_f32(row["vector"])
                vec_score = cosine_similarity(vector, stored)
            text_score = 0.0
            if query_text:
                text_score = text_similarity(query_text, str(payload.get(text_field, "")))
            if vector and query_text:
                score = vec_score * vector_weight + text_score * text_weight
            elif vector:
                score = vec_score
            else:
                score = text_score
            if score > 0:
                scored.append(SearchHit(id=row["id"], score=round(score, 6), payload=payload))

        scored.sort(key=lambda h: -h.score)
        return scored[:top_k]


class VectorStore:
    """方隅本地向量库根：每个 collection 一个 sqlite 文件。"""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._collections: dict[str, Collection] = {}
        self._lock = threading.RLock()

    @classmethod
    def open(cls, root: Path | str) -> "VectorStore":
        return cls(Path(root))

    def collection(self, name: str) -> Collection:
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in name.strip()) or "default"
        with self._lock:
            if safe not in self._collections:
                path = self.root / f"{safe}.sqlite"
                self._collections[safe] = Collection(safe, path)
            return self._collections[safe]

    def list_collections(self) -> list[str]:
        names = {p.stem for p in self.root.glob("*.sqlite")}
        names.update(self._collections.keys())
        return sorted(names)


_default_store: VectorStore | None = None
_default_lock = threading.Lock()


def get_default_store() -> VectorStore:
    """默认落在 FANGYU_DATA_DIR/vector。"""
    global _default_store
    with _default_lock:
        if _default_store is None:
            from fangyu.core.config import DATA_DIR

            _default_store = VectorStore.open(DATA_DIR / "vector")
        return _default_store


def reset_default_store_for_tests(root: Path | None = None) -> VectorStore:
    """测试用：重置默认 store。"""
    global _default_store
    with _default_lock:
        if root is None:
            from fangyu.core.config import DATA_DIR

            root = DATA_DIR / "vector"
        _default_store = VectorStore.open(root)
        return _default_store
