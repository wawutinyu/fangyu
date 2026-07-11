"""Bundle daemon 状态 — 长运行 Worker 指标追踪。"""
from __future__ import annotations

import time
import threading

_start_time = time.time()
_tasks_total = 0
_lock = threading.Lock()


def record_task() -> None:
    global _tasks_total
    with _lock:
        _tasks_total += 1


def daemon_status() -> dict:
    with _lock:
        return {
            "mode": "daemon",
            "uptime_sec": round(time.time() - _start_time, 1),
            "tasks_total": _tasks_total,
        }


def reset_for_tests() -> None:
    global _start_time, _tasks_total
    with _lock:
        _start_time = time.time()
        _tasks_total = 0
