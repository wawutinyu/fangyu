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

        CREATE TABLE IF NOT EXISTS presence_replays (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT '',
            created_at REAL NOT NULL,
            exported_at TEXT,
            event_count INTEGER NOT NULL DEFAULT 0,
            department_count INTEGER NOT NULL DEFAULT 0,
            pack_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_replays_created ON presence_replays(created_at DESC);
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
    db.execute("DELETE FROM presence_replays")
    db.commit()


_MAX_REPLAYS = 200


def save_replay(*, title: str, pack: dict[str, Any], replay_id: str | None = None) -> dict[str, Any]:
    """持久化观回放包到 SQLite。"""
    import uuid

    db = get_connection()
    rid = (replay_id or "").strip() or f"replay-{uuid.uuid4().hex[:12]}"
    now = time.time()
    events = pack.get("events") or []
    departments = pack.get("departments") or []
    exported_at = pack.get("exported_at") or None
    label = (title or "").strip() or f"回放 {exported_at or time.strftime('%Y-%m-%d %H:%M', time.localtime(now))}"
    db.execute(
        """
        INSERT OR REPLACE INTO presence_replays
        (id, title, created_at, exported_at, event_count, department_count, pack_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            rid,
            label,
            now,
            exported_at,
            len(events) if isinstance(events, list) else 0,
            len(departments) if isinstance(departments, list) else 0,
            json.dumps(pack, ensure_ascii=False),
        ),
    )
    # trim oldest
    db.execute(
        """
        DELETE FROM presence_replays WHERE id IN (
            SELECT id FROM presence_replays
            ORDER BY created_at DESC
            LIMIT -1 OFFSET ?
        )
        """,
        (_MAX_REPLAYS,),
    )
    db.commit()
    return {
        "id": rid,
        "title": label,
        "created_at": now,
        "exported_at": exported_at,
        "event_count": len(events) if isinstance(events, list) else 0,
        "department_count": len(departments) if isinstance(departments, list) else 0,
    }


def list_replays(*, limit: int = 50) -> list[dict[str, Any]]:
    db = get_connection()
    limit = max(1, min(int(limit), _MAX_REPLAYS))
    rows = db.execute(
        """
        SELECT id, title, created_at, exported_at, event_count, department_count
        FROM presence_replays
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "created_at": r["created_at"],
            "exported_at": r["exported_at"],
            "event_count": r["event_count"],
            "department_count": r["department_count"],
        }
        for r in rows
    ]


def get_replay(replay_id: str) -> dict[str, Any] | None:
    db = get_connection()
    row = db.execute(
        """
        SELECT id, title, created_at, exported_at, event_count, department_count, pack_json
        FROM presence_replays WHERE id = ?
        """,
        (replay_id,),
    ).fetchone()
    if not row:
        return None
    try:
        pack = json.loads(row["pack_json"] or "{}")
    except json.JSONDecodeError:
        pack = {}
    return {
        "id": row["id"],
        "title": row["title"],
        "created_at": row["created_at"],
        "exported_at": row["exported_at"],
        "event_count": row["event_count"],
        "department_count": row["department_count"],
        "pack": pack if isinstance(pack, dict) else {},
    }


def delete_replay(replay_id: str) -> bool:
    db = get_connection()
    cur = db.execute("DELETE FROM presence_replays WHERE id = ?", (replay_id,))
    db.commit()
    return cur.rowcount > 0
