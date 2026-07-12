/** Python safe_expr helper — embedded in generated export code. Keep in sync with engine/safe_expr.py */
export const SAFE_EXPR_PYTHON = `
import ast as _ast

_SAFE_FUNCS = {"len": len, "str": str, "int": int, "float": float, "bool": bool, "min": min, "max": max, "sum": sum, "sorted": sorted, "abs": abs, "round": round}
_BINOPS = {_ast.Add: lambda a, b: a + b, _ast.Sub: lambda a, b: a - b, _ast.Mult: lambda a, b: a * b, _ast.Div: lambda a, b: a / b, _ast.FloorDiv: lambda a, b: a // b, _ast.Mod: lambda a, b: a % b, _ast.Pow: lambda a, b: a ** b}
_UNARYOPS = {_ast.UAdd: lambda a: +a, _ast.USub: lambda a: -a, _ast.Not: lambda a: not a}
_CMPS = {_ast.Eq: lambda a, b: a == b, _ast.NotEq: lambda a, b: a != b, _ast.Lt: lambda a, b: a < b, _ast.LtE: lambda a, b: a <= b, _ast.Gt: lambda a, b: a > b, _ast.GtE: lambda a, b: a >= b, _ast.In: lambda a, b: a in b, _ast.NotIn: lambda a, b: a not in b, _ast.Is: lambda a, b: a is b, _ast.IsNot: lambda a, b: a is not b}

def _safe_eval_node(node, ctx, numeric_only=False):
    if isinstance(node, _ast.Expression):
        return _safe_eval_node(node.body, ctx, numeric_only)
    if isinstance(node, _ast.Constant):
        if numeric_only and not isinstance(node.value, (int, float)):
            raise ValueError("numeric_only")
        return node.value
    if isinstance(node, _ast.Name):
        if numeric_only:
            raise ValueError("numeric_only")
        if node.id in ("True", "False", "None"):
            return {"True": True, "False": False, "None": None}[node.id]
        if node.id not in ctx:
            raise ValueError(f"undefined: {node.id}")
        return ctx[node.id]
    if isinstance(node, _ast.List):
        return [_safe_eval_node(el, ctx, numeric_only) for el in node.elts]
    if isinstance(node, _ast.Tuple):
        return tuple(_safe_eval_node(el, ctx, numeric_only) for el in node.elts)
    if isinstance(node, _ast.Dict):
        return {_safe_eval_node(k, ctx, numeric_only): _safe_eval_node(v, ctx, numeric_only) for k, v in zip(node.keys, node.values)}
    if isinstance(node, _ast.Subscript):
        obj = _safe_eval_node(node.value, ctx, numeric_only)
        if isinstance(node.slice, _ast.Slice):
            raise ValueError("slice not allowed")
        return obj[_safe_eval_node(node.slice, ctx, numeric_only)]
    if isinstance(node, _ast.Attribute):
        obj = _safe_eval_node(node.value, ctx, numeric_only)
        return obj.get(node.attr) if isinstance(obj, dict) else getattr(obj, node.attr)
    if isinstance(node, _ast.BinOp):
        op = _BINOPS.get(type(node.op))
        if not op:
            raise ValueError("bad binop")
        return op(_safe_eval_node(node.left, ctx, numeric_only), _safe_eval_node(node.right, ctx, numeric_only))
    if isinstance(node, _ast.UnaryOp):
        op = _UNARYOPS.get(type(node.op))
        if not op:
            raise ValueError("bad unary")
        return op(_safe_eval_node(node.operand, ctx, numeric_only))
    if isinstance(node, _ast.BoolOp):
        if isinstance(node.op, _ast.And):
            val = _safe_eval_node(node.values[0], ctx, numeric_only)
            for item in node.values[1:]:
                if not val:
                    return val
                val = _safe_eval_node(item, ctx, numeric_only)
            return val
        val = _safe_eval_node(node.values[0], ctx, numeric_only)
        for item in node.values[1:]:
            if val:
                return val
            val = _safe_eval_node(item, ctx, numeric_only)
        return val
    if isinstance(node, _ast.Compare):
        left = _safe_eval_node(node.left, ctx, numeric_only)
        for op, comp in zip(node.ops, node.comparators):
            fn = _CMPS.get(type(op))
            if not fn:
                raise ValueError("bad cmp")
            right = _safe_eval_node(comp, ctx, numeric_only)
            if not fn(left, right):
                return False
            left = right
        return True
    if isinstance(node, _ast.IfExp):
        return _safe_eval_node(node.body, ctx, numeric_only) if _safe_eval_node(node.test, ctx, numeric_only) else _safe_eval_node(node.orelse, ctx, numeric_only)
    if isinstance(node, _ast.Call):
        if node.keywords or not isinstance(node.func, _ast.Name):
            raise ValueError("bad call")
        fn = _SAFE_FUNCS.get(node.func.id)
        if not fn:
            raise ValueError("fn not allowed")
        return fn(*[_safe_eval_node(a, ctx, numeric_only) for a in node.args])
    raise ValueError(f"unsupported: {type(node).__name__}")

def safe_eval(expr, ctx=None, numeric_only=False):
    tree = _ast.parse(str(expr).strip(), mode="eval")
    return _safe_eval_node(tree, ctx or {}, numeric_only)

def safe_calc(expr):
    return safe_eval(expr or "0", {}, numeric_only=True)
`.trim()
