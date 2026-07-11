"""Agent Bundle 单元测试"""
import json
from pathlib import Path

import pytest

from fangyu.core.agent_bundle import (
    create_agent_bundle,
    load_agent_bundle,
    normalize_flow,
    validate_bundle_integrity,
    bundle_to_flow_mappings,
)
from fangyu.a2a.trust.identity import AgentIdentity


def test_create_and_load_bundle(tmp_path):
    dest = tmp_path / "worker1"
    create_agent_bundle(dest, name="Worker1", worker_only=True, a2a_port=9101, require_envelope=True)
    bundle = load_agent_bundle(dest)
    assert bundle["manifest"]["platform"] == "fangyu"
    assert bundle["manifest"]["name"] == "Worker1"
    assert bundle["manifest"]["capabilities"]["worker_only"] is True
    assert bundle["manifest"]["capabilities"]["agent_kind"] == "worker"
    assert bundle["interfaces"]["trust_policy"]["require_envelope"] is True
    assert "default" in bundle["skills"]
    assert (dest / "start.bat").exists()
    assert (dest / "constitution.json").exists()


def test_custom_skill_flow(tmp_path):
    flow = {
        "nodes": [
            {"id": "s", "data": {"originType": "start", "config": {}, "label": "s"}},
            {"id": "c", "data": {"originType": "code", "config": {"code": "result = 'hi'"}, "label": "c"}},
        ],
        "edges": [{"source": "s", "target": "c", "data": {}}],
    }
    dest = tmp_path / "custom"
    create_agent_bundle(dest, name="Custom", skills={"run": flow})
    bundle = load_agent_bundle(dest)
    assert "run" in bundle["skills"]
    mappings = bundle_to_flow_mappings(bundle)
    assert len(mappings["run"]["nodes"]) == 2


def test_normalize_export_format_nodes():
    raw = {
        "nodes": [{"id": "a", "originType": "code", "config": {"code": "x=1"}, "label": "a"}],
        "links": [{"sourceNodeId": "a", "targetNodeId": "b", "linkType": "serial"}],
    }
    out = normalize_flow(raw)
    assert out["nodes"][0]["data"]["originType"] == "code"
    assert out["edges"][0]["source"] == "a"


def test_constitution_signature_invalid(tmp_path):
    dest = tmp_path / "bad"
    create_agent_bundle(dest, name="Bad")
    ident_path = dest / "identity.json"
    ident = json.loads(ident_path.read_text(encoding="utf-8"))
    ident["constitution"]["signature"] = "00" * 32
    ident_path.write_text(json.dumps(ident), encoding="utf-8")
    manifest = json.loads((dest / "manifest.json").read_text(encoding="utf-8"))
    with pytest.raises(Exception):
        validate_bundle_integrity(manifest, ident)


def test_identity_sign_verify_roundtrip():
    ident = AgentIdentity.generate()
    payload = '{"test": true}'
    sig = ident.sign(payload)
    assert AgentIdentity.verify(ident.public_key, payload, sig)
