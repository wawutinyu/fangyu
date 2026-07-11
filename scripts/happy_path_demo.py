#!/usr/bin/env python3
"""Phase 5 Happy Path — Flow→Bundle→run→本地 RPC→跨 Bundle 加密 RPC（全自动，无手改 JSON）。"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from fangyu.core.agent_bundle import add_trusted_peer, create_agent_bundle, get_public_identity, load_agent_bundle
from fangyu.engine.bundle_a2a_client import identity_from_bundle, rpc_call
from fangyu.engine.executor import register_executors


def _wait(url: str, timeout: float = 20.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.3)
    raise TimeoutError(url)


def _unsigned_rpc(url: str, target: str, message: str, skill: str = "default") -> dict:
    payload = {
        "jsonrpc": "2.0",
        "method": "a2a.send_message",
        "params": {
            "targetAgent": target,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": message}],
                "metadata": {"skill_id": skill},
            },
        },
        "id": "happy",
    }
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 5 Happy Path demo")
    parser.add_argument("--keep", action="store_true", help="保留 bundle 目录")
    args = parser.parse_args()

    register_executors()
    tmp = Path(tempfile.mkdtemp(prefix="fyu-happy-"))
    worker_dir = tmp / "worker"
    caller_dir = tmp / "caller"
    worker_port, caller_port = 9201, 9202

    print("[1/5] 创建 Worker Bundle（require_envelope=false，便于本地 RPC）")
    create_agent_bundle(worker_dir, name="HappyWorker", worker_only=True, a2a_port=worker_port, require_envelope=False)

    print("[2/5] 启动 Worker daemon")
    worker_proc = subprocess.Popen(
        [sys.executable, "-m", "fangyu", "bundle", "run", str(worker_dir), "--port", str(worker_port), "--daemon"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        health = _wait(f"http://127.0.0.1:{worker_port}/health")
        worker_name = health["agent"]
        print(f"      health OK — agent={worker_name}, mode={health.get('mode')}")

        print("[3/5] 本地 RPC（无信封）")
        task = _unsigned_rpc(
            f"http://127.0.0.1:{worker_port}/rpc",
            worker_name,
            "happy path local",
        )
        assert task["status"]["state"] == "completed", task
        print(f"      local RPC OK — state={task['status']['state']}")

        print("[4/5] 创建 Caller Bundle + 互设 trusted_peers（require_envelope=true）")
        create_agent_bundle(caller_dir, name="HappyCaller", worker_only=True, a2a_port=caller_port, require_envelope=True)
        worker_proc.terminate()
        worker_proc.wait(timeout=10)

        iface = worker_dir / "config" / "interfaces.json"
        cfg = json.loads(iface.read_text(encoding="utf-8"))
        cfg["trust_policy"]["require_envelope"] = True
        iface.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

        caller_ident = get_public_identity(load_agent_bundle(caller_dir))
        worker_ident = get_public_identity(load_agent_bundle(worker_dir))
        add_trusted_peer(worker_dir, caller_ident["agent_id"], caller_ident["public_key"])
        add_trusted_peer(caller_dir, worker_ident["agent_id"], worker_ident["public_key"])
        print("      trusted_peers 已自动配置")

        worker_proc = subprocess.Popen(
            [sys.executable, "-m", "fangyu", "bundle", "run", str(worker_dir), "--port", str(worker_port), "--daemon"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        _wait(f"http://127.0.0.1:{worker_port}/health")

        print("[5/5] 跨 Bundle 加密 RPC")
        caller_bundle = load_agent_bundle(caller_dir)
        agent_id, identity = identity_from_bundle(caller_bundle)
        signed_task = rpc_call(
            f"http://127.0.0.1:{worker_port}/rpc",
            "a2a.send_message",
            {
                "targetAgent": worker_name,
                "message": {
                    "role": "user",
                    "parts": [{"type": "text", "text": "happy path cross-bundle signed"}],
                    "metadata": {"skill_id": "default"},
                },
            },
            agent_id=agent_id,
            identity=identity,
            req_id="happy5",
        )
        assert signed_task["status"]["state"] == "completed", signed_task
        print(f"      signed cross-bundle RPC OK — state={signed_task['status']['state']}")
        print("\n[OK] Happy Path 全绿 — 5 步完成，无手改 identity.json / interfaces.json")
        if args.keep:
            print(f"bundle 保留于 {tmp}")
        return 0
    finally:
        worker_proc.terminate()
        worker_proc.wait(timeout=10)
        if not args.keep:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
