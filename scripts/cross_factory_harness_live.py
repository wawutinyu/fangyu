#!/usr/bin/env python3
"""跨厂投递 live smoke — 无 API Key：起临时西厂 Bundle → a2a.send_message → completed。

退出码：
  0 通过
  1 失败
  2 跳过（Windows / 本机端口不可绑）

用法::

    python scripts/cross_factory_harness_live.py
"""
from __future__ import annotations

import json
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _can_bind() -> bool:
    try:
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
        return True
    except OSError:
        return False


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_health(url: str, timeout: float = 25.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(0.25)
    raise TimeoutError(f"bundle not ready: {url}")


def _rpc(url: str, method: str, params: dict | None = None) -> dict:
    payload = {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": "cf-smoke"}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if "error" in data:
        raise RuntimeError(data["error"])
    return data.get("result", {})


def main() -> int:
    if sys.platform == "win32":
        print("[SKIP] cross-factory live — Windows subprocess port flaky")
        return 2
    if not _can_bind():
        print("[SKIP] cross-factory live — localhost bind blocked")
        return 2

    from fangyu.core.agent_bundle import create_agent_bundle

    port = _free_port()
    work = Path(tempfile.mkdtemp(prefix="fangyu-cf-smoke-"))
    west = work / "west"
    proc: subprocess.Popen | None = None
    try:
        create_agent_bundle(
            west,
            name="西厂执行",
            worker_only=True,
            a2a_port=port,
            require_envelope=False,
        )
        proc = subprocess.Popen(
            [sys.executable, "-m", "fangyu", "bundle", "run", str(west), "--port", str(port)],
            cwd=str(ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        base = f"http://127.0.0.1:{port}"
        rpc = f"{base}/rpc"
        _wait_health(f"{base}/health")
        result = _rpc(rpc, "a2a.send_message", {
            "targetAgent": "西厂执行",
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": "cross-factory smoke"}],
                "metadata": {"skill_id": "default"},
            },
        })
        state = (result.get("status") or {}).get("state")
        if state != "completed":
            print(f"[FAIL] cross-factory live — state={state!r}")
            return 1
        print(f"[OK] cross-factory live — completed · {base}")
        return 0
    except Exception as exc:
        print(f"[FAIL] cross-factory live — {exc}")
        return 1
    finally:
        if proc is not None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
