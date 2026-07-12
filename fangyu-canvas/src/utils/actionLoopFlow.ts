/** Action Loop 模板 — observe → plan → act → verify */

const OBSERVE_CODE = `goal = _input.get('query') or _input.get('message') or _input.get('goal') or 'complete task'
try:
    files = ws_list('.')
except NameError:
    files = []
try:
    state = ws_state()
except NameError:
    state = {}
result = {'phase': 'observe', 'goal': goal, 'files': files, 'state': state}
try:
    ws_save_state({'observe': result, **(state or {})})
except NameError:
    pass`

const PLAN_CODE = `src = _input if isinstance(_input, dict) else {}
goal = src.get('goal') or (src.get('result') or {}).get('goal') or 'task'
files = src.get('files') or (src.get('result') or {}).get('files') or []
if 'result.txt' in files:
    action = 'verify_only'
else:
    action = 'write_result'
result = {'phase': 'plan', 'goal': goal, 'action': action, 'files': files, 'mode': 'rules'}`

const PLAN_LLM_SYSTEM =
  'You are an action planner for a worker agent with a workspace. Reply with ONLY valid JSON, no markdown.'

const PLAN_LLM_PROMPT = `Goal: {{query}}
Observe context: {{input}}

If result.txt already exists in workspace, choose verify_only; otherwise write_result.
JSON format: {"action":"write_result|verify_only","goal":"<goal>","reason":"<short>"}`

const PLAN_PARSE_CODE = `src = _input if isinstance(_input, dict) else {}
try:
    obs = (ws_state() or {}).get('observe') or {}
except NameError:
    obs = {}
goal = obs.get('goal') or src.get('goal') or 'task'
files = obs.get('files') or []
action = 'write_result'
if 'result.txt' in files:
    action = 'verify_only'
raw = src.get('result') or src.get('input') or ''
text = raw if isinstance(raw, str) else str(raw)
if '{' in text:
    try:
        chunk = text[text.index('{'): text.rindex('}') + 1]
        j = json.loads(chunk)
        action = j.get('action', action)
        goal = j.get('goal', goal)
    except Exception:
        pass
result = {'phase': 'plan', 'goal': goal, 'action': action, 'files': files, 'mode': 'llm'}`

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

export interface ActionLoopOptions {
  useLlmPlan?: boolean
  llmModel?: string
}

export function buildActionLoopFlow(skillId = 'default', skillName = 'action', options: ActionLoopOptions = {}) {
  const useLlm = options.useLlmPlan ?? false
  const model = options.llmModel ?? 'deepseek-v4-flash'

  const nodes: Array<{ id: string; data: Record<string, unknown> }> = [
    { id: 's', data: { originType: 'start', config: {}, label: 'start' } },
    { id: 'observe', data: { originType: 'code', label: 'observe', config: { code: OBSERVE_CODE } } },
  ]
  const edges: Array<{ id: string; source: string; target: string; data: Record<string, unknown> }> = [
    { id: 'e1', source: 's', target: 'observe', data: {} },
  ]

  if (useLlm) {
    nodes.push(
      {
        id: 'plan_llm',
        data: {
          originType: 'llm',
          label: 'plan',
          config: {
            model,
            temperature: 0.2,
            max_tokens: 256,
            system_prompt: PLAN_LLM_SYSTEM,
            prompt: PLAN_LLM_PROMPT,
          },
        },
      },
      { id: 'plan', data: { originType: 'code', label: 'plan_parse', config: { code: PLAN_PARSE_CODE } } },
    )
    edges.push(
      { id: 'e2', source: 'observe', target: 'plan_llm', data: {} },
      { id: 'e3', source: 'plan_llm', target: 'plan', data: {} },
    )
  } else {
    nodes.push({ id: 'plan', data: { originType: 'code', label: 'plan', config: { code: PLAN_CODE } } })
    edges.push({ id: 'e2', source: 'observe', target: 'plan', data: {} })
  }

  nodes.push(
    { id: 'act', data: { originType: 'code', label: 'act', config: { code: ACT_CODE } } },
    { id: 'verify', data: { originType: 'code', label: 'verify', config: { code: VERIFY_CODE } } },
    { id: 'o', data: { originType: 'output', config: {}, label: 'output' } },
  )
  edges.push(
    { id: 'e4', source: 'plan', target: 'act', data: {} },
    { id: 'e5', source: 'act', target: 'verify', data: {} },
    { id: 'e6', source: 'verify', target: 'o', data: {} },
  )

  return {
    nodes,
    edges,
    meta: { skill_id: skillId, kind: 'action-loop', name: skillName, plan_mode: useLlm ? 'llm' : 'rules' },
  }
}
