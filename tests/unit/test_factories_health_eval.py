"""工厂健康快照写入 Eval 报告摘要。"""
from __future__ import annotations


def test_collect_factories_health_snapshot(monkeypatch):
    from fangyu.core import a2a_factories as fac

    monkeypatch.setattr(
        fac,
        "list_factories_enriched",
        lambda ttl_sec=120.0: [
            {
                "id": "east",
                "label": "东厂",
                "base_url": "http://e",
                "online": False,
                "health": {"score": 30, "grade": "D"},
            },
            {
                "id": "west",
                "label": "西厂",
                "base_url": "http://w",
                "online": True,
                "health": {"score": 90, "grade": "A"},
            },
        ],
    )
    snap = fac.collect_factories_health_snapshot()
    assert snap["count"] == 2
    assert snap["offline"] == 1
    assert snap["online"] == 1
    assert snap["avg_score"] == 60.0
    assert snap["min_score"] == 30
    assert snap["factories"][0]["id"] == "east"


def test_summarize_report_includes_factories_health():
    from fangyu.core.factory_eval import summarize_report

    row = summarize_report({
        "ts": 1.0,
        "exit_code": 0,
        "ok": True,
        "live_skipped": True,
        "skip_live": True,
        "stages": {"unit": {"ok": True}},
        "factories_health": {
            "count": 2,
            "online": 1,
            "offline": 1,
            "avg_score": 60.0,
            "min_score": 30,
            "factories": [{"id": "east", "score": 30}],
        },
    })
    assert row["factories_health"]["offline"] == 1
    assert row["factories_health"]["avg_score"] == 60.0
    assert "factories" not in row["factories_health"]


def test_compare_eval_reports_health_diff():
    from fangyu.core.factory_eval import compare_eval_reports

    newer = {
        "ts": 2.0,
        "exit_code": 0,
        "ok": True,
        "stages": {"unit": {"ok": True}},
        "factories_health": {
            "count": 2,
            "online": 1,
            "offline": 1,
            "avg_score": 55.0,
            "min_score": 20,
        },
    }
    older = {
        "ts": 1.0,
        "exit_code": 0,
        "ok": True,
        "stages": {"unit": {"ok": True}},
        "factories_health": {
            "count": 2,
            "online": 2,
            "offline": 0,
            "avg_score": 80.0,
            "min_score": 70,
        },
    }
    cmp = compare_eval_reports(newer, older)
    assert cmp["ok"] is True
    assert cmp["changed"] is True
    diff = cmp["factories_health_diff"]
    assert diff["changed"] is True
    assert diff["avg_score_delta"] == -25.0
    assert diff["offline_delta"] == 1
