"""审计链 hash 验证测试"""
import json

from fangyu.core import constitution as const


def test_audit_chain_links(tmp_path, monkeypatch):
    audit = tmp_path / "audit.log"
    monkeypatch.setattr(const, "AUDIT_FILE", audit)
    monkeypatch.setattr(const, "CONSTITUTION_FILE", tmp_path / "c.json")
    const.CONSTITUTION_FILE.write_text(json.dumps({"require_audit": True}), encoding="utf-8")

    const.audit_event("event_a", {"n": 1})
    const.audit_event("event_b", {"n": 2})

    result = const.verify_audit_chain()
    assert result["valid"] is True
    assert result["checked"] == 2

    lines = audit.read_text(encoding="utf-8").strip().splitlines()
    tampered = json.loads(lines[-1])
    tampered["details"] = {"n": 999}
    lines[-1] = json.dumps(tampered, ensure_ascii=False)
    audit.write_text("\n".join(lines) + "\n", encoding="utf-8")

    broken = const.verify_audit_chain()
    assert broken["valid"] is False
