"""A2A 运行时核心 — AgentRegistry + AgentBus + Task 管理"""
import json, uuid, time, threading
from typing import Optional, Callable

# In-memory stores
_agent_cards: dict[str, dict] = {}
_agent_flow_mappings: dict[str, dict[str, dict]] = {}
_agent_trust: dict[str, dict] = {}
_agent_factories: dict[str, Callable] = {}
_agent_external: dict[str, dict] = {}
_tasks: dict[str, dict] = {}
_task_lock = threading.Lock()
_subscribers: dict[str, list[Callable]] = {}
_sub_lock = threading.Lock()


class AgentRegistry:

    @classmethod
    def register_external(
        cls,
        name: str,
        card: dict,
        rpc_url: str,
        agent_id: str,
        public_key: str,
        *,
        remote_name: str = "",
        allowed_skills: list[str] | None = None,
        authorized: bool = False,
    ):
        meta = {**(card.get("metadata") or {}), "external": True, "authorized": authorized}
        _agent_cards[name] = {**card, "metadata": meta}
        _agent_external[name] = {
            "rpc_url": rpc_url,
            "agent_id": agent_id,
            "public_key": public_key,
            "remote_name": remote_name or card.get("name") or name,
            "allowed_skills": allowed_skills or ["*"],
            "authorized": authorized,
        }
        _agent_trust[name] = {
            "enabled": True,
            "agent_id": agent_id,
            "public_key": public_key,
        }
        from fangyu.a2a.trust.registry import TrustRegistry
        skills = allowed_skills or ["*"]
        TrustRegistry.register(agent_id, public_key, skills)

    @classmethod
    def authorize_external(cls, name: str, authorized: bool = True, allowed_skills: list[str] | None = None) -> bool:
        ext = _agent_external.get(name)
        if not ext:
            return False
        ext["authorized"] = authorized
        if allowed_skills is not None:
            ext["allowed_skills"] = allowed_skills
        card = _agent_cards.get(name)
        if card:
            meta = card.setdefault("metadata", {})
            meta["authorized"] = authorized
        agent_id = ext.get("agent_id")
        if agent_id and allowed_skills is not None:
            from fangyu.a2a.trust.registry import TrustRegistry
            TrustRegistry.register(agent_id, ext["public_key"], allowed_skills)
        return True

    @classmethod
    def is_external(cls, name: str) -> bool:
        return name in _agent_external

    @classmethod
    def get_external(cls, name: str) -> Optional[dict]:
        return _agent_external.get(name)

    @classmethod
    def register(cls, name: str, card: dict, flow_mappings: dict[str, dict] = None, factory: Callable = None, trust: dict = None):
        _agent_cards[name] = card
        if flow_mappings:
            _agent_flow_mappings[name] = flow_mappings
        if trust is not None:
            _agent_trust[name] = trust
        if factory:
            _agent_factories[name] = factory

    @classmethod
    def unregister(cls, name: str):
        _agent_cards.pop(name, None)
        _agent_flow_mappings.pop(name, None)
        _agent_trust.pop(name, None)
        _agent_factories.pop(name, None)
        _agent_external.pop(name, None)

    @classmethod
    def list_agents(cls) -> list[dict]:
        out = []
        for k, v in _agent_cards.items():
            ext = _agent_external.get(k, {})
            out.append({
                "name": k,
                "card": v,
                "external": k in _agent_external,
                "authorized": ext.get("authorized", False),
                "rpc_url": ext.get("rpc_url"),
            })
        return out

    @classmethod
    def get_card(cls, name: str) -> Optional[dict]:
        return _agent_cards.get(name)

    @classmethod
    def get_trust(cls, name: str) -> Optional[dict]:
        return _agent_trust.get(name)

    @classmethod
    def resolve_skill_flow(cls, agent_name: str, skill_id: str) -> Optional[dict]:
        mappings = _agent_flow_mappings.get(agent_name, {})
        return mappings.get(skill_id)


class AgentBus:

    def __init__(self, enable_trust: bool = True):
        self._enable_trust = enable_trust

    def send_message(self, target_agent: str, message: dict, task_id: str = "", **metadata) -> dict:
        tid = task_id or uuid.uuid4().hex[:12]
        now = time.time()
        skill_id = (message.get("metadata") or {}).get("skill_id", "")
        task = {
            "id": tid,
            "status": {"state": "submitted", "message": "", "updatedAt": now},
            "history": [message],
            "metadata": {"target_agent": target_agent, **metadata},
        }
        with _task_lock:
            _tasks[tid] = task

        try:
            from fangyu.core.collaboration import emit_event
            emit_event(
                "a2a.send",
                actor=str(metadata.get("from_agent") or metadata.get("source") or "user"),
                target=target_agent,
                message=f"→ {target_agent}" + (f" / {skill_id}" if skill_id else ""),
                detail={"task_id": tid, "skill_id": skill_id, **{k: metadata[k] for k in metadata if k in ("pipeline_id", "step_index")}},
            )
        except Exception:
            pass

        try:
            task["status"] = {"state": "working", "message": "", "updatedAt": time.time()}
            result = self._handle_task(target_agent, task, message)
            task["status"] = {"state": "completed", "message": "", "updatedAt": time.time()}
            if result:
                if "history" in result:
                    task["history"] = result["history"]
                if "artifact" in result:
                    task["artifact"] = result["artifact"]
                elif result.get("output") is not None:
                    task["artifact"] = {"output": result["output"]}
            try:
                from fangyu.core.collaboration import emit_event
                emit_event(
                    "a2a.complete",
                    actor=target_agent,
                    target=target_agent,
                    message=f"{target_agent} 完成" + (f" ({skill_id})" if skill_id else ""),
                    detail={"task_id": tid, "skill_id": skill_id},
                )
            except Exception:
                pass
        except Exception as e:
            from ..core.constitution import ConstitutionViolation, audit_event, violation_to_dict
            from .trust_runtime import TrustViolation
            if isinstance(e, (ConstitutionViolation, TrustViolation)):
                task["violation"] = violation_to_dict(e)
                audit_event(
                    "constitution_violation" if isinstance(e, ConstitutionViolation) else "trust_violation",
                    {"agent": target_agent, "error": str(e), **getattr(e, "context", {})},
                )
            task["status"] = {"state": "failed", "message": str(e), "updatedAt": time.time()}
            try:
                from fangyu.core.collaboration import emit_event
                emit_event(
                    "a2a.failed",
                    actor=target_agent,
                    target=target_agent,
                    message=str(e),
                    detail={"task_id": tid, "skill_id": skill_id},
                    severity="error",
                )
            except Exception:
                pass

        with _task_lock:
            _tasks[tid] = task
        self._notify(target_agent, task)
        return task

    def _handle_task(self, agent_name: str, task: dict, message: dict) -> Optional[dict]:
        from fangyu.a2a.payload import message_to_inputs

        skill_id = (message.get("metadata") or {}).get("skill_id", "")
        inputs = message_to_inputs(message)
        text = inputs.get("message") or inputs.get("query") or ""

        ext = AgentRegistry.get_external(agent_name)
        if ext:
            from .trust_runtime import TrustViolation
            if not ext.get("authorized"):
                raise TrustViolation(
                    "not_authorized",
                    f"外部 Agent '{agent_name}' 尚未授权，请在编排面板中批准接入",
                    context={"agent": agent_name, "skill_id": skill_id},
                )
            allowed = ext.get("allowed_skills") or ["*"]
            if "*" not in allowed and skill_id and skill_id not in allowed:
                raise TrustViolation(
                    "not_authorized",
                    f"外部 Agent '{agent_name}' 未授权技能 '{skill_id}'",
                    context={"agent": agent_name, "skill_id": skill_id},
                )
            from .a2a_remote import remote_send_message
            remote_task = remote_send_message(ext, message, task_id=task.get("id", ""))
            if remote_task.get("history"):
                task["history"] = remote_task["history"]
            output = extract_task_output(remote_task)
            if output:
                task.setdefault("history", []).append({
                    "role": "agent",
                    "parts": [{"type": "text", "text": output}],
                })
            return {"output": remote_task.get("artifact") or remote_task.get("output"), "history": task.get("history", [])}

        flow = AgentRegistry.resolve_skill_flow(agent_name, skill_id)
        trust = AgentRegistry.get_trust(agent_name)
        from .trust_runtime import assert_agent_authorized
        assert_agent_authorized(agent_name, skill_id or "default", trust)

        if flow and isinstance(flow, dict) and flow.get("nodes"):
            from ..core.constitution import assert_flow_allowed, check_agent_action
            check_agent_action(agent=agent_name, skill_id=skill_id)
            assert_flow_allowed(flow.get("nodes", []), context=f"a2a:{agent_name}:{skill_id}")

        if not flow or not isinstance(flow, dict) or not flow.get("nodes"):
            reply = f"[{agent_name}] 收到: {text}"
            task.setdefault("history", []).append({
                "role": "agent",
                "parts": [{"type": "text", "text": reply}],
            })
            return {"output": {"result": reply}, "history": task.get("history", [])}

        from .scheduler import run_flow
        import asyncio
        ext_inputs = dict(inputs)
        if text:
            ext_inputs.setdefault("message", text)
            ext_inputs.setdefault("query", text)
            ext_inputs.setdefault("input", text)
        agent_scope = f"agent:{agent_name}"
        result = asyncio.run(run_flow(
            nodes=flow.get("nodes", []),
            edges=flow.get("edges", []),
            external_inputs=ext_inputs,
            global_vars={
                "_agent_name": agent_name,
                "_agent_scope": agent_scope,
                "_skill_id": skill_id or "",
            },
        ))
        last = (result.get("results") or [])[-1] if result.get("results") else {}
        summary = last.get("outputs", {}).get("result") or last.get("outputs", {})
        # episodic 写入方隅·知（scope=agent:{name}）
        try:
            import hashlib
            from .memory import memory_write
            tid = str(task.get("id") or "").strip()
            if not tid:
                tid = hashlib.md5(f"{agent_name}:{text}".encode()).hexdigest()[:12]
            memory_write(
                agent_scope,
                f"turn_{tid[:16]}",
                f"Q: {text}\nA: {summary}",
            )
        except Exception:
            pass
        task.setdefault("history", []).append({
            "role": "agent",
            "parts": [{"type": "text", "text": str(summary)}],
        })
        return {"output": result, "history": task.get("history", [])}

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


def extract_task_output(task: dict) -> str:
    """从 Task 历史中提取 Agent 最终文本输出。"""
    history = task.get("history") or []
    for msg in reversed(history):
        if msg.get("role") == "agent":
            for part in msg.get("parts") or []:
                if part.get("type") == "text" and part.get("text"):
                    text = str(part["text"])
                    if text.startswith("{") and '"results"' in text:
                        try:
                            payload = json.loads(text)
                            last = (payload.get("results") or [])[-1] if isinstance(payload, dict) else {}
                            summary = last.get("outputs", {}).get("result") if isinstance(last, dict) else None
                            if summary is not None:
                                return str(summary)
                        except (json.JSONDecodeError, TypeError, AttributeError):
                            pass
                    return text
    artifact = task.get("artifact") or {}
    if isinstance(artifact, dict):
        out = artifact.get("output") or artifact.get("result")
        if out is not None:
            return str(out)
    return ""


class AgentOrchestrator:
    """多 Agent 链式协作：上一步输出作为下一步输入。"""

    def __init__(self, bus: AgentBus | None = None):
        self._bus = bus or AgentBus()

    def run_pipeline(
        self,
        query: str,
        steps: list[dict],
        *,
        pass_mode: str = "replace",
    ) -> dict:
        """
        steps: [{"agent": str, "skill_id": str, "label": str?}, ...]
        pass_mode: replace=每步只用上步输出; append=拼接原始问题与上步输出
        """
        if not steps:
            return {"success": False, "error": "pipeline 为空", "steps": [], "final_output": ""}

        pipeline_id = uuid.uuid4().hex[:12]
        now = time.time()
        collab_steps: list[dict] = []
        current_text = query
        original_query = query

        for i, step in enumerate(steps):
            agent_name = step.get("agent") or step.get("target_agent") or ""
            skill_id = step.get("skill_id") or step.get("skill") or "default"
            label = step.get("label") or agent_name
            if not agent_name:
                return {
                    "success": False,
                    "error": f"第 {i + 1} 步缺少 agent",
                    "steps": collab_steps,
                    "final_output": current_text,
                    "pipeline_id": pipeline_id,
                }

            if pass_mode == "append" and i > 0:
                message_text = f"原始问题：{original_query}\n\n上一步结果：\n{current_text}"
            else:
                message_text = current_text if i > 0 else query

            message = {
                "role": "user",
                "parts": [{"type": "text", "text": message_text}],
                "metadata": {"skill_id": skill_id, "pipeline_id": pipeline_id, "step_index": i},
            }
            started = time.time()
            task = self._bus.send_message(
                agent_name,
                message,
                metadata={"pipeline_id": pipeline_id, "step_index": i, "skill_id": skill_id},
            )
            state = (task.get("status") or {}).get("state", "")
            output = extract_task_output(task)
            collab_steps.append({
                "index": i,
                "agent": agent_name,
                "label": label,
                "skill_id": skill_id,
                "input": message_text,
                "output": output,
                "state": state,
                "task_id": task.get("id", ""),
                "duration_ms": int((time.time() - started) * 1000),
                "violation": task.get("violation"),
            })

            if state == "failed":
                return {
                    "success": False,
                    "error": (task.get("status") or {}).get("message") or f"{label} 执行失败",
                    "steps": collab_steps,
                    "final_output": output or current_text,
                    "pipeline_id": pipeline_id,
                    "started_at": now,
                    "violation": task.get("violation"),
                }

            if output:
                current_text = output

        return {
            "success": True,
            "steps": collab_steps,
            "final_output": current_text,
            "pipeline_id": pipeline_id,
            "started_at": now,
            "completed_at": time.time(),
        }
