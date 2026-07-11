"""Run a parity fixture through the fangyu engine; print outputs keyed by node label."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests" / "unit"))

from flow_test_helpers import run_flow_sync  # noqa: E402
from fangyu.engine.executor import register_executors  # noqa: E402


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


def main() -> None:
    register_executors()
    fixture = json.load(sys.stdin)
    result = run_flow_sync(
        _to_engine_nodes(fixture["nodes"]),
        _to_engine_edges(fixture["edges"]),
        external_inputs=fixture.get("external_inputs") or {},
    )
    by_label = {row["nodeName"]: row.get("outputs") or {} for row in result.get("results", [])}
    print(json.dumps({"success": result.get("success"), "outputs": by_label}, ensure_ascii=False))


if __name__ == "__main__":
    main()
