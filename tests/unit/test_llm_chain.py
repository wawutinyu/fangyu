"""llm→llm 串行：上游 result 进入下游 prompt。"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from flow_test_helpers import edge, node, run_flow_sync
from fangyu.engine.executor import register_executors


@pytest.fixture(scope="module", autouse=True)
def _ensure_executors():
    register_executors()


@patch("fangyu.engine.exec_ai.chat_completion", new_callable=AsyncMock)
def test_llm_to_llm_chain(mock_chat):
    mock_chat.side_effect = [
        {"result": "draft-1", "usage": {}},
        {"result": "polished-draft-1", "usage": {}},
    ]
    nodes = [
        node("s", "start"),
        node("l1", "llm", config={"model": "mock", "prompt": "起草：{{input}}"}),
        node("l2", "llm", config={"model": "mock", "prompt": "润色：{{input}}"}),
        node("o", "output"),
    ]
    edges = [edge("s", "l1"), edge("l1", "l2"), edge("l2", "o")]
    result = run_flow_sync(nodes, edges, external_inputs={"input": "主题"})
    assert result["success"] is True
    out = next(r for r in result["results"] if r["type"] == "output")
    assert out["outputs"].get("result") == "polished-draft-1"
    assert mock_chat.await_count == 2
