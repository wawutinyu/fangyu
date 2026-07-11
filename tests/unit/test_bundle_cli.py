"""Bundle CLI 单元测试"""
import json
import sys

import pytest

from fangyu.core.agent_bundle import create_agent_bundle, load_agent_bundle
from fangyu.engine.bundle_cli import main as bundle_cli_main


@pytest.fixture()
def sample_bundle(tmp_path):
    dest = tmp_path / "cli-agent"
    create_agent_bundle(dest, name="CliAgent", require_envelope=False)
    return dest


def test_bundle_validate_ok(sample_bundle):
    rc = bundle_cli_main(["validate", str(sample_bundle)])
    assert rc == 0


def test_bundle_validate_missing(tmp_path):
    rc = bundle_cli_main(["validate", str(tmp_path / "missing")])
    assert rc == 1


def test_bundle_trust_add(sample_bundle, tmp_path):
    peer = tmp_path / "peer"
    create_agent_bundle(peer, name="PeerAgent", require_envelope=False)
    rc = bundle_cli_main(["trust", "add", str(sample_bundle), "--from", str(peer)])
    assert rc == 0
    cfg = json.loads((sample_bundle / "config" / "interfaces.json").read_text(encoding="utf-8"))
    peer_id = load_agent_bundle(peer)["identity"]["agent_id"]
    assert any(p["agent_id"] == peer_id for p in cfg["trust_policy"]["trusted_peers"])
