"""A2A 运行时核心 — AgentRegistry + AgentBus + Task 管理"""
import json, uuid, time, threading
from typing import Optional, Callable

# In-memory stores
_agent_cards: dict[str, dict] = {}
_agent_flow_mappings: dict[str, dict[str, str]] = {}
_agent_factories: dict[str, Callable] = {}
_tasks: dict[str, dict] = {}
_task_lock = threading.Lock()
_subscribers: dict[str, list[Callable]] = {}
_sub_lock = threading.Lock()


class AgentRegistry:

    @classmethod
    def register(cls, name: str, card: dict, flow_mappings: dict[str, str] = None, factory: Callable = None):
        _agent_cards[name] = card
        if flow_mappings:
            _agent_flow_mappings[name] = flow_mappings
        if factory:
            _agent_factories[name] = factory

    @classmethod
    def unregister(cls, name: str):
        _agent_cards.pop(name, None)
        _agent_flow_mappings.pop(name, None)
        _agent_factories.pop(name, None)

    @classmethod
    def list_agents(cls) -> list[dict]:
        return [{"name": k, "card": v} for k, v in _agent_cards.items()]

    @classmethod
    def get_card(cls, name: str) -> Optional[dict]:
        return _agent_cards.get(name)

    @classmethod
    def resolve_skill_flow(cls, agent_name: str, skill_id: str) -> Optional[str]:
        mappings = _agent_flow_mappings.get(agent_name, {})
        return mappings.get(skill_id)


class AgentBus:

    def __init__(self, enable_trust: bool = True):
        self._enable_trust = enable_trust

    def send_message(self, target_agent: str, message: dict, task_id: str = "", **metadata) -> dict:
        tid = task_id or uuid.uuid4().hex[:12]
        now = time.time()
        task = {
            "id": tid,
            "status": {"state": "submitted", "message": "", "updatedAt": now},
            "history": [message],
            "metadata": {"target_agent": target_agent, **metadata},
        }
        with _task_lock:
            _tasks[tid] = task

        try:
            task["status"] = {"state": "working", "message": "", "updatedAt": time.time()}
            result = self._handle_task(target_agent, task, message)
            task["status"] = {"state": "completed", "message": "", "updatedAt": time.time()}
            if result:
                if "history" in result:
                    task["history"] = result["history"]
                if "artifact" in result:
                    task["artifact"] = result["artifact"]
                task.setdefault("history", []).append({"role": "agent", "parts": [{"type": "text", "text": json.dumps(result.get("output", {}))}]})
        except Exception as e:
            task["status"] = {"state": "failed", "message": str(e), "updatedAt": time.time()}

        with _task_lock:
            _tasks[tid] = task
        self._notify(target_agent, task)
        return task

    def _handle_task(self, agent_name: str, task: dict, message: dict) -> Optional[dict]:
        skill_id = (message.get("metadata") or {}).get("skill_id", "")
        flow_id = AgentRegistry.resolve_skill_flow(agent_name, skill_id)
        if not flow_id:
            text = ""
            for part in message.get("parts", []):
                if part.get("type") == "text":
                    text = part.get("text", "")
            return {"output": {"result": f"[{agent_name}] 收到: {text}"}, "history": task.get("history", [])}

        from .scheduler import run_flow
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            ext_inputs = {"message": text} if text else {}
            result = loop.run_until_complete(run_flow(
                nodes=flow_id.get("nodes", []),
                edges=flow_id.get("edges", []),
                external_inputs=ext_inputs,
            ))
            loop.close()
            return {"output": result, "history": task.get("history", [])}
        except Exception as e:
            raise

    def get_task(self, task_id: str) -> Optional[dict]:
        return _tasks.get(task_id)

    def list_tasks(self, agent_name: str = "") -> list[dict]:
        with _task_lock:
            if agent_name:
                return [t for t in _tasks.values() if t.get("metadata", {}).get("target_agent") == agent_name]
            return list(_tasks.values())

    def cancel_task(self, task_id: str) -> bool:
        with _task_lock:
            task = _tasks.get(task_id)
            if task and task["status"]["state"] not in ("completed", "failed", "canceled"):
                task["status"] = {"state": "canceled", "message": "canceled", "updatedAt": time.time()}
                return True
            return False

    def subscribe(self, agent_name: str, callback: Callable):
        with _sub_lock:
            _subscribers.setdefault(agent_name, []).append(callback)

    def _notify(self, agent_name: str, task: dict):
        with _sub_lock:
            for cb in list(_subscribers.get(agent_name, [])):
                try:
                    cb(agent_name, task)
                except Exception:
                    pass
