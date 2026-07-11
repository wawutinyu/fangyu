"""AgentBus — In-Memory JSON-RPC 消息总线"""
import json, uuid, time, threading
from typing import Optional
from .protocol import Task, TaskStatus, TaskState, Message, Artifact
from .registry import AgentRegistry


class AgentBus:
    def __init__(self, enable_trust: bool = True):
        self._tasks: dict[str, Task] = {}
        self._subscribers: dict[str, list[callable]] = {}
        self._lock = threading.Lock()
        self._enable_trust = enable_trust

    def send_message(self, target_agent: str, message: Message, task_id: str = "", **metadata) -> Task:
        task = Task(id=task_id or uuid.uuid4().hex[:12])
        task.history.append(message)
        if metadata: task.metadata.update(metadata)
        agent = AgentRegistry.create_agent(target_agent)
        if agent is None:
            task.status = TaskStatus(TaskState(TaskState.FAILED, f"agent '{target_agent}' not found"))
            self._tasks[task.id] = task
            return task
        with self._lock: self._tasks[task.id] = task
        try:
            result = agent.handle_task(task)
            self._tasks[task.id] = result
        except Exception as e:
            task.status = TaskStatus(TaskState(TaskState.FAILED, str(e)))
            self._tasks[task.id] = task
        self._notify(target_agent, task)
        return self._tasks[task.id]

    def get_task(self, task_id: str) -> Optional[Task]:
        return self._tasks.get(task_id)

    def list_tasks(self, agent_name: str = "") -> list[Task]:
        with self._lock:
            if agent_name: return [t for t in self._tasks.values() if t.metadata.get("target_agent") == agent_name]
            return list(self._tasks.values())

    def cancel_task(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task and not task.status.state.is_terminal():
                task.status = TaskStatus(TaskState(TaskState.CANCELED, "canceled"))
                return True
            return False

    def subscribe(self, agent_name: str, callback: callable):
        with self._lock:
            self._subscribers.setdefault(agent_name, []).append(callback)

    def _notify(self, agent_name: str, task: Task):
        for cb in list(self._subscribers.get(agent_name, [])):
            try: cb(agent_name, task)
            except Exception: pass
