"""Action Loop 标准 skill 模板 — observe → plan → act → verify。"""
from __future__ import annotations

from typing import Any

OBSERVE_CODE = """\
goal = _input.get('query') or _input.get('message') or _input.get('goal') or 'complete task'
try:
    files = ws_list('.')
except NameError:
    files = []
try:
    state = ws_state()
except NameError:
    state = {}
result = {'phase': 'observe', 'goal': goal, 'files': files, 'state': state}
"""

PLAN_CODE = """\
src = _input if isinstance(_input, dict) else {}
goal = src.get('goal') or (src.get('result') or {}).get('goal') or 'task'
files = src.get('files') or (src.get('result') or {}).get('files') or []
if 'result.txt' in files:
    action = 'verify_only'
else:
    action = 'write_result'
result = {'phase': 'plan', 'goal': goal, 'action': action, 'files': files}
"""

ACT_CODE = """\
src = _input if isinstance(_input, dict) else {}
action = src.get('action') or (src.get('result') or {}).get('action') or ''
goal = src.get('goal') or (src.get('result') or {}).get('goal') or ''
try:
    if action == 'write_result':
        ws_write('result.txt', f'done: {goal}')
        result = {'phase': 'act', 'acted': True, 'file': 'result.txt'}
    else:
        result = {'phase': 'act', 'acted': False, 'action': action}
except NameError:
    result = {'phase': 'act', 'acted': False, 'error': 'no workspace'}
"""

VERIFY_CODE = """\
try:
    files = ws_list('.')
except NameError:
    files = []
ok = 'result.txt' in files
status = 'completed' if ok else 'pending'
try:
    ws_save_state({'last_status': status, 'verified': ok})
except NameError:
    pass
result = {'phase': 'verify', 'verified': ok, 'status': status, 'files': files}
"""


def get_action_loop_flow(skill_id: str = "default", skill_name: str = "action") -> dict[str, Any]:
    """返回 observe → plan → act → verify 线性 Action Loop flow。"""
    return {
        "nodes": [
            {"id": "s", "data": {"originType": "start", "label": "start", "config": {}}},
            {
                "id": "observe",
                "data": {"originType": "code", "label": "observe", "config": {"code": OBSERVE_CODE}},
            },
            {
                "id": "plan",
                "data": {"originType": "code", "label": "plan", "config": {"code": PLAN_CODE}},
            },
            {
                "id": "act",
                "data": {"originType": "code", "label": "act", "config": {"code": ACT_CODE}},
            },
            {
                "id": "verify",
                "data": {"originType": "code", "label": "verify", "config": {"code": VERIFY_CODE}},
            },
            {"id": "o", "data": {"originType": "output", "label": "output", "config": {}}},
        ],
        "edges": [
            {"source": "s", "target": "observe", "data": {}},
            {"source": "observe", "target": "plan", "data": {}},
            {"source": "plan", "target": "act", "data": {}},
            {"source": "act", "target": "verify", "data": {}},
            {"source": "verify", "target": "o", "data": {}},
        ],
        "meta": {"skill_id": skill_id, "kind": "action-loop", "name": skill_name},
    }
