#!/usr/bin/env python3
"""跨进程多 Agent 协作演示 — 模拟两台客户端通过 JSON-RPC 调用同一 fangyu 服务端。

用法:
  # 终端 1：启动服务端
  py -m fangyu --server

  # 终端 2：运行演示（部署 Search/Analyze Agent 并链式调用）
  py -3 scripts/a2a_multi_agent_demo.py
  py -3 scripts/a2a_multi_agent_demo.py --base http://127.0.0.1:8000
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request


def rpc(base: str, method: str, params: dict | None = None, req_id: str = "demo") -> dict:
    url = f"{base.rstrip('/')}/api/v1/a2a/rpc"
    payload = {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": req_id}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if "error" in data:
        raise RuntimeError(data["error"])
    return data.get("result", {})


def deploy_agents(base: str) -> None:
    url = f"{base.rstrip('/')}/api/v1/a2a/agents/deploy"
    body = {
        "agents": [
            {
                "name": "SearchAgent",
                "card": {
                    "name": "SearchAgent",
                    "version": "1.0.0",
                    "description": "Collect raw info",
                    "skills": [{"id": "search", "name": "Search", "description": "Search step"}],
                },
                "flow_mappings": {
                    "search": {
                        "nodes": [
                            {"id": "s", "data": {"originType": "start", "label": "s", "config": {}}},
                            {"id": "c", "data": {"originType": "code", "label": "c", "config": {"code": "result = 'facts about: ' + str(_input.get('query',''))"}}},
                            {"id": "o", "data": {"originType": "output", "label": "o", "config": {}}},
                        ],
                        "edges": [{"source": "s", "target": "c"}, {"source": "c", "target": "o"}],
                    }
                },
                "trust": {"enabled": False},
            },
            {
                "name": "AnalyzeAgent",
                "card": {
                    "name": "AnalyzeAgent",
                    "version": "1.0.0",
                    "description": "Analyze collected info",
                    "skills": [{"id": "analyze", "name": "Analyze", "description": "Analyze step"}],
                },
                "flow_mappings": {
                    "analyze": {
                        "nodes": [
                            {"id": "s", "data": {"originType": "start", "label": "s", "config": {}}},
                            {"id": "c", "data": {"originType": "code", "label": "c", "config": {"code": "result = 'analysis: ' + str(_input.get('query',''))[:80]"}}},
                            {"id": "o", "data": {"originType": "output", "label": "o", "config": {}}},
                        ],
                        "edges": [{"source": "s", "target": "c"}, {"source": "c", "target": "o"}],
                    }
                },
                "trust": {"enabled": False},
            },
        ]
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        print("Deploy:", json.loads(resp.read().decode("utf-8")))


def send_skill(base: str, agent: str, skill_id: str, text: str, prior: str = "") -> str:
    content = f"{prior}\n{text}".strip() if prior else text
    msg = {
        "role": "user",
        "parts": [{"type": "text", "text": content}],
        "metadata": {"skill_id": skill_id},
    }
    task = rpc(base, "a2a.send_message", {"targetAgent": agent, "message": msg}, req_id=f"{agent}-{skill_id}")
    output = task.get("output") or {}
    if isinstance(output, dict):
        return str(output.get("result") or output)
    return str(output)


def main() -> int:
    parser = argparse.ArgumentParser(description="Multi-agent cross-process A2A demo")
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--query", default="远程办公的利弊")
    args = parser.parse_args()

    try:
        deploy_agents(args.base)
        print("\n=== 多 Agent 链式协作（跨 RPC）===\n")
        step1 = send_skill(args.base, "SearchAgent", "search", args.query)
        print(f"[SearchAgent] {step1}\n")
        step2 = send_skill(args.base, "AnalyzeAgent", "analyze", step1)
        print(f"[AnalyzeAgent] {step2}\n")
        print("Done.")
        return 0
    except urllib.error.URLError as e:
        print(f"连接失败: {e}", file=sys.stderr)
        return 1
    except RuntimeError as e:
        print(f"RPC 错误: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
