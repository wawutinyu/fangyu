#!/usr/bin/env python3
"""Agent Bundle 本地演示 — 创建 bundle → 启动 A2A 服务 → 发 RPC。"""
from __future__ import annotations

import argparse
import json
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from fangyu.core.agent_bundle import create_agent_bundle


def _rpc(url: str, method: str, params: dict | None = None) -> dict:
    payload = {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": "demo"}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if "error" in data:
        raise RuntimeError(data["error"])
    return data.get("result", {})


def _wait(url: str, timeout: float = 20.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.3)
    raise TimeoutError(url)


def main() -> None:
    parser = argparse.ArgumentParser(description="Agent Bundle demo")
    parser.add_argument("--port", type=int, default=9100)
    parser.add_argument("--keep", action="store_true", help="保留 bundle 目录不删除")
    args = parser.parse_args()

    tmp = Path(tempfile.mkdtemp(prefix="fyu-demo-"))
    bundle_dir = tmp / "demo-worker"
    port = args.port

    print(f"[1/4] 创建 bundle → {bundle_dir}")
    create_agent_bundle(bundle_dir, name="DemoWorker", worker_only=True, a2a_port=port, require_envelope=False)

    print(f"[2/4] 启动 bundle 服务 (port={port}) …")
    import subprocess
    import sys

    proc = subprocess.Popen(
        [sys.executable, "-m", "fangyu", "--run-bundle", str(bundle_dir), "--port", str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        _wait(f"http://127.0.0.1:{port}/health")
        print(f"[3/4] health OK")

        task = _rpc(f"http://127.0.0.1:{port}/rpc", "a2a.send_message", {
            "targetAgent": "DemoWorker",
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": "bundle demo query"}],
                "metadata": {"skill_id": "default"},
            },
        })
        print(f"[4/4] RPC 完成 state={task['status']['state']}")
        for msg in task.get("history", []):
            if msg.get("role") == "agent":
                for part in msg.get("parts", []):
                    if part.get("type") == "text":
                        print(f"  agent → {part['text']}")
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        if not args.keep:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)
        else:
            print(f"bundle 保留于 {bundle_dir}")


if __name__ == "__main__":
    main()
