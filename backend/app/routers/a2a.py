"""A2A Protocol API 端点"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.a2a_runtime import AgentRegistry, AgentBus

router = APIRouter(prefix="/api/v1/a2a", tags=["a2a"])
_bus = AgentBus()


class SendMessageRequest(BaseModel):
    target_agent: str
    message: dict
    task_id: str = ""

class RegisterAgentRequest(BaseModel):
    name: str
    card: dict
    flow_mappings: dict[str, str] = {}


@router.post("/send")
def send_message(body: SendMessageRequest):
    task = _bus.send_message(body.target_agent, body.message, body.task_id)
    return task


@router.get("/tasks/{task_id}")
def get_task(task_id: str):
    task = _bus.get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.get("/tasks")
def list_tasks(agent_name: str = ""):
    return _bus.list_tasks(agent_name)


@router.post("/tasks/{task_id}/cancel")
def cancel_task(task_id: str):
    ok = _bus.cancel_task(task_id)
    if not ok:
        raise HTTPException(400, "Task not found or already finished")
    return {"ok": True}


@router.post("/agents/register")
def register_agent(body: RegisterAgentRequest):
    AgentRegistry.register(body.name, body.card, body.flow_mappings)
    return {"success": True, "name": body.name, "card": body.card}


@router.delete("/agents/{name}")
def unregister_agent(name: str):
    AgentRegistry.unregister(name)
    return {"ok": True}


@router.get("/agents")
def list_agents():
    return AgentRegistry.list_agents()


@router.get("/agents/{name}/card")
def get_agent_card(name: str):
    card = AgentRegistry.get_card(name)
    if not card:
        raise HTTPException(404, "Agent not found")
    return card
