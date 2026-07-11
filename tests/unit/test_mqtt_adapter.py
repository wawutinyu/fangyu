"""MQTT adapter 与 env 私钥测试"""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from fangyu.adapters import AdapterRegistry, MqttClientAdapter, ensure_default_adapters
from fangyu.a2a.payload import Payload
from fangyu.core.agent_bundle import create_agent_bundle, load_agent_bundle, resolve_agent_identity
from fangyu.engine.bundle_a2a_client import identity_from_bundle


@pytest.fixture(autouse=True)
def _adapters():
    AdapterRegistry.clear()
    ensure_default_adapters()
    yield
    AdapterRegistry.clear()


def test_mqtt_client_ingest_emit_without_broker():
    adapter = MqttClientAdapter(host="127.0.0.1", port=1883)
    payload = adapter.ingest({"topic": "sensors/temp", "payload": {"value": 25.5, "unit": "C"}})
    assert payload.body["protocol"] == "mqtt"
    assert payload.body["value"] == 25.5
    health = adapter.health()
    assert health["name"] == "mqtt"
    if not adapter.available:
        assert health["status"] == "unavailable"


@patch("fangyu.adapters.mqtt_client.mqtt")
def test_mqtt_client_publish_mock(mock_mqtt_module):
    mock_client = MagicMock()
    mock_mqtt_module.Client.return_value = mock_client
    mock_mqtt_module.MQTTv311 = 4

    adapter = MqttClientAdapter(host="broker.local", port=1883, client_id="test")
    adapter._connected = True
    adapter._client = mock_client

    result = adapter.publish("fangyu/cmd/test", {"value": 1})
    mock_client.publish.assert_called_once()
    assert result["topic"] == "fangyu/cmd/test"


def test_mqtt_registered_when_paho_available():
    adapter = AdapterRegistry.get("mqtt")
    if MqttClientAdapter().available:
        assert adapter is not None
        assert adapter.name == "mqtt"
    else:
        assert adapter is None


def test_resolve_identity_from_env(tmp_path, monkeypatch):
    from fangyu.a2a.trust.identity import AgentIdentity

    ident = AgentIdentity.generate()
    dest = tmp_path / "env-agent"
    create_agent_bundle(dest, name="EnvAgent", identity=ident, embed_private_key=False)
    bundle = load_agent_bundle(dest)
    assert "private_key_hex" not in bundle["identity"]

    with pytest.raises(Exception):
        resolve_agent_identity(bundle)

    monkeypatch.setenv("FANGYU_AGENT_PRIVATE_KEY", ident.private_key_bytes.hex())
    resolved = resolve_agent_identity(bundle)
    assert resolved.public_key == ident.public_key
    agent_id, from_client = identity_from_bundle(bundle)
    assert from_client.public_key == ident.public_key
    assert agent_id == bundle["identity"]["agent_id"]


def test_embed_private_key_default_true(tmp_path):
    dest = tmp_path / "embedded"
    create_agent_bundle(dest, name="Embedded")
    bundle = load_agent_bundle(dest)
    assert bundle["identity"].get("private_key_hex")
