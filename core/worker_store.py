"""方隅·行 Worker / 任务 SQLite 持久化"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from .config import DATA_DIR

WORKER_STALE_SECONDS = 90


def _db_path() -> Path:
    override = os.getenv("FANGYU_WORKER_DB")
    if override:
        if override == ":memory:":
            return Path(":memory:")
        return Path(override)
    return DATA_DIR / "workers.db"


def _connect() -> sqlite3.Connection:
    path = _db_path()
    if str(path) == ":memory:":
        conn = sqlite3.connect(":memory:", check_same_thread=False)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


_conn: sqlite3.Connection | None = None


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
        CREATE TABLE IF NOT EXISTS workers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            hostname TEXT NOT NULL DEFAULT '',
            os TEXT NOT NULL DEFAULT '',
            capabilities_json TEXT NOT NULL DEFAULT '[]',
            registered_at REAL NOT NULL,
            last_seen REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workers_name_host ON workers(name, hostname);

        CREATE TABLE IF NOT EXISTS worker_tasks (
            id TEXT PRIMARY KEY,
            worker_id TEXT,
            type TEXT NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'pending',
            result_json TEXT,
            error TEXT,
            created_at REAL NOT NULL,
            started_at REAL,
            finished_at REAL
        );
        CREATE INDEX IF NOT EXISTS idx_worker_tasks_status ON worker_tasks(status, created_at);

        CREATE TABLE IF NOT EXISTS worker_task_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            message TEXT NOT NULL DEFAULT '',
            detail_json TEXT,
            created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_worker_task_events_task ON worker_task_events(task_id, created_at);
        """
    )
    reclaim_stale_running_tasks(db)
    db.commit()


def reclaim_stale_running_tasks(conn: sqlite3.Connection | None = None) -> int:
    """服务重启时将 orphaned running 任务退回 pending"""
    db = conn or get_connection()
    now = time.time()
    rows = db.execute(
        "SELECT id, worker_id FROM worker_tasks WHERE status = 'running'"
    ).fetchall()
    reclaimed = 0
    for row in rows:
        worker = db.execute("SELECT last_seen FROM workers WHERE id = ?", (row["worker_id"],)).fetchone()
        stale = not worker or (now - worker["last_seen"]) > WORKER_STALE_SECONDS
        if stale:
            db.execute(
                "UPDATE worker_tasks SET status = 'pending', started_at = NULL, worker_id = NULL WHERE id = ?",
                (row["id"],),
            )
            log_event(row["id"], "reclaimed", "running → pending after restart", db=db)
            reclaimed += 1
    db.commit()
    return reclaimed


def _now() -> float:
    return time.time()


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _json_load(text: str | None, default: Any = None) -> Any:
    if not text:
        return default
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return default


def log_event(
    task_id: str,
    event_type: str,
    message: str = "",
    detail: dict[str, Any] | None = None,
    *,
    db: sqlite3.Connection | None = None,
) -> None:
    conn = db or get_connection()
    conn.execute(
        """
        INSERT INTO worker_task_events (task_id, event_type, message, detail_json, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (task_id, event_type, message, _json_dump(detail) if detail else None, _now()),
    )
    conn.commit()


def upsert_worker(
    *,
    name: str,
    hostname: str,
    os_name: str,
    capabilities: list[str],
    worker_id: str | None = None,
) -> dict[str, Any]:
    conn = get_connection()
    now = _now()
    if worker_id:
        row = conn.execute("SELECT * FROM workers WHERE id = ?", (worker_id,)).fetchone()
        if row:
            conn.execute(
                "UPDATE workers SET last_seen = ?, name = ?, hostname = ?, os = ?, capabilities_json = ? WHERE id = ?",
                (now, name, hostname, os_name, _json_dump(capabilities), worker_id),
            )
            conn.commit()
            return _worker_row_to_dict(conn.execute("SELECT * FROM workers WHERE id = ?", (worker_id,)).fetchone())

    existing = conn.execute(
        "SELECT * FROM workers WHERE name = ? AND hostname = ? ORDER BY last_seen DESC LIMIT 1",
        (name, hostname),
    ).fetchone()
    if existing:
        conn.execute("UPDATE workers SET last_seen = ?, os = ?, capabilities_json = ? WHERE id = ?",
                     (now, os_name, _json_dump(capabilities), existing["id"]))
        conn.commit()
        return _worker_row_to_dict(conn.execute("SELECT * FROM workers WHERE id = ?", (existing["id"],)).fetchone())

    import uuid
    new_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO workers (id, name, hostname, os, capabilities_json, registered_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (new_id, name, hostname, os_name, _json_dump(capabilities), now, now),
    )
    conn.commit()
    return _worker_row_to_dict(conn.execute("SELECT * FROM workers WHERE id = ?", (new_id,)).fetchone())


def touch_worker(worker_id: str) -> dict[str, Any] | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM workers WHERE id = ?", (worker_id,)).fetchone()
    if not row:
        return None
    conn.execute("UPDATE workers SET last_seen = ? WHERE id = ?", (_now(), worker_id))
    conn.commit()
    return _worker_row_to_dict(conn.execute("SELECT * FROM workers WHERE id = ?", (worker_id,)).fetchone())


def _is_online(last_seen: float) -> bool:
    return (_now() - last_seen) <= WORKER_STALE_SECONDS


def _worker_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "hostname": row["hostname"],
        "os": row["os"],
        "capabilities": _json_load(row["capabilities_json"], []),
        "registered_at": row["registered_at"],
        "last_seen": row["last_seen"],
    }


def list_workers_db() -> list[dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM workers ORDER BY name").fetchall()
    out = []
    for row in rows:
        w = _worker_row_to_dict(row)
        w["online"] = _is_online(w["last_seen"])
        out.append(w)
    return out


def get_worker_db(worker_id: str) -> dict[str, Any] | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM workers WHERE id = ?", (worker_id,)).fetchone()
    if not row:
        return None
    w = _worker_row_to_dict(row)
    w["online"] = _is_online(w["last_seen"])
    return w


def get_worker_by_name_db(name: str, *, online_only: bool = False) -> dict[str, Any] | None:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM workers WHERE name = ? ORDER BY last_seen DESC",
        (name,),
    ).fetchall()
    if not rows:
        return None
    workers = []
    for row in rows:
        w = _worker_row_to_dict(row)
        w["online"] = _is_online(w["last_seen"])
        workers.append(w)
    if online_only:
        online = [w for w in workers if w["online"]]
        return online[0] if online else None
    return workers[0]


def insert_task(
    *,
    task_id: str,
    task_type: str,
    payload: dict[str, Any],
    worker_id: str | None,
) -> dict[str, Any]:
    conn = get_connection()
    now = _now()
    conn.execute(
        """
        INSERT INTO worker_tasks (id, worker_id, type, payload_json, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
        """,
        (task_id, worker_id, task_type, _json_dump(payload), now),
    )
    log_event(task_id, "enqueued", f"task {task_type} created", {"worker_id": worker_id}, db=conn)
    conn.commit()
    return get_task_db(task_id) or {}


def poll_task_db(worker_id: str) -> dict[str, Any] | None:
    conn = get_connection()
    touch_worker(worker_id)
    row = conn.execute(
        """
        SELECT * FROM worker_tasks
        WHERE status = 'pending' AND (worker_id IS NULL OR worker_id = ?)
        ORDER BY created_at ASC
        LIMIT 1
        """,
        (worker_id,),
    ).fetchone()
    if not row:
        return None
    now = _now()
    conn.execute(
        "UPDATE worker_tasks SET status = 'running', worker_id = ?, started_at = ? WHERE id = ?",
        (worker_id, now, row["id"]),
    )
    log_event(row["id"], "started", "worker picked up task", {"worker_id": worker_id}, db=conn)
    conn.commit()
    return get_task_db(row["id"])


def complete_task_db(
    task_id: str,
    *,
    worker_id: str,
    status: str,
    result: dict[str, Any] | None,
    error: str | None,
) -> dict[str, Any] | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM worker_tasks WHERE id = ? AND worker_id = ?",
        (task_id, worker_id),
    ).fetchone()
    if not row:
        return None
    conn.execute(
        """
        UPDATE worker_tasks
        SET status = ?, result_json = ?, error = ?, finished_at = ?
        WHERE id = ?
        """,
        (status, _json_dump(result) if result else None, error, _now(), task_id),
    )
    log_event(
        task_id,
        status,
        error or "task finished",
        {"result": result} if result else None,
        db=conn,
    )
    conn.commit()
    return get_task_db(task_id)


def _task_row_to_dict(row: sqlite3.Row, worker_name: str | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "worker_id": row["worker_id"],
        "worker_name": worker_name,
        "type": row["type"],
        "payload": _json_load(row["payload_json"], {}),
        "status": row["status"],
        "result": _json_load(row["result_json"]),
        "error": row["error"],
        "created_at": row["created_at"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
    }


def get_task_db(task_id: str) -> dict[str, Any] | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM worker_tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        return None
    worker_name = None
    if row["worker_id"]:
        w = conn.execute("SELECT name FROM workers WHERE id = ?", (row["worker_id"],)).fetchone()
        worker_name = w["name"] if w else None
    return _task_row_to_dict(row, worker_name)


def list_tasks_db(*, limit: int = 50) -> list[dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM worker_tasks ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    out = []
    for row in rows:
        worker_name = None
        if row["worker_id"]:
            w = conn.execute("SELECT name FROM workers WHERE id = ?", (row["worker_id"],)).fetchone()
            worker_name = w["name"] if w else None
        out.append(_task_row_to_dict(row, worker_name))
    return out


def list_task_events_db(task_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT * FROM worker_task_events
        WHERE task_id = ?
        ORDER BY created_at ASC
        LIMIT ?
        """,
        (task_id, limit),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "task_id": r["task_id"],
            "event_type": r["event_type"],
            "message": r["message"],
            "detail": _json_load(r["detail_json"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def reset_store() -> None:
    """测试用：清空 Worker 数据"""
    close_connection()
    path = _db_path()
    if str(path) != ":memory:" and path.exists():
        path.unlink()
    get_connection()
