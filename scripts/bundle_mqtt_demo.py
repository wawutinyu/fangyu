#!/usr/bin/env python3
"""Bundle MQTT 事件触发演示 — mqtt_sim publish → 自动跑 Action Loop skill。"""
from __future__ import annotations

import tempfile
from pathlib import Path

from fangyu.core.agent_bundle import create_agent_bundle
from fangyu.engine.bundle_mqtt_trigger import get_bundle_mqtt_trigger
from fangyu.engine.bundle_runtime import create_bundle_app
from fangyu.engine.executor import register_executors
from fastapi.testclient import TestClient


def main() -> int:
    register_executors()
    tmp = Path(tempfile.mkdtemp(prefix="fyu-mqtt-"))
    bundle_dir = tmp / "worker"
    topic = "fangyu/tasks"

    create_agent_bundle(
        bundle_dir,
        name="MqttWorker",
        worker_only=True,
        require_envelope=False,
        mqtt_triggers=[{"topic": topic, "skill_id": "default", "use_sim": True}],
    )

    app, _ = create_bundle_app(str(bundle_dir))
    with TestClient(app) as client:
        health = client.get("/health").json()
        print(f"[1/2] daemon OK — mqtt triggers: {health.get('mqtt_triggers')}")

        trigger = get_bundle_mqtt_trigger()
        assert trigger is not None
        trigger.publish_sim(topic, {"query": "bundle mqtt trigger demo"})
        print("[2/2] published mqtt event")

        result_path = bundle_dir / "workspace" / "result.txt"
        text = result_path.read_text(encoding="utf-8")
        print(f"workspace/result.txt → {text}")
        print(f"bundle kept at {bundle_dir}")
    print("[OK] MQTT trigger demo completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
