"""导出代码与引擎一致性 — 共享 fixture 回归。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from flow_test_helpers import run_flow_sync
from fangyu.engine.executor import register_executors

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "export_parity"


def _load_fixtures() -> list[dict]:
    fixtures = []
    for path in sorted(FIXTURE_DIR.glob("*.json")):
        fixtures.append(json.loads(path.read_text(encoding="utf-8")))
    return fixtures


def _to_engine_nodes(raw_nodes: list[dict]) -> list[dict]:
    out = []
    for n in raw_nodes:
        data: dict = {
            "originType": n["originType"],
            "label": n["label"],
            "config": n.get("config", {}),
        }
        if "inner_nodes" in n:
            data["inner_nodes"] = n["inner_nodes"]
        if "inner_links" in n:
            data["inner_links"] = n["inner_links"]
        out.append({"id": n["id"], "data": data})
    return out


def _to_engine_edges(raw_edges: list[dict]) -> list[dict]:
    return [
        {
            "source": e["source"],
            "target": e["target"],
            "data": {"linkType": "serial", "mappings": e.get("mappings", {})},
        }
        for e in raw_edges
    ]


def _get_field(outputs: dict, field: str):
    cur = outputs
    for part in field.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _outputs_by_label(result: dict) -> dict[str, dict]:
    return {row["nodeName"]: row.get("outputs") or {} for row in result.get("results", [])}


@pytest.fixture(scope="module", autouse=True)
def _ensure_executors():
    register_executors()


@pytest.mark.parametrize("fixture", _load_fixtures(), ids=lambda f: f["name"])
def test_engine_matches_export_parity_fixture(fixture: dict):
    result = run_flow_sync(
        _to_engine_nodes(fixture["nodes"]),
        _to_engine_edges(fixture["edges"]),
        external_inputs=fixture.get("external_inputs") or {},
    )
    assert result.get("success") is True, result.get("error")
    by_label = _outputs_by_label(result)
    for check in fixture.get("checks", []):
        outputs = by_label.get(check["label"])
        assert outputs is not None, f"节点 {check['label']} 无输出"
        actual = _get_field(outputs, check["field"])
        assert actual == check["value"], f"{check['label']}.{check['field']}: {actual!r} != {check['value']!r}"
