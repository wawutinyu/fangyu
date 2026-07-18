#!/usr/bin/env python3
"""跨厂任务投递演示 — 本机起西厂 Bundle，东厂 RPC 投递，可选写 Presence。

用法::

    python scripts/cross_factory_task_demo.py
    python scripts/cross_factory_task_demo.py --port 9102 --message "你好西厂"

也可只加载回放样例（无需起服务）::

    # 观面板「跨厂投递」按钮，或：
    curl -X POST 'http://127.0.0.1:8000/api/v1/presence/replays/samples/cross-factory-task/load?persist=true'
"""
from __future__ import annotations

import argparse
import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_health(url: str, timeout: float = 20.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.25)
    raise TimeoutError(f"bundle not ready: {url}")


def _rpc(url: str, method: str, params: dict | None = None) -> dict:
    payload = {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": "cf-demo"}
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
    ap = argparse.ArgumentParser(description="跨厂任务投递演示")
    ap.add_argument("--port", type=int, default=0, help="西厂端口（0=自动）")
    ap.add_argument("--message", default="跨厂任务样例：汇总材料", help="投递正文")
    ap.add_argument("--keep", action="store_true", help="结束后保留 Bundle 目录与进程")
    args = ap.parse_args()

    from fangyu.core.agent_bundle import create_agent_bundle
    from fangyu.core.a2a_factories import upsert_factory
    from fangyu.core.collaboration import emit_event
    from fangyu.core.remote_hosts import upsert_remote_host

    port = args.port or _free_port()
    work = ROOT / "data" / "cross_factory_demo"
    west = work / "west-factory"
    if west.exists() and not args.keep:
        import shutil
        shutil.rmtree(west, ignore_errors=True)
    work.mkdir(parents=True, exist_ok=True)
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
    try:
        _wait_health(f"{base}/health")
        upsert_factory(base_url=base, label="西厂", rpc_url=rpc)
        upsert_remote_host(
            host_id="factory-west-demo",
            label="西厂",
            base_url=base,
            role="factory",
            meta={"source": "cross_factory_task_demo"},
        )
        emit_event(
            "factory.online",
            actor="host:factory-west-demo",
            message="演示：西厂在线",
            detail={"base_url": base, "role": "factory"},
        )
        result = _rpc(rpc, "a2a.send_message", {
            "targetAgent": "西厂执行",
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": args.message}],
                "metadata": {"skill_id": "default"},
            },
        })
        state = (result.get("status") or {}).get("state")
        emit_event(
            "a2a.send",
            actor="东厂调度",
            target="西厂执行",
            message=args.message,
            detail={"rpc_url": rpc, "via_host": "factory-east-demo", "demo": True},
        )
        emit_event(
            "a2a.complete",
            actor="西厂执行",
            target="东厂调度",
            message=f"state={state}",
            detail={"rpc_url": rpc, "demo": True},
        )
        print(json.dumps({
            "ok": state == "completed",
            "base_url": base,
            "rpc_url": rpc,
            "state": state,
            "hint": "观面板可点「跨厂投递」加载回放样例；或刷新 Presence 看实时事件",
        }, ensure_ascii=False, indent=2))
        return 0 if state == "completed" else 1
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        if not args.keep:
            import shutil
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
