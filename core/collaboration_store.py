"""方隅·观 — 协作事件 SQLite 持久化（API 重启不丢）。"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from .config import DATA_DIR

_MAX_PERSISTED = 2000
_conn: sqlite3.Connection | None = None


def _db_path() -> Path:
    override = os.getenv("FANGYU_COLLAB_DB")
    if override:
        if override == ":memory:":
            return Path(":memory:")
        return Path(override)
    return DATA_DIR / "collaboration.db"


def _connect() -> sqlite3.Connection:
    path = _db_path()
    if str(path) == ":memory:":
        conn = sqlite3.connect(":memory:", check_same_thread=False)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def get_connection() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = _connect()
        init_store(_conn)
    return _conn


def close_connection() -> None:
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None


def init_store(conn: sqlite3.Connection | None = None) -> None:
    db = conn or get_connection()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS collaboration_events (
            id TEXT PRIMARY KEY,
            ts REAL NOT NULL,
            kind TEXT NOT NULL,
            actor TEXT NOT NULL DEFAULT '',
            target TEXT,
            message TEXT NOT NULL DEFAULT '',
            detail_json TEXT NOT NULL DEFAULT '{}',
            severity TEXT NOT NULL DEFAULT 'info'
        );
        CREATE INDEX IF NOT EXISTS idx_collab_ts ON collaboration_events(ts DESC);
        CREATE INDEX IF NOT EXISTS idx_collab_kind ON collaboration_events(kind);
        """
    )
    db.commit()


def reset_store() -> None:
    """测试用：清空表并关闭连接（配合新临时库路径）。"""
    close_connection()


def insert_event(entry: dict[str, Any]) -> None:
    db = get_connection()
    db.execute(
        """
        INSERT OR REPLACE INTO collaboration_events
        (id, ts, kind, actor, target, message, detail_json, severity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            entry.get("id"),
            float(entry.get("ts") or time.time()),
            entry.get("kind") or "",
            entry.get("actor") or "",
            entry.get("target"),
            entry.get("message") or "",
            json.dumps(entry.get("detail") or {}, ensure_ascii=False),
            entry.get("severity") or "info",
        ),
    )
    # trim oldest beyond cap
    db.execute(
        """
        DELETE FROM collaboration_events WHERE id IN (
            SELECT id FROM collaboration_events
            ORDER BY ts DESC
            LIMIT -1 OFFSET ?
        )
        """,
        (_MAX_PERSISTED,),
    )
    db.commit()


def query_events(*, limit: int = 100, kinds: list[str] | None = None) -> list[dict[str, Any]]:
    db = get_connection()
    limit = max(1, min(int(limit), _MAX_PERSISTED))
    if kinds:
        placeholders = ",".join("?" for _ in kinds)
        rows = db.execute(
            f"""
            SELECT id, ts, kind, actor, target, message, detail_json, severity
            FROM collaboration_events
            WHERE kind IN ({placeholders})
            ORDER BY ts DESC
            LIMIT ?
            """,
            (*kinds, limit),
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT id, ts, kind, actor, target, message, detail_json, severity
            FROM collaboration_events
            ORDER BY ts DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    out: list[dict[str, Any]] = []
    for r in rows:
        try:
            detail = json.loads(r["detail_json"] or "{}")
        except json.JSONDecodeError:
            detail = {}
        out.append({
            "id": r["id"],
            "ts": r["ts"],
            "kind": r["kind"],
            "actor": r["actor"],
            "target": r["target"],
            "message": r["message"],
            "detail": detail if isinstance(detail, dict) else {},
            "severity": r["severity"],
        })
    return out


def clear_events() -> None:
    db = get_connection()
    db.execute("DELETE FROM collaboration_events")
    db.commit()
