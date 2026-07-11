"""Safe expression evaluation — no eval(), AST whitelist only."""
from __future__ import annotations

import ast
from typing import Any

_SAFE_FUNCS: dict[str, Any] = {
    "len": len,
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "min": min,
    "max": max,
    "sum": sum,
    "sorted": sorted,
    "abs": abs,
    "round": round,
}

_BINOPS = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
    ast.FloorDiv: lambda a, b: a // b,
    ast.Mod: lambda a, b: a % b,
    ast.Pow: lambda a, b: a ** b,
}

_UNARYOPS = {
    ast.UAdd: lambda a: +a,
    ast.USub: lambda a: -a,
    ast.Not: lambda a: not a,
}

_CMPS = {
    ast.Eq: lambda a, b: a == b,
    ast.NotEq: lambda a, b: a != b,
    ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b,
    ast.GtE: lambda a, b: a >= b,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
    ast.Is: lambda a, b: a is b,
    ast.IsNot: lambda a, b: a is not b,
}


class SafeExprError(ValueError):
    pass


class _SafeEvaluator(ast.NodeVisitor):
    def __init__(self, context: dict[str, Any], *, numeric_only: bool = False):
        self.context = context
        self.numeric_only = numeric_only

    def visit_Expression(self, node: ast.Expression) -> Any:
        return self.visit(node.body)

    def visit_Constant(self, node: ast.Constant) -> Any:
        if self.numeric_only and not isinstance(node.value, (int, float)):
            raise SafeExprError("numeric_only: literal must be number")
        return node.value

    def visit_Name(self, node: ast.Name) -> Any:
        if self.numeric_only:
            raise SafeExprError("numeric_only: names not allowed")
        if node.id in ("True", "False", "None"):
            return {"True": True, "False": False, "None": None}[node.id]
        if node.id not in self.context:
            raise SafeExprError(f"undefined name: {node.id}")
        return self.context[node.id]

    def visit_List(self, node: ast.List) -> list[Any]:
        if self.numeric_only:
            raise SafeExprError("numeric_only: lists not allowed")
        return [self.visit(el) for el in node.elts]

    def visit_Tuple(self, node: ast.Tuple) -> tuple[Any, ...]:
        if self.numeric_only:
            raise SafeExprError("numeric_only: tuples not allowed")
        return tuple(self.visit(el) for el in node.elts)

    def visit_Dict(self, node: ast.Dict) -> dict[Any, Any]:
        if self.numeric_only:
            raise SafeExprError("numeric_only: dicts not allowed")
        return {self.visit(k): self.visit(v) for k, v in zip(node.keys, node.values)}

    def visit_Subscript(self, node: ast.Subscript) -> Any:
        if self.numeric_only:
            raise SafeExprError("numeric_only: subscript not allowed")
        obj = self.visit(node.value)
        if isinstance(node.slice, ast.Slice):
            raise SafeExprError("slice not allowed")
        key = self.visit(node.slice)
        return obj[key]

    def visit_Attribute(self, node: ast.Attribute) -> Any:
        if self.numeric_only:
            raise SafeExprError("numeric_only: attribute access not allowed")
        obj = self.visit(node.value)
        if isinstance(obj, dict):
            return obj.get(node.attr)
        return getattr(obj, node.attr)

    def visit_BinOp(self, node: ast.BinOp) -> Any:
        op = _BINOPS.get(type(node.op))
        if op is None:
            raise SafeExprError(f"unsupported binary op: {type(node.op).__name__}")
        return op(self.visit(node.left), self.visit(node.right))

    def visit_UnaryOp(self, node: ast.UnaryOp) -> Any:
        op = _UNARYOPS.get(type(node.op))
        if op is None:
            raise SafeExprError(f"unsupported unary op: {type(node.op).__name__}")
        return op(self.visit(node.operand))

    def visit_BoolOp(self, node: ast.BoolOp) -> Any:
        if isinstance(node.op, ast.And):
            val = self.visit(node.values[0])
            for item in node.values[1:]:
                if not val:
                    return val
                val = self.visit(item)
            return val
        if isinstance(node.op, ast.Or):
            val = self.visit(node.values[0])
            for item in node.values[1:]:
                if val:
                    return val
                val = self.visit(item)
            return val
        raise SafeExprError(f"unsupported bool op: {type(node.op).__name__}")

    def visit_Compare(self, node: ast.Compare) -> Any:
        left = self.visit(node.left)
        for op, comp in zip(node.ops, node.comparators):
            fn = _CMPS.get(type(op))
            if fn is None:
                raise SafeExprError(f"unsupported compare op: {type(op).__name__}")
            right = self.visit(comp)
            if not fn(left, right):
                return False
            left = right
        return True

    def visit_IfExp(self, node: ast.IfExp) -> Any:
        return self.visit(node.body) if self.visit(node.test) else self.visit(node.orelse)

    def visit_Call(self, node: ast.Call) -> Any:
        if node.keywords:
            raise SafeExprError("keyword arguments not allowed")
        if not isinstance(node.func, ast.Name):
            raise SafeExprError("only simple function calls allowed")
        fn = _SAFE_FUNCS.get(node.func.id)
        if fn is None:
            raise SafeExprError(f"function not allowed: {node.func.id}")
        args = [self.visit(a) for a in node.args]
        return fn(*args)

    def generic_visit(self, node: ast.AST) -> Any:
        raise SafeExprError(f"unsupported syntax: {type(node).__name__}")


def safe_eval(expr: str, context: dict[str, Any] | None = None, *, numeric_only: bool = False) -> Any:
    if not expr or not str(expr).strip():
        raise SafeExprError("empty expression")
    tree = ast.parse(str(expr).strip(), mode="eval")
    return _SafeEvaluator(context or {}, numeric_only=numeric_only).visit(tree)


def safe_eval_bool(expr: str, context: dict[str, Any] | None = None, *, default: bool = False) -> bool:
    try:
        return bool(safe_eval(expr, context))
    except Exception:
        return default


def safe_eval_int(expr: str, context: dict[str, Any] | None = None, *, default: int = 0) -> int:
    try:
        return int(safe_eval(expr, context))
    except Exception:
        return default
