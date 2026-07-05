import asyncio
import sys
import traceback

SAFE_BUILTINS = {
    'abs': abs, 'all': all, 'any': any, 'bool': bool, 'chr': chr, 'complex': complex,
    'dict': dict, 'divmod': divmod, 'enumerate': enumerate, 'filter': filter, 'float': float,
    'format': format, 'frozenset': frozenset, 'hash': hash, 'hex': hex, 'int': int,
    'isinstance': isinstance, 'issubclass': issubclass, 'iter': iter, 'len': len,
    'list': list, 'map': map, 'max': max, 'min': min, 'next': next, 'oct': oct,
    'ord': ord, 'pow': pow, 'range': range, 'repr': repr, 'reversed': reversed,
    'round': round, 'set': set, 'slice': slice, 'sorted': sorted, 'str': str,
    'sum': sum, 'tuple': tuple, 'type': type, 'zip': zip, 'True': True, 'False': False,
    'None': None, 'print': print, 'exec': exec,
}

FORBIDDEN = ['__import__', 'open', 'eval', 'compile', 'globals', 'locals', 'vars', 'dir', 'getattr', 'setattr', 'delattr', 'hasattr']


def _run_code(code: str, input_data: dict, params: dict) -> dict:
    logs = []

    def safe_print(*args, **kwargs):
        logs.append(' '.join(str(a) for a in args))

    restricted_globals = {**SAFE_BUILTINS, '__builtins__': {}, 'print': safe_print, 'input': input_data, 'params': params, '_input': input_data, 'data': input_data}
    restricted_locals = {}

    for word in FORBIDDEN:
        if word in code:
            return {'result': None, 'error': f'禁止使用 {word}', 'logs': logs}

    try:
        compiled = compile(code, '<sandbox>', 'exec')
    except SyntaxError as e:
        return {'result': None, 'error': f'语法错误: {e}', 'logs': logs}

    try:
        exec(compiled, restricted_globals, restricted_locals)
        result = restricted_locals.get('result', None)
        return {'result': result, 'error': None, 'logs': logs}
    except Exception as e:
        return {'result': None, 'error': f'{type(e).__name__}: {e}', 'logs': logs}


async def run_code(code: str, input_data: dict = None, params: dict = None, timeout: int = 10) -> dict:
    if input_data is None:
        input_data = {}
    if params is None:
        params = {}

    try:
        result = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _run_code, code, input_data, params),
            timeout=timeout,
        )
        return result
    except asyncio.TimeoutError:
        return {'result': None, 'error': f'执行超时 ({timeout}s)', 'logs': []}
