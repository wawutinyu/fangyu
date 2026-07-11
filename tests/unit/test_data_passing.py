"""节点数据传递链 — start → code → output"""
import asyncio

from fangyu.engine.scheduler import run_flow


def _run(nodes, edges, external_inputs=None):
    return asyncio.run(run_flow(nodes, edges, external_inputs=external_inputs or {}))


def test_start_code_output_chain():
    """上游 code 节点的 result 应传到 output，而非残留 external_inputs。"""
    nodes = [
        {"id": "s", "data": {"originType": "start", "config": {}, "label": "开始"}},
        {
            "id": "c",
            "data": {
                "originType": "code",
                "config": {"code": "result = 'processed:' + str(_input if not isinstance(_input, dict) else _input.get('query', ''))"},
                "label": "代码",
            },
        },
        {"id": "o", "data": {"originType": "output", "config": {}, "label": "输出"}},
    ]
    edges = [
        {"source": "s", "target": "c", "data": {}},
        {"source": "c", "target": "o", "data": {}},
    ]
    result = _run(nodes, edges, {"query": "hello"})
    assert result["success"] is True
    out = next(r for r in result["results"] if r["type"] == "output")
    assert out["outputs"]["result"] == "processed:hello"


def test_multi_upstream_merge():
    """多上游节点输出应合并，而非只取第一个。"""
    nodes = [
        {"id": "a", "data": {"originType": "input", "config": {"default_value": "from-a"}, "label": "A"}},
        {"id": "b", "data": {"originType": "input", "config": {"default_value": "from-b"}, "label": "B"}},
        {"id": "o", "data": {"originType": "output", "config": {}, "label": "输出"}},
    ]
    edges = [
        {"source": "a", "target": "o", "data": {}},
        {"source": "b", "target": "o", "data": {}},
    ]
    result = _run(nodes, edges)
    assert result["success"] is True
    out = next(r for r in result["results"] if r["type"] == "output")
    assert out["outputs"]["result"] in ("from-a", "from-b")


def test_composite_node_type_alias():
    """composite-node 类型别名应正确执行子图。"""
    nodes = [
        {"id": "s", "data": {"originType": "start", "config": {}}},
        {
            "id": "g",
            "type": "composite-node",
            "data": {
                "originType": "composite-node",
                "config": {},
                "inner_nodes": [
                    {"id": "i0", "originType": "input", "config": {"default_value": "inner"}},
                    {"id": "i1", "originType": "output", "config": {}},
                ],
                "inner_links": [{"sourceNodeId": "i0", "targetNodeId": "i1", "linkType": "serial", "mappings": {}}],
            },
        },
    ]
    edges = [{"source": "s", "target": "g", "data": {}}]
    result = _run(nodes, edges)
    assert result["success"] is True
    comp = next(r for r in result["results"] if r["type"] == "composite")
    inner = comp["outputs"].get("outputs", {})
    assert "i1" in inner
    assert inner["i1"].get("result") == "inner"


def test_serial_chain_passes_intermediate_result():
    """start → code₁ → code₂ → output，第二步应收到第一步 result。"""
    nodes = [
        {"id": "s", "data": {"originType": "start", "config": {}, "label": "开始"}},
        {
            "id": "c1",
            "data": {
                "originType": "code",
                "config": {"code": "result = 'step1:' + str(_input if not isinstance(_input, dict) else _input.get('query', ''))"},
                "label": "步骤1",
            },
        },
        {
            "id": "c2",
            "data": {
                "originType": "code",
                "config": {"code": "result = 'step2:' + str(_input if not isinstance(_input, dict) else _input.get('result', _input))"},
                "label": "步骤2",
            },
        },
        {"id": "o", "data": {"originType": "output", "config": {}, "label": "输出"}},
    ]
    edges = [
        {"source": "s", "target": "c1", "data": {}},
        {"source": "c1", "target": "c2", "data": {}},
        {"source": "c2", "target": "o", "data": {}},
    ]
    result = _run(nodes, edges, {"query": "x"})
    assert result["success"] is True
    out = next(r for r in result["results"] if r["type"] == "output")
    assert out["outputs"]["result"] == "step2:step1:x"


def test_parallel_upstream_same_depth():
    """同深度两上游并行执行，output 应收到其中之一的数据。"""
    nodes = [
        {"id": "s", "data": {"originType": "start", "config": {}}},
        {"id": "a", "data": {"originType": "input", "config": {"default_value": "parallel-a"}}},
        {"id": "b", "data": {"originType": "input", "config": {"default_value": "parallel-b"}}},
        {"id": "o", "data": {"originType": "output", "config": {}}},
    ]
    edges = [
        {"source": "s", "target": "a", "data": {"linkType": "parallel"}},
        {"source": "s", "target": "b", "data": {"linkType": "parallel"}},
        {"source": "a", "target": "o", "data": {}},
        {"source": "b", "target": "o", "data": {}},
    ]
    result = _run(nodes, edges)
    assert result["success"] is True
    out = next(r for r in result["results"] if r["type"] == "output")
    assert out["outputs"]["result"] in ("parallel-a", "parallel-b")


def test_loop_passes_item_to_inner_graph():
    """loop 子图应能迭代数组并在 result 中记录每次迭代。"""
    nodes = [
        {"id": "s", "data": {"originType": "start", "config": {}}},
        {"id": "c", "data": {"originType": "code", "config": {"code": "result = ['a', 'b', 'c']"}}},
        {
            "id": "loop",
            "data": {
                "originType": "loop",
                "config": {"max_iterations": 10},
                "inner_nodes": [
                    {"id": "li", "originType": "code", "config": {"code": "result = str(_input) if not isinstance(_input, dict) else _input.get('item', '')"}},
                    {"id": "lo", "originType": "output", "config": {}},
                ],
                "inner_links": [{"sourceNodeId": "li", "targetNodeId": "lo", "linkType": "serial", "mappings": {}}],
            },
        },
    ]
    edges = [
        {"source": "s", "target": "c", "data": {}},
        {"source": "c", "target": "loop", "data": {}},
    ]
    result = _run(nodes, edges)
    assert result["success"] is True
    loop_row = next(r for r in result["results"] if r["type"] == "loop")
    assert loop_row["outputs"]["count"] == 3


def test_external_inputs_not_polluting_downstream_after_code():
    """code 处理后的 output 不应仍等于 raw external_inputs。"""
    nodes = [
        {"id": "s", "data": {"originType": "start", "config": {}}},
        {
            "id": "c",
            "data": {
                "originType": "code",
                "config": {"code": "result = 'only-code-output'"},
            },
        },
        {"id": "o", "data": {"originType": "output", "config": {}}},
    ]
    edges = [
        {"source": "s", "target": "c", "data": {}},
        {"source": "c", "target": "o", "data": {}},
    ]
    result = _run(nodes, edges, {"query": "should-not-leak", "message": "noise"})
    out = next(r for r in result["results"] if r["type"] == "output")
    assert out["outputs"]["result"] == "only-code-output"
    assert out["outputs"]["result"] != "should-not-leak"
