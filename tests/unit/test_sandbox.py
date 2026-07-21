"""engine.sandbox — 代码沙箱安全边界"""
import asyncio

import pytest

from fangyu.engine.sandbox import run_code, _run_code, FORBIDDEN


def test_simple_result():
    out = _run_code("result = 1 + 2", {}, {})
    assert out["error"] is None
    assert out["result"] == 3


def test_print_captured_in_logs():
    out = _run_code("print('hello', 42)\nresult = 1", {}, {})
    assert out["error"] is None
    assert "hello 42" in out["logs"]


def test_input_and_params_available():
    out = _run_code(
        "result = {'a': input['x'], 'b': params['y']}",
        {"x": 10},
        {"y": 20},
    )
    assert out["result"] == {"a": 10, "b": 20}


def test_extra_globals():
    out = _run_code("result = helper(3)", {}, {}, extra_globals={"helper": lambda n: n * 2})
    assert out["result"] == 6


@pytest.mark.parametrize("word", FORBIDDEN)
def test_forbidden_words_blocked(word):
    # 用注释以外的直接出现，确保静态扫描命中
    code = f"x = {word}\nresult = 1"
    out = _run_code(code, {}, {})
    assert out["result"] is None
    assert out["error"] and word in out["error"]


def test_import_os_blocked_at_runtime():
    out = _run_code("import os\nresult = os.getcwd()", {}, {})
    assert out["result"] is None
    assert out["error"]
    assert "禁止" in out["error"]


def test_from_import_blocked():
    out = _run_code("from os import path\nresult = 1", {}, {})
    assert out["result"] is None
    assert "禁止" in (out["error"] or "")


def test_important_variable_name_allowed():
    out = _run_code("important = 7\nresult = important", {}, {})
    assert out["error"] is None
    assert out["result"] == 7


def test_open_blocked():
    out = _run_code("f = open('/etc/passwd')\nresult = f.read()", {}, {})
    assert out["result"] is None
    assert "禁止" in (out["error"] or "")


def test_syntax_error():
    out = _run_code("def (\n", {}, {})
    assert out["result"] is None
    assert "语法错误" in (out["error"] or "")


def test_runtime_exception():
    out = _run_code("result = 1 / 0", {}, {})
    assert out["result"] is None
    assert "ZeroDivisionError" in (out["error"] or "")


def test_async_run_code_ok():
    async def _run():
        return await run_code("result = sum(range(5))", {})

    out = asyncio.run(_run())
    assert out["result"] == 10
    assert out["error"] is None


def test_async_timeout(monkeypatch):
    async def _boom(*_a, **_k):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(asyncio, "wait_for", _boom)

    async def _run():
        return await run_code("result = 1", {}, timeout=1)

    out = asyncio.run(_run())
    assert out["result"] is None
    assert "超时" in (out["error"] or "")


def test_class_escape_blocked():
    """S0-B5：禁止 () .__class__ / __subclasses__ 等逃逸。"""
    payload = "result = ().__class__.__bases__[0].__subclasses__()"
    out = _run_code(payload, {}, {})
    assert out["result"] is None
    assert out["error"] and ("逃逸" in out["error"] or "__class__" in out["error"])
