import pytest

from fangyu.engine.safe_expr import SafeExprError, safe_eval, safe_eval_bool, safe_eval_int


def test_condition_expression():
    assert safe_eval_bool("input == 'yes'", {"input": "yes"}) is True
    assert safe_eval_bool("input == 'yes'", {"input": "no"}) is False


def test_numeric_comparison():
    assert safe_eval_bool("input > 10", {"input": 15}) is True


def test_switch_int():
    assert safe_eval_int("int(input)", {"input": "2"}) == 2


def test_transform_data_access():
    ctx = {"data": {"name": "alice", "age": 20}, "input": {"name": "alice"}}
    result = safe_eval('{"username": data["name"], "years": data["age"]}', ctx)
    assert result == {"username": "alice", "years": 20}


def test_calculator_numeric_only():
    assert safe_eval("2 + 3 * 4", numeric_only=True) == 14


def test_calculator_rejects_names():
    with pytest.raises(SafeExprError):
        safe_eval("__import__('os')", numeric_only=True)


def test_rejects_lambda():
    with pytest.raises(SafeExprError):
        safe_eval("(lambda: 1)()", {})
