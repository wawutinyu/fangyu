"""Adapter API — 物理层插件管理与产线模拟。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from fangyu.adapters import AdapterRegistry, ensure_default_adapters
from fangyu.a2a.payload import Payload, build_message_from_payload
from fangyu.engine.a2a_runtime import AgentBus, AgentRegistry, extract_task_output

router = APIRouter(prefix="/api/v1/adapters", tags=["Adapters"])

ensure_default_adapters()


class IngestBody(BaseModel):
    adapter: str
    raw: dict = {}


class EmitBody(BaseModel):
    adapter: str
    target: str = ""
    content_type: str = "application/industrial"
    body: dict | str | float | bool = {}


class PlcDispatchBody(BaseModel):
    agent_name: str
    skill_id: str = "industrial"
    tag: str = "temperature"
    value: float | None = None


class RegisterWorkerBody(BaseModel):
    name: str = "LineWorker"


def _industrial_worker_flow():
    return {
        "nodes": [
            {"id": "s", "data": {"originType": "start", "config": {}, "label": "start"}},
            {
                "id": "act",
                "data": {
                    "originType": "code",
                    "label": "analyze",
                    "config": {
                        "code": (
                            "ev = _input if isinstance(_input, dict) and 'tag' in _input else (_input.get('industrial_event') if isinstance(_input, dict) else {})\n"
                            "tag = ev.get('tag', 'unknown') if isinstance(ev, dict) else 'unknown'\n"
                            "val = ev.get('value') if isinstance(ev, dict) else None\n"
                            "alarm = ev.get('alarm', False) if isinstance(ev, dict) else False\n"
                            "if alarm:\n"
                            "    result = f'ALARM:{tag}={val}'\n"
                            "else:\n"
                            "    result = f'OK:{tag}={val}'"
                        ),
                    },
                },
            },
            {"id": "o", "data": {"originType": "output", "config": {}, "label": "output"}},
        ],
        "edges": [
            {"source": "s", "target": "act", "data": {}},
            {"source": "act", "target": "o", "data": {}},
        ],
    }


@router.get("")
def list_adapters():
    return {"adapters": AdapterRegistry.list()}


@router.get("/{name}/health")
def adapter_health(name: str):
    adapter = AdapterRegistry.get(name)
    if not adapter:
        raise HTTPException(404, "Adapter not found")
    return adapter.health()


@router.post("/ingest")
def adapter_ingest(body: IngestBody):
    try:
        payload = AdapterRegistry.ingest(body.adapter, body.raw)
        return {"success": True, "payload": payload.to_dict()}
    except KeyError as e:
        raise HTTPException(404, str(e)) from e


@router.post("/emit")
def adapter_emit(body: EmitBody):
    try:
        payload = Payload(content_type=body.content_type, body=body.body)
        result = AdapterRegistry.emit(body.adapter, payload, body.target)
        return {"success": True, "result": result}
    except KeyError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/plc/register_worker")
def register_plc_worker(body: RegisterWorkerBody):
    from fangyu.engine.executor import register_executors
    register_executors()
    flow = _industrial_worker_flow()
    card = {
        "name": body.name,
        "version": "1.0.0",
        "description": "产线 Worker — 处理 industrial 事件",
        "capabilities": {"streaming": False, "pushNotifications": False},
        "skills": [{"id": "industrial", "name": "industrial", "inputMimeTypes": ["application/industrial"]}],
        "defaultInterface": {"type": "in-memory"},
        "metadata": {"agentKind": "worker", "workerOnly": True},
    }
    AgentRegistry.register(body.name, card, {"industrial": flow})
    return {"success": True, "name": body.name}


@router.post("/plc/dispatch")
def plc_dispatch_to_worker(body: PlcDispatchBody):
    from fangyu.engine.executor import register_executors
    register_executors()

    plc = AdapterRegistry.get("plc_sim")
    if not plc:
        raise HTTPException(503, "plc_sim adapter not available")

    if body.value is not None:
        event = plc.write_register(body.tag, body.value)
    else:
        events = plc.tick()
        event = events[0] if events else plc.read_register(body.tag)

    if not AgentRegistry.get_card(body.agent_name):
        register_plc_worker(RegisterWorkerBody(name=body.agent_name))

    message = plc.to_worker_message(event, skill_id=body.skill_id)
    bus = AgentBus(enable_trust=False)
    task = bus.send_message(body.agent_name, message)
    output = extract_task_output(task)

    cmd = None
    if "ALARM" in output:
        cmd = plc.emit(Payload(content_type="application/industrial", body={"tag": "motor_speed", "command": "set:0"}))

    return {
        "success": task["status"]["state"] == "completed",
        "event": event,
        "task_id": task.get("id"),
        "worker_output": output,
        "plc_command": cmd,
        "registers": plc.registers,
    }
