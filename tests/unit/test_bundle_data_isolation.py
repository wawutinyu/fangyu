"""P0-1: Bundle 运行时使用包内 DATA_DIR / 宪法。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core import constitution as const_mod
from fangyu.core.agent_bundle import activate_bundle_runtime_context, create_agent_bundle
from fangyu.core.constitution import load_constitution
from fangyu.engine.bundle_runtime import create_bundle_app


@pytest.fixture()
def restore_data_dir():
    prev = Path(config_mod.DATA_DIR)
    yield
    config_mod.set_data_dir(prev)


def test_activate_bundle_uses_bundle_constitution(tmp_path, restore_data_dir):
    dest = tmp_path / "iso-agent"
    create_agent_bundle(dest, name="Iso", require_envelope=False)
    # 包根宪法改成可识别名字
    custom = {
        **load_constitution(),
        "name": "bundle-only-constitution",
        "version": "bundle-9.9",
        "forbidden_actions": [],
    }
    (dest / "constitution.json").write_text(json.dumps(custom, ensure_ascii=False), encoding="utf-8")
    # 宿主 DATA_DIR 放一个不同宪法，证明切换后不会读到它
    host_data = tmp_path / "host-data"
    host_data.mkdir()
    (host_data / "constitution.json").write_text(
        json.dumps({**custom, "name": "host-constitution", "version": "host-1"}, ensure_ascii=False),
        encoding="utf-8",
    )
    config_mod.set_data_dir(host_data)
    assert load_constitution()["name"] == "host-constitution"

    data_dir = activate_bundle_runtime_context(dest)
    assert data_dir == (dest / "data").resolve()
    assert config_mod.DATA_DIR == data_dir
    loaded = load_constitution()
    assert loaded["name"] == "bundle-only-constitution"
    assert loaded["version"] == "bundle-9.9"
    assert const_mod.CONSTITUTION_FILE == data_dir / "constitution.json"


def test_create_bundle_app_health_exposes_data_dir(tmp_path, restore_data_dir):
    dest = tmp_path / "health-agent"
    create_agent_bundle(dest, name="Health", require_envelope=False)
    app, name = create_bundle_app(str(dest))
    assert name == "Health"
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data_dir"] == str((dest / "data").resolve())
    assert load_constitution()  # 不抛；路径已在包内
