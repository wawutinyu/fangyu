#!/usr/bin/env python3
"""产线 Demo — 模拟 PLC 事件 → Worker Agent → 自动降速。"""
from __future__ import annotations

import argparse
import json
import urllib.request


def _post(url: str, body: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="PLC → Worker Agent demo")
    parser.add_argument("--base", default="http://127.0.0.1:8000", help="fangyu API base URL")
    parser.add_argument("--agent", default="LineWorker")
    args = parser.parse_args()
    base = args.base.rstrip("/")

    print("[1/4] 注册产线 Worker Agent …")
    _post(f"{base}/api/v1/adapters/plc/register_worker", {"name": args.agent})

    print("[2/4] 正常温度 35°C …")
    r1 = _post(f"{base}/api/v1/adapters/plc/dispatch", {
        "agent_name": args.agent, "tag": "temperature", "value": 35.0,
    })
    print(f"  worker → {r1['worker_output']}")

    print("[3/4] 告警温度 95°C …")
    r2 = _post(f"{base}/api/v1/adapters/plc/dispatch", {
        "agent_name": args.agent, "tag": "temperature", "value": 95.0,
    })
    print(f"  worker → {r2['worker_output']}")
    print(f"  PLC 命令 → {r2.get('plc_command')}")

    print("[4/4] 当前寄存器 …")
    print(json.dumps(r2.get("registers", {}), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
