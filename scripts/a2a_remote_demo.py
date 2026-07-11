#!/usr/bin/env python3
"""跨机器 A2A 演示 — 通过 JSON-RPC HTTP 调用远程 Agent。

用法（需 fangyu 后端已启动）:
  py -3 scripts/a2a_remote_demo.py
  py -3 scripts/a2a_remote_demo.py --base http://192.168.1.10:8000
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request


def rpc(base_url: str, method: str, params: dict | None = None) -> dict:
    url = f"{base_url.rstrip('/')}/api/v1/a2a/rpc"
    payload = {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": "demo-1"}
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


def deploy_echo_agent(base: str) -> None:
    """注册一个 echo Agent（若已存在则跳过）。"""
    deploy_url = f"{base.rstrip('/')}/api/v1/a2a/agents/deploy"
    body = {
        "agents": [{
            "name": "Echo",
            "card": {
                "name": "Echo",
                "version": "1.0.0",
                "description": "Remote echo agent for A2A demo",
                "capabilities": {"streaming": False, "pushNotifications": False},
                "skills": [{"id": "echo", "name": "Echo", "description": "Echo user text", "tags": ["demo"]}],
                "defaultInterface": {"type": "http", "url": f"{base.rstrip('/')}/api/v1/a2a/rpc"},
            },
            "flow_mappings": {
                "echo": {
                    "nodes": [
                        {"id": "s", "data": {"originType": "start", "label": "start", "config": {}}},
                        {"id": "o", "data": {"originType": "output", "label": "output", "config": {}}},
                    ],
                    "edges": [{"source": "s", "target": "o", "data": {}}],
                }
            },
            "trust": {"enabled": False},
        }]
    }
    req = urllib.request.Request(
        deploy_url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print("Deploy:", resp.read().decode("utf-8")[:200])
    except urllib.error.HTTPError as e:
        print("Deploy note:", e.read().decode("utf-8", errors="replace")[:200])


def main() -> int:
    parser = argparse.ArgumentParser(description="A2A remote JSON-RPC demo")
    parser.add_argument("--base", default="http://127.0.0.1:8000", help="fangyu API base URL")
    args = parser.parse_args()
    base = args.base

    print(f"=== A2A Remote Demo → {base} ===")

    deploy_echo_agent(base)

    agents = rpc(base, "a2a.list_agents")
    print(f"Agents: {json.dumps(agents, ensure_ascii=False)}")

    target = "Echo"
    if not any(a.get("name") == target for a in (agents if isinstance(agents, list) else [])):
        names = [a.get("name") for a in agents] if isinstance(agents, list) else []
        if names:
            target = names[0]
        else:
            print("No agents registered. Deploy one from Agent Canvas first.")
            return 1

    task = rpc(base, "a2a.send_message", {
        "targetAgent": target,
        "message": {"role": "user", "parts": [{"type": "text", "text": "Hello from remote A2A client"}]},
    })
    print(f"Task submitted: {task.get('id')} state={task.get('status', {}).get('state')}")

    if task.get("id"):
        detail = rpc(base, "a2a.get_task", {"taskId": task["id"]})
        print(f"Task detail: {json.dumps(detail, ensure_ascii=False)[:500]}")

    print("=== Done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
