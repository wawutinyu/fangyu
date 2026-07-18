"""G2-D Bundle 托管管理器 — 本机启停 daemon、健康探测、日志。

实例登记在 DATA_DIR/managed/registry.json；
日志在 DATA_DIR/managed/logs/<id>.log；
PID 文件 DATA_DIR/managed/pids/<id>.pid。
"""
from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


def _data_root() -> Path:
    from fangyu.core.config import DATA_DIR
    root = Path(DATA_DIR) / "managed"
    root.mkdir(parents=True, exist_ok=True)
    (root / "logs").mkdir(exist_ok=True)
    (root / "pids").mkdir(exist_ok=True)
    return root


def _registry_path() -> Path:
    return _data_root() / "registry.json"


def _load_registry() -> dict[str, Any]:
    path = _registry_path()
    if not path.is_file():
        return {"version": 1, "instances": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"version": 1, "instances": {}}
    if not isinstance(data.get("instances"), dict):
        data["instances"] = {}
    return data


def _save_registry(reg: dict[str, Any]) -> None:
    path = _registry_path()
    path.write_text(json.dumps(reg, ensure_ascii=False, indent=2), encoding="utf-8")


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    else:
        return True


def _pick_port(preferred: int | None = None) -> int:
    if preferred and preferred > 0:
        return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _health_url(host: str, port: int) -> str:
    return f"http://{host}:{port}/health"


def probe_health(host: str, port: int, timeout: float = 2.0) -> dict[str, Any] | None:
    try:
        with urllib.request.urlopen(_health_url(host, port), timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


def wait_healthy(
    host: str,
    port: int,
    *,
    timeout_sec: float = 20.0,
    interval: float = 0.3,
) -> dict[str, Any] | None:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        h = probe_health(host, port)
        if h and h.get("status") == "ok":
            return h
        time.sleep(interval)
    return None


def _enrich(inst: dict[str, Any]) -> dict[str, Any]:
    out = dict(inst)
    pid = int(out.get("pid") or 0)
    alive = _pid_alive(pid)
    out["alive"] = alive
    if not alive:
        out["status"] = "stopped" if out.get("status") != "failed" else "failed"
    else:
        health = probe_health(str(out.get("host") or "127.0.0.1"), int(out.get("port") or 0))
        out["health"] = health
        out["status"] = "running" if health else "starting"
        if health:
            out["uptime_sec"] = health.get("uptime_sec")
            out["tasks_total"] = health.get("tasks_total")
            out["agent"] = health.get("agent")
    return out


def list_instances() -> list[dict[str, Any]]:
    reg = _load_registry()
    return [_enrich(v) for v in reg["instances"].values()]


def get_instance(instance_id: str) -> dict[str, Any] | None:
    reg = _load_registry()
    inst = reg["instances"].get(instance_id)
    if not inst:
        # allow lookup by name
        for v in reg["instances"].values():
            if v.get("name") == instance_id:
                return _enrich(v)
        return None
    return _enrich(inst)


def start_instance(
    bundle_dir: str | Path,
    *,
    name: str | None = None,
    host: str = "127.0.0.1",
    port: int | None = None,
    workspace: str | Path | None = None,
    wait: bool = True,
    timeout_sec: float = 25.0,
) -> dict[str, Any]:
    """后台启动 bundle run --daemon，登记实例。"""
    root = Path(bundle_dir).resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Bundle 不存在: {root}")
    if not (root / "manifest.json").is_file():
        raise ValueError(f"不是有效 Bundle（缺 manifest.json）: {root}")

    # 同路径已在跑则复用
    for existing in list_instances():
        if Path(existing.get("bundle_dir") or "").resolve() == root and existing.get("alive"):
            return {**existing, "reused": True}

    iid = f"m_{uuid.uuid4().hex[:10]}"
    display = (name or root.name or iid).strip() or iid
    use_port = _pick_port(port)
    log_path = _data_root() / "logs" / f"{iid}.log"
    pid_path = _data_root() / "pids" / f"{iid}.pid"

    cmd = [
        sys.executable, "-m", "fangyu", "bundle", "run",
        str(root),
        "--host", host,
        "--port", str(use_port),
        "--daemon",
    ]
    if workspace:
        cmd.extend(["--workspace", str(workspace)])

    log_f = open(log_path, "a", encoding="utf-8")
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=log_f,
            stderr=subprocess.STDOUT,
            cwd=str(root.parent),
            start_new_session=True,
        )
    except Exception:
        log_f.close()
        raise
    else:
        log_f.close()  # 子进程已继承 fd

    pid_path.write_text(str(proc.pid), encoding="utf-8")
    now = time.time()
    inst = {
        "id": iid,
        "name": display,
        "bundle_dir": str(root),
        "host": host,
        "port": use_port,
        "workspace": str(workspace) if workspace else "",
        "pid": proc.pid,
        "status": "starting",
        "started_at": now,
        "log_path": str(log_path),
        "pid_path": str(pid_path),
        "cmd": cmd,
    }
    reg = _load_registry()
    reg["instances"][iid] = inst
    _save_registry(reg)

    # 写 Bundle 内托管提示（导出态可发现）
    managed_hint = root / "config" / "managed.json"
    managed_hint.parent.mkdir(parents=True, exist_ok=True)
    managed_hint.write_text(json.dumps({
        "instance_id": iid,
        "host": host,
        "port": use_port,
        "log_path": str(log_path),
        "started_at": now,
        "cli": {
            "status": f"python -m fangyu bundle manage status {iid}",
            "stop": f"python -m fangyu bundle manage stop {iid}",
            "logs": f"python -m fangyu bundle manage logs {iid}",
        },
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    if wait:
        health = wait_healthy(host, use_port, timeout_sec=timeout_sec)
        if not health:
            # 进程可能已挂
            if not _pid_alive(proc.pid):
                inst["status"] = "failed"
                reg = _load_registry()
                reg["instances"][iid] = inst
                _save_registry(reg)
                raise RuntimeError(
                    f"托管启动失败（进程已退出）。见日志: {log_path}"
                )
            # 仍活着但 health 未通 — 返回 starting
            return _enrich(inst)
        inst["status"] = "running"
        reg = _load_registry()
        reg["instances"][iid] = inst
        _save_registry(reg)

    try:
        from fangyu.core.collaboration import emit_event
        emit_event(
            "managed.start",
            actor=iid,
            target=display,
            message=f"托管启动 {display} :{use_port}",
            detail={"instance_id": iid, "host": host, "port": use_port, "bundle_dir": str(root)},
        )
    except Exception:
        pass

    return _enrich(inst)


def _kill_pid(pid: int, sig: int) -> None:
    try:
        os.kill(pid, sig)
    except (ProcessLookupError, PermissionError, OSError):
        pass


def _kill_process_tree(pid: int) -> None:
    """尽量杀掉进程组 / 子进程（macOS/Linux）。"""
    if pid <= 0:
        return
    # 先杀子进程
    try:
        out = subprocess.check_output(["pgrep", "-P", str(pid)], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            try:
                _kill_pid(int(line.strip()), signal.SIGTERM)
            except ValueError:
                pass
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        pass
    try:
        pgid = os.getpgid(pid)
        os.killpg(pgid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError, OSError):
        _kill_pid(pid, signal.SIGTERM)


def _force_kill_port(host: str, port: int) -> None:
    """兜底：按端口杀掉监听进程（macOS lsof）。"""
    if port <= 0:
        return
    try:
        out = subprocess.check_output(
            ["lsof", "-ti", f"tcp:{port}", f"-sTCP:LISTEN"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return
    for line in out.splitlines():
        try:
            _kill_pid(int(line.strip()), signal.SIGKILL)
        except ValueError:
            pass


def stop_instance(instance_id: str, *, timeout_sec: float = 10.0) -> dict[str, Any]:
    inst = get_instance(instance_id)
    if not inst:
        raise KeyError(f"实例不存在: {instance_id}")
    iid = inst["id"]
    pid = int(inst.get("pid") or 0)
    host = str(inst.get("host") or "127.0.0.1")
    port = int(inst.get("port") or 0)

    if pid and _pid_alive(pid):
        _kill_process_tree(pid)
        deadline = time.time() + timeout_sec
        while time.time() < deadline and _pid_alive(pid):
            time.sleep(0.15)
        if _pid_alive(pid):
            try:
                os.killpg(os.getpgid(pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                _kill_pid(pid, signal.SIGKILL)
            time.sleep(0.2)
        if _pid_alive(pid) or probe_health(host, port, timeout=0.5):
            _force_kill_port(host, port)
            time.sleep(0.2)
    elif probe_health(host, port, timeout=0.5):
        _force_kill_port(host, port)

    reg = _load_registry()
    if iid in reg["instances"]:
        reg["instances"][iid]["status"] = "stopped"
        reg["instances"][iid]["stopped_at"] = time.time()
        # 标记 pid 失效，避免误报 alive
        if not _pid_alive(pid):
            reg["instances"][iid]["pid"] = 0
        _save_registry(reg)
    try:
        from fangyu.core.collaboration import emit_event
        emit_event(
            "managed.stop",
            actor=iid,
            target=str(inst.get("name") or iid),
            message=f"托管停止 {inst.get('name') or iid}",
            detail={"instance_id": iid, "host": host, "port": port},
        )
    except Exception:
        pass
    return get_instance(iid) or {"id": iid, "status": "stopped", "alive": False}


def read_logs(instance_id: str, *, tail: int = 80) -> dict[str, Any]:
    inst = get_instance(instance_id)
    if not inst:
        raise KeyError(f"实例不存在: {instance_id}")
    path = Path(inst.get("log_path") or "")
    if not path.is_file():
        return {"id": inst["id"], "lines": [], "log_path": str(path)}
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    if tail > 0:
        lines = lines[-tail:]
    return {
        "id": inst["id"],
        "log_path": str(path),
        "lines": lines,
        "total_lines_approx": len(text.splitlines()),
    }


def remove_instance(instance_id: str, *, stop_first: bool = True) -> dict[str, Any]:
    inst = get_instance(instance_id)
    if not inst:
        raise KeyError(f"实例不存在: {instance_id}")
    if stop_first and inst.get("alive"):
        stop_instance(inst["id"])
    reg = _load_registry()
    removed = reg["instances"].pop(inst["id"], None)
    _save_registry(reg)
    return {"ok": True, "removed": removed}


def reset_registry_for_tests() -> None:
    """测试用：清空登记（不杀外部进程）。"""
    _save_registry({"version": 1, "instances": {}})


def quick_start_demo(*, name: str = "Studio-Demo-Host") -> dict[str, Any]:
    """一键：在 data/managed/bundles 下创建 action Bundle 并托管启动。"""
    from fangyu.core.agent_factory import build_from_profile
    from fangyu.core.config import DATA_DIR

    bundles_root = Path(DATA_DIR) / "managed" / "bundles"
    bundles_root.mkdir(parents=True, exist_ok=True)
    dest = bundles_root / f"demo_{uuid.uuid4().hex[:8]}"
    build_from_profile("action", dest, name=name, require_envelope=False)
    return start_instance(dest, name=name, wait=True, timeout_sec=30)
