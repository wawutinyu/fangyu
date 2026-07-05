/** AgentCard → Python 代码生成器 */
import type { AgentCard } from './a2aProtocol'

export interface AgentPythonFile { filename: string; content: string }

function toSnake(name: string, fallback: string = 'agent'): string {
  const s = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  return s || fallback
}

export function generateAgentPythonFiles(agents: { id: string; card: AgentCard }[]): AgentPythonFile[] {
  const files: AgentPythonFile[] = []

  // __init__.py
  const initLines: string[] = [
    '"""Agent 自动注册"""',
    'from a2a.registry import AgentRegistry',
    'from a2a.protocol import AgentCard, AgentCapabilities, AgentSkill, AgentInterface',
  ]
  agents.forEach(({ id, card }, i) => {
    const snake = toSnake(card.name, `agent_${i}`)
    initLines.push(`from .agent_${snake} import create_agent as create_${snake}`)
  })
  initLines.push('', 'def register_all():')
  agents.forEach(({ id, card }, i) => {
    const snake = toSnake(card.name, `agent_${i}`)
    initLines.push(`    AgentRegistry.register("${id}", create_${snake}())`)
  })
  files.push({ filename: '__init__.py', content: initLines.join('\n') })

  // Per-agent files
  agents.forEach(({ id, card }, i) => {
    files.push(generateAgentFile(id, card, i))
  })
  return files
}

function generateAgentFile(id: string, card: AgentCard, index: number = 0): AgentPythonFile {
  const snake = toSnake(card.name, `agent_${index}`)
  const skillHandlers = card.skills.map(s => `"${s.id}": _handle_${s.id.replace(/-/g, '_')}`).join(',\n')

  const lines = [
    `"""A2A Agent — ${card.name}"""`,
    'from a2a.protocol import AgentCard, AgentCapabilities, AgentSkill, AgentInterface',
    'from a2a.protocol import Task, Message, Part, Role, TaskState, TaskStatus, Artifact',
    '',
    `class Agent_${snake}:`,
    `    """${card.description || card.name}"""`,
    '',
    '    def __init__(self):',
    '        self.card = self._build_card()',
    '        self._skill_handlers = {',
    `            ${skillHandlers}`,
    '        }',
    '',
    '    def _build_card(self) -> AgentCard:',
    `        return AgentCard(`,
    `            name="${card.name}",`,
    `            description="${card.description || ''}",`,
    `            version="${card.version}",`,
    `            capabilities=AgentCapabilities(streaming=False, pushNotifications=False),`,
    '            skills=[',
  ]

  for (const skill of card.skills) {
    lines.push(`                AgentSkill(id="${skill.id}", name="${skill.name}", description="${skill.description || ''}", tags=${JSON.stringify(skill.tags || [])}),`)
  }

  lines.push('            ],')
  lines.push('            defaultInterface=AgentInterface(type="in-memory"),')
  lines.push('        )')
  lines.push('')
  lines.push('    def handle_task(self, task: Task) -> Task:')
  lines.push('        if not task.history:')
  lines.push('            task.status = TaskStatus(TaskState(TaskState.FAILED, "empty history"))')
  lines.push('            return task')
  lines.push('        last_msg = task.history[-1]')
  lines.push('        skill_id = (last_msg.metadata or {}).get("skill_id", "")')
  lines.push('        if not skill_id and self._skill_handlers:')
  lines.push('            skill_id = next(iter(self._skill_handlers))')
  lines.push('        handler = self._skill_handlers.get(skill_id)')
  lines.push('        if not handler:')
  lines.push('            task.status = TaskStatus(TaskState(TaskState.FAILED, f"unknown skill: {skill_id}"))')
  lines.push('            return task')
  lines.push('        try:')
  lines.push('            task.status = TaskStatus(TaskState(TaskState.WORKING))')
  lines.push('            result = handler(task)')
  lines.push('            task.status = TaskStatus(TaskState(TaskState.COMPLETED))')
  lines.push('            task.artifact = Artifact(parts=[Part.text(str(result))])')
  lines.push('        except Exception as e:')
  lines.push('            task.status = TaskStatus(TaskState(TaskState.FAILED, str(e)))')
  lines.push('        return task')
  lines.push('')

  for (const skill of card.skills) {
    const h = '_handle_' + skill.id.replace(/-/g, '_')
    lines.push(`    def ${h}(self, task: Task):`)
    lines.push(`        """${skill.name} — replace with your logic."""`)
    lines.push('        raise NotImplementedError')
    lines.push('')
  }

  lines.push('')
  lines.push(`def create_agent() -> Agent_${snake}:`)
  lines.push(`    return Agent_${snake}()`)

  return { filename: `agent_${snake}.py`, content: lines.join('\n') }
}
