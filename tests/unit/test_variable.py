"""engine.variable — 流程变量存取"""
import json
from pathlib import Path

import pytest

from fangyu.engine import variable


@pytest.fixture(autouse=True)
def _isolate_var_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    var_dir = tmp_path / "variables"
    var_dir.mkdir()
    monkeypatch.setattr(variable, "VAR_DIR", var_dir)
    monkeypatch.setattr(variable, "PERSISTENT_FILE", var_dir / "persistent.json")
    variable._ephemeral.clear()
    yield
    variable._ephemeral.clear()


def test_unknown_variable():
    assert variable.variable_get("no_such") is None
    assert variable.variable_set("no_such", 1)["success"] is False


def test_ephemeral_set_get_delete():
    assert variable.variable_set("last_search_results", [{"q": 1}])["persisted"] is False
    assert variable.variable_get("last_search_results") == [{"q": 1}]
    assert variable.variable_delete("last_search_results")["success"] is True
    assert variable.variable_get("last_search_results") == []


def test_persistent_roundtrip():
    profile = {"name": "Ada", "preferences": ["math"], "communication_style": "brief", "known_facts": []}
    out = variable.variable_set("user_profile", profile)
    assert out["success"] is True
    assert out["persisted"] is True
    assert variable.variable_get("user_profile")["name"] == "Ada"
    raw = json.loads(variable.PERSISTENT_FILE.read_text(encoding="utf-8"))
    assert raw["user_profile"]["name"] == "Ada"


def test_variable_list_includes_defs():
    names = {item["name"] for item in variable.variable_list()}
    assert "user_profile" in names
    assert "session_notes" in names
    assert "last_search_results" in names


def test_default_when_missing():
    assert variable.variable_get("session_notes") == ""
