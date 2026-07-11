#!/usr/bin/env python3
"""MQTT → Worker Agent 演示 — 默认 mqtt_sim；加 --real 需本地 broker + paho-mqtt。"""
from __future__ import annotations

import argparse
import json
import urllib.request


def _post(base: str, path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{base.rstrip('/')}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="MQTT dispatch demo")
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--agent", default="MqttWorker")
    parser.add_argument("--topic", default="plc/line1/temperature")
    parser.add_argument("--value", type=float, default=95.0)
    parser.add_argument("--real", action="store_true", help="使用真实 mqtt adapter（需 broker）")
    args = parser.parse_args()

    print(f"[1/3] 注册 Worker → {args.agent}")
    _post(args.base, "/api/v1/adapters/plc/register_worker", {"name": args.agent})

    print(f"[2/3] MQTT dispatch topic={args.topic} value={args.value} real={args.real}")
    result = _post(args.base, "/api/v1/adapters/mqtt/dispatch", {
        "agent_name": args.agent,
        "skill_id": "industrial",
        "topic": args.topic,
        "payload": {"value": args.value, "unit": "C", "alarm": args.value >= 90},
        "use_sim": not args.real,
    })

    print(f"[3/3] worker_output={result.get('worker_output')}")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
