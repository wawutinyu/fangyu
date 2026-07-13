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


def test_audit_chain_limit_window_does_not_false_fail(tmp_path, monkeypatch):
    """长日志 + limit 截断时，不应因非创世起点误报 prev_hash_mismatch。"""
    audit = tmp_path / "audit.log"
    monkeypatch.setattr(const, "AUDIT_FILE", audit)
    monkeypatch.setattr(const, "CONSTITUTION_FILE", tmp_path / "c.json")
    const.CONSTITUTION_FILE.write_text(json.dumps({"require_audit": True}), encoding="utf-8")

    for i in range(5):
        const.audit_event(f"event_{i}", {"n": i})

    full = const.verify_audit_chain(limit=0)
    assert full["valid"] is True
    assert full["checked"] == 5
    assert full["window_truncated"] is False

    window = const.verify_audit_chain(limit=2)
    assert window["valid"] is True
    assert window["checked"] == 2
    assert window["window_truncated"] is True
