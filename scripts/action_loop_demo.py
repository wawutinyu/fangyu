#!/usr/bin/env python3
"""Action Loop + workspace 演示 — 创建 bundle → RPC → 检查 workspace/result.txt。"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from fangyu.core.agent_bundle import create_agent_bundle


def _wait(url: str, timeout: float = 20.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception:
            time.sleep(0.3)
    raise TimeoutError(url)


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="fyu-action-"))
    bundle_dir = tmp / "worker"
    port = 9301
    create_agent_bundle(bundle_dir, name="ActionWorker", worker_only=True, a2a_port=port, require_envelope=False)

    proc = subprocess.Popen(
        [sys.executable, "-m", "fangyu", "bundle", "run", str(bundle_dir), "--port", str(port), "--daemon"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        _wait(f"http://127.0.0.1:{port}/health")
        payload = {
            "jsonrpc": "2.0",
            "method": "a2a.send_message",
            "params": {
                "targetAgent": "ActionWorker",
                "message": {
                    "role": "user",
                    "parts": [{"type": "text", "text": "action loop demo goal"}],
                    "metadata": {"skill_id": "default"},
                },
            },
            "id": "demo",
        }
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/rpc",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        assert "result" in data
        assert data["result"]["status"]["state"] == "completed"

        result_path = bundle_dir / "workspace" / "result.txt"
        print(f"workspace file: {result_path}")
        print(result_path.read_text(encoding="utf-8"))
        state_path = bundle_dir / "workspace" / ".fangyu" / "state.json"
        if state_path.exists():
            print(f"state: {state_path.read_text(encoding='utf-8')}")
        print("[OK] Action Loop demo completed")
        return 0
    finally:
        proc.terminate()
        proc.wait(timeout=10)


if __name__ == "__main__":
    sys.exit(main())
