"""engine.skill — 技能注册与学习解析"""
from pathlib import Path

import pytest

from fangyu.engine import skill


@pytest.fixture(autouse=True)
def _isolate_skills(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    skills_dir = tmp_path / "skills"
    skills_dir.mkdir()
    monkeypatch.setattr(skill, "SKILLS_DIR", skills_dir)
    monkeypatch.setattr(skill, "REGISTRY_FILE", skills_dir / "registry.json")
    yield


def test_create_list_get_delete():
    out = skill.create_skill("greet", "say hi", "# greet\nhello")
    assert out["success"] is True
    assert len(skill.list_skills()) == 1
    assert skill.get_skill_content("greet") == "# greet\nhello"
    assert skill.create_skill("greet", "dup", "x")["success"] is False
    assert skill.delete_skill("greet")["success"] is True
    assert skill.list_skills() == []
    assert skill.get_skill_content("greet") is None


def test_edit_skill_bumps_version():
    skill.create_skill("s1", "d", "v1")
    out = skill.edit_skill("s1", "v2")
    assert out["success"] is True
    assert skill.get_skill_content("s1") == "v2"


def test_learn_from_llm_fenced_block():
    content = """
Here is a skill:
```skill
# summarize
Summarize text briefly.
```
"""
    results = skill.learn_from_llm(content)
    assert len(results) == 1
    assert results[0]["success"] is True
    assert results[0]["skill"]["name"] == "summarize"
    assert "Summarize" in (skill.get_skill_content("summarize") or "")
