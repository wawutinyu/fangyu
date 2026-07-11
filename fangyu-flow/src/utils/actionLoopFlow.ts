/** Action Loop 模板 — observe → plan → act → verify（与 core/action_loop.py 对齐） */

const OBSERVE_CODE = `goal = _input.get('query') or _input.get('message') or _input.get('goal') or 'complete task'
try:
    files = ws_list('.')
except NameError:
    files = []
try:
    state = ws_state()
except NameError:
    state = {}
result = {'phase': 'observe', 'goal': goal, 'files': files, 'state': state}`

const PLAN_CODE = `src = _input if isinstance(_input, dict) else {}
goal = src.get('goal') or (src.get('result') or {}).get('goal') or 'task'
files = src.get('files') or (src.get('result') or {}).get('files') or []
if 'result.txt' in files:
    action = 'verify_only'
else:
    action = 'write_result'
result = {'phase': 'plan', 'goal': goal, 'action': action, 'files': files}`

const ACT_CODE = `src = _input if isinstance(_input, dict) else {}
action = src.get('action') or (src.get('result') or {}).get('action') or ''
goal = src.get('goal') or (src.get('result') or {}).get('goal') or ''
try:
    if action == 'write_result':
        ws_write('result.txt', f'done: {goal}')
        result = {'phase': 'act', 'acted': True, 'file': 'result.txt'}
    else:
        result = {'phase': 'act', 'acted': False, 'action': action}
except NameError:
    result = {'phase': 'act', 'acted': False, 'error': 'no workspace'}`

const VERIFY_CODE = `try:
    files = ws_list('.')
except NameError:
    files = []
ok = 'result.txt' in files
status = 'completed' if ok else 'pending'
try:
    ws_save_state({'last_status': status, 'verified': ok})
except NameError:
    pass
result = {'phase': 'verify', 'verified': ok, 'status': status, 'files': files}`

export function buildActionLoopFlow(skillId = 'default', skillName = 'action') {
  return {
    nodes: [
      { id: 's', data: { originType: 'start', config: {}, label: 'start' } },
      { id: 'observe', data: { originType: 'code', label: 'observe', config: { code: OBSERVE_CODE } } },
      { id: 'plan', data: { originType: 'code', label: 'plan', config: { code: PLAN_CODE } } },
      { id: 'act', data: { originType: 'code', label: 'act', config: { code: ACT_CODE } } },
      { id: 'verify', data: { originType: 'code', label: 'verify', config: { code: VERIFY_CODE } } },
      { id: 'o', data: { originType: 'output', config: {}, label: 'output' } },
    ],
    edges: [
      { id: 'e1', source: 's', target: 'observe', data: {} },
      { id: 'e2', source: 'observe', target: 'plan', data: {} },
      { id: 'e3', source: 'plan', target: 'act', data: {} },
      { id: 'e4', source: 'act', target: 'verify', data: {} },
      { id: 'e5', source: 'verify', target: 'o', data: {} },
    ],
    meta: { skill_id: skillId, kind: 'action-loop', name: skillName },
  }
}
