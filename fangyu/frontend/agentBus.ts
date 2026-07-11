/** AgentBus — in-memory agent message bus for testing and chat */

export class AgentBus {
  private tasks: Map<string, any> = new Map()

  sendMessage(targetAgent: string, message: { role: string; parts: { type: string; text?: string }[] }, taskId?: string) {
    const task = {
      id: taskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: { state: 'completed' },
      history: [message],
      artifact: { parts: [{ type: 'text', text: `[Simulated] Agent "${targetAgent}" received message` }] },
    }
    this.tasks.set(task.id, task)
    return task
  }
}
