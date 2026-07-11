"""Bundle MQTT 事件触发测试"""
import pytest
from fastapi.testclient import TestClient

from fangyu.core.agent_bundle import add_mqtt_trigger, create_agent_bundle, load_agent_bundle
from fangyu.engine.bundle_mqtt_trigger import get_bundle_mqtt_trigger, reset_bundle_mqtt_trigger_for_tests, start_bundle_mqtt_triggers
from fangyu.engine.bundle_runtime import create_bundle_app
from fangyu.engine.executor import register_executors
from fangyu.engine.a2a_runtime import AgentBus


@pytest.fixture(autouse=True)
def _reset_trigger():
    reset_bundle_mqtt_trigger_for_tests()
    yield
    reset_bundle_mqtt_trigger_for_tests()


@pytest.fixture()
def mqtt_bundle(tmp_path):
    dest = tmp_path / "mqtt-worker"
    create_agent_bundle(
        dest,
        name="MqttWorker",
        worker_only=True,
        require_envelope=False,
        mqtt_triggers=[{"topic": "fangyu/tasks", "skill_id": "default", "use_sim": True}],
    )
    return dest


def test_add_mqtt_trigger_idempotent(tmp_path):
    dest = tmp_path / "agent"
    create_agent_bundle(dest, name="A")
    add_mqtt_trigger(dest, "fangyu/tasks", skill_id="default")
    add_mqtt_trigger(dest, "fangyu/tasks", skill_id="industrial")
    cfg = load_agent_bundle(dest)["interfaces"]
    triggers = cfg["event_triggers"]["mqtt"]
    assert len([t for t in triggers if t["topic"] == "fangyu/tasks"]) == 1
    assert triggers[0]["skill_id"] == "industrial"


def test_mqtt_trigger_runs_skill(mqtt_bundle):
    register_executors()
    with TestClient(create_bundle_app(str(mqtt_bundle))[0]) as client:
        trigger = get_bundle_mqtt_trigger()
        assert trigger is not None
        assert len(trigger.status()["triggers"]) == 1

        trigger.publish_sim("fangyu/tasks", {"query": "from mqtt event"})
        result_file = mqtt_bundle / "workspace" / "result.txt"
        assert result_file.exists()
        assert "from mqtt event" in result_file.read_text(encoding="utf-8")

        health = client.get("/health").json()
        assert health["mqtt_triggers"]["started"] is True


def test_mqtt_trigger_without_config(tmp_path):
    register_executors()
    dest = tmp_path / "plain"
    create_agent_bundle(dest, name="Plain", require_envelope=False)
    bundle = load_agent_bundle(dest)
    bus = AgentBus(enable_trust=False)
    trigger = start_bundle_mqtt_triggers(bundle, "Plain", bus)
    assert trigger.status()["triggers"] == []
