"""工厂通讯录定时心跳 — 后台线程周期探测。"""
from __future__ import annotations

import os
import threading
import time
from typing import Any

_lock = threading.Lock()
_stop = threading.Event()
_thread: threading.Thread | None = None
_state: dict[str, Any] = {
    "enabled": False,
    "interval_sec": 90.0,
    "sync_presence": True,
    "align": True,
    "started_at": None,
    "last_run_at": None,
    "last_ok": None,
    "last_error": None,
    "last_summary": None,
    "runs": 0,
}


def _default_interval() -> float:
    raw = os.getenv("FANGYU_FACTORY_HEARTBEAT_SEC", "0").strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 0.0


def loop_status() -> dict[str, Any]:
    with _lock:
        running = _thread is not None and _thread.is_alive()
        return {
            **dict(_state),
            "running": running,
            "env_interval_sec": _default_interval(),
        }


def configure_loop(
    *,
    interval_sec: float | None = None,
    sync_presence: bool | None = None,
    align: bool | None = None,
) -> dict[str, Any]:
    with _lock:
        if interval_sec is not None:
            _state["interval_sec"] = max(15.0, float(interval_sec))
        if sync_presence is not None:
            _state["sync_presence"] = bool(sync_presence)
        if align is not None:
            _state["align"] = bool(align)
    return loop_status()


def _run_once() -> dict[str, Any]:
    from fangyu.core.a2a_factories import align_factories_and_presence, heartbeat_factories

    with _lock:
        sync_presence = bool(_state.get("sync_presence", True))
        do_align = bool(_state.get("align", True))

    out = heartbeat_factories(sync_presence=sync_presence)
    align_out = None
    if do_align:
        # 心跳后对齐：导入 Presence 新主机；导出通讯录在线态（不再次全量探测）
        align_out = align_factories_and_presence(
            import_hosts=True,
            export_factories=True,
            probe=False,
        )
    summary = {
        "heartbeat": {
            "total": out.get("total"),
            "online": out.get("online"),
            "offline": out.get("offline"),
        },
        "align": {
            "imported": (align_out or {}).get("imported"),
            "exported": (align_out or {}).get("exported"),
        } if align_out else None,
    }
    with _lock:
        _state["last_run_at"] = time.time()
        _state["last_ok"] = True
        _state["last_error"] = None
        _state["last_summary"] = summary
        _state["runs"] = int(_state.get("runs") or 0) + 1
    return {"ok": True, "summary": summary, "heartbeat": out, "align": align_out}


def _loop_main() -> None:
    while not _stop.is_set():
        try:
            _run_once()
        except Exception as exc:
            with _lock:
                _state["last_run_at"] = time.time()
                _state["last_ok"] = False
                _state["last_error"] = str(exc)
                _state["runs"] = int(_state.get("runs") or 0) + 1
        with _lock:
            interval = float(_state.get("interval_sec") or 90.0)
        # 可中断等待
        if _stop.wait(timeout=max(15.0, interval)):
            break


def start_factory_heartbeat_loop(
    *,
    interval_sec: float | None = None,
    sync_presence: bool = True,
    align: bool = True,
) -> dict[str, Any]:
    global _thread
    configure_loop(interval_sec=interval_sec, sync_presence=sync_presence, align=align)
    with _lock:
        if _thread is not None and _thread.is_alive():
            _state["enabled"] = True
            return loop_status()
        _stop.clear()
        _state["enabled"] = True
        _state["started_at"] = time.time()
        _thread = threading.Thread(
            target=_loop_main,
            name="fangyu-factory-heartbeat",
            daemon=True,
        )
        _thread.start()
    return loop_status()


def stop_factory_heartbeat_loop() -> dict[str, Any]:
    global _thread
    _stop.set()
    t = _thread
    if t is not None and t.is_alive():
        t.join(timeout=2.0)
    with _lock:
        _state["enabled"] = False
        _thread = None
    return loop_status()


def maybe_autostart_from_env() -> dict[str, Any] | None:
    """lifespan：FANGYU_FACTORY_HEARTBEAT_SEC>0 时自动启动。"""
    sec = _default_interval()
    if sec <= 0:
        return None
    return start_factory_heartbeat_loop(interval_sec=sec)
