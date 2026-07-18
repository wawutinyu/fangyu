"""G2-B: 飞书 / 通用 IM 入站。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.agent_factory import build_from_profile
from fangyu.engine.im_feishu import bind_feishu_channel, extract_feishu_text, handle_feishu_event
from fangyu.engine.im_inbound import handle_inbound_text, load_im_config


@pytest.fixture()
def restore_data_dir():
    prev = Path(config_mod.DATA_DIR)
    yield
    config_mod.set_data_dir(prev)


def test_extract_feishu_text_shapes():
    assert extract_feishu_text({"text": "hi"}) == "hi"
    assert extract_feishu_text({
        "event": {"message": {"content": json.dumps({"text": "你好"})}},
    }) == "你好"
    assert extract_feishu_text({"type": "url_verification", "challenge": "c"}) is None


def test_feishu_challenge(tmp_path, restore_data_dir):
    root = build_from_profile("workbuddy", tmp_path / "b", name="IM")
    bind_feishu_channel(root, verification_token="tok")
    out = handle_feishu_event(root, {
        "type": "url_verification",
        "challenge": "abc123",
        "token": "tok",
    })
    assert out["challenge"] == "abc123"
    assert out["ok"] is True


def test_feishu_inbound_mock_chat(tmp_path, restore_data_dir, monkeypatch):
    root = build_from_profile("workbuddy", tmp_path / "b2", name="IM2")
    bind_feishu_channel(root, mode="chat")
    cfg = load_im_config(root)
    assert cfg["channel"] == "feishu"

    async def fake_llm(messages):
        return json.dumps({"action": "done", "result": "im-pong"}, ensure_ascii=False)

    from fangyu.engine import exec_agent as ea
    from fangyu.engine.agent_loop import run_agent_loop as orig

    async def wrapped(*, goal, tools, llm, max_turns=8, system=None, **kwargs):
        return await orig(
            goal=goal, tools=tools, llm=fake_llm, max_turns=max_turns,
            system=system or kwargs.get("system") or "",
        )

    monkeypatch.setattr(ea, "run_agent_loop", wrapped)

    out = handle_feishu_event(root, {"text": "ping from feishu"})
    assert out.get("handled") is True
    assert out.get("reply") == "im-pong"
    outbox = root / "data" / "im_outbox.jsonl"
    assert outbox.is_file()
    line = outbox.read_text(encoding="utf-8").strip().splitlines()[-1]
    assert "ping from feishu" in line


def test_platform_im_routes(tmp_path, restore_data_dir, monkeypatch):
    from fangyu.server import app

    root = build_from_profile("workbuddy", tmp_path / "b3", name="IM3")
    bind_feishu_channel(root, verification_token="t")

    async def fake_llm(messages):
        return '{"action":"done","result":"ok"}'

    from fangyu.engine import exec_agent as ea
    from fangyu.engine.agent_loop import run_agent_loop as orig

    async def wrapped(*, goal, tools, llm, max_turns=8, system=None, **kwargs):
        return await orig(
            goal=goal, tools=tools, llm=fake_llm, max_turns=max_turns,
            system=system or "",
        )

    monkeypatch.setattr(ea, "run_agent_loop", wrapped)

    client = TestClient(app)
    r = client.post("/api/v1/im/default-bundle", json={"bundle_dir": str(root)})
    assert r.status_code == 200
    ch = client.post("/api/v1/im/feishu", json={
        "type": "url_verification",
        "challenge": "xyz",
        "token": "t",
    })
    assert ch.status_code == 200
    assert ch.json().get("challenge") == "xyz"

    inbound = client.post("/api/v1/im/inbound", json={"text": "hello"})
    assert inbound.status_code == 200
    assert inbound.json().get("reply") == "ok"
