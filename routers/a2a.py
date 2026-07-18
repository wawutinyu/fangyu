"""A2A Protocol API 端点"""
import json
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from fangyu.engine.a2a_runtime import AgentRegistry, AgentBus, AgentOrchestrator

router = APIRouter(prefix="/api/v1/a2a", tags=["a2a"])
_bus = AgentBus()
_orchestrator = AgentOrchestrator(_bus)


class SendMessageRequest(BaseModel):
    target_agent: str
    message: dict
    task_id: str = ""

class RegisterAgentRequest(BaseModel):
    name: str
    card: dict
    flow_mappings: dict[str, dict | str] = {}


class DeployAgentItem(BaseModel):
    name: str
    card: dict
    flow_mappings: dict[str, dict] = {}
    trust: dict | None = None


class DeployAgentsRequest(BaseModel):
    agents: list[DeployAgentItem] = []


class OrchestrateStep(BaseModel):
    agent: str
    skill_id: str
    label: str = ""


class OrchestrateRequest(BaseModel):
    query: str
    steps: list[OrchestrateStep]
    pass_mode: str = "replace"


@router.post("/send")
async def send_message(request: Request):
    """校验信封时使用原始请求体，避免 re-serialize 与前端签名不一致。"""
    from fangyu.core.config import settings
    from fangyu.engine.trust_runtime import verify_a2a_envelope

    raw = await request.body()
    body_json = raw.decode("utf-8")
    envelope_raw = request.headers.get("X-A2A-Envelope") or request.headers.get("x-a2a-envelope")
    env_err = verify_a2a_envelope(envelope_raw, body_json, settings.PLATFORM_REQUIRE_ENVELOPE)
    if env_err:
        raise HTTPException(403, env_err)
    try:
        body = SendMessageRequest.model_validate_json(body_json)
    except Exception as e:
        raise HTTPException(422, f"Invalid body: {e}") from e
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


@router.post("/orchestrate")
def orchestrate(body: OrchestrateRequest):
    result = _orchestrator.run_pipeline(
        body.query,
        [s.model_dump() for s in body.steps],
        pass_mode=body.pass_mode,
    )
    return result


@router.post("/agents/deploy")
def deploy_agents(body: DeployAgentsRequest):
    from fangyu.engine.trust_runtime import sync_agent_trust

    trust_results = []
    for agent in body.agents:
        AgentRegistry.register(agent.name, agent.card, agent.flow_mappings, trust=agent.trust)
        trust_results.append(sync_agent_trust(agent.name, agent.card, agent.trust))
    return {
        "success": True,
        "count": len(body.agents),
        "agents": [a.name for a in body.agents],
        "trust": trust_results,
    }


class RegisterExternalRequest(BaseModel):
    name: str
    card: dict
    rpc_url: str
    agent_id: str
    public_key: str
    remote_name: str = ""
    allowed_skills: list[str] = ["*"]
    authorized: bool = False


class AuthorizeExternalRequest(BaseModel):
    authorized: bool = True
    allowed_skills: list[str] | None = None


class DiscoverExternalRequest(BaseModel):
    rpc_url: str


@router.post("/agents/register_external")
def register_external_agent(body: RegisterExternalRequest):
    AgentRegistry.register_external(
        body.name,
        body.card,
        body.rpc_url,
        body.agent_id,
        body.public_key,
        remote_name=body.remote_name,
        allowed_skills=body.allowed_skills,
        authorized=body.authorized,
    )
    return {
        "success": True,
        "name": body.name,
        "external": True,
        "authorized": body.authorized,
    }


@router.post("/agents/{name}/authorize")
def authorize_external_agent(name: str, body: AuthorizeExternalRequest):
    ok = AgentRegistry.authorize_external(name, body.authorized, body.allowed_skills)
    if not ok:
        raise HTTPException(404, "External agent not found")
    return {"success": True, "name": name, "authorized": body.authorized}


@router.post("/agents/discover")
def discover_external_agent(body: DiscoverExternalRequest):
    from fangyu.engine.a2a_remote import fetch_remote_card, fetch_remote_identity

    rpc_url = body.rpc_url.rstrip("/")
    if not rpc_url.endswith("/rpc"):
        rpc_url = f"{rpc_url}/rpc"
    card = fetch_remote_card(rpc_url)
    if not card:
        raise HTTPException(400, "无法从远程端点获取 AgentCard")
    identity = fetch_remote_identity(rpc_url)
    return {"success": True, "rpc_url": rpc_url, "card": card, "identity": identity or None}


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


class JsonRpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    method: str
    params: dict = {}
    id: str | int | None = None


@router.post("/rpc")
def a2a_jsonrpc(body: JsonRpcRequest, request: Request):
    """JSON-RPC 2.0 端点 — 供跨机器 HTTPTransport 调用。受 FANGYU_PLATFORM_REQUIRE_ENVELOPE 约束。"""
    from fangyu.core.config import settings
    from fangyu.engine.trust_runtime import verify_a2a_envelope

    body_json = json.dumps(
        {"jsonrpc": body.jsonrpc, "method": body.method, "params": body.params, "id": body.id},
        separators=(",", ":"),
        ensure_ascii=False,
    )
    envelope_raw = request.headers.get("X-A2A-Envelope") or request.headers.get("x-a2a-envelope")
    env_err = verify_a2a_envelope(envelope_raw, body_json, settings.PLATFORM_REQUIRE_ENVELOPE)
    if env_err:
        return {"jsonrpc": "2.0", "id": body.id, "error": {"code": 403, "message": env_err}}

    method = body.method
    params = body.params or {}
    req_id = body.id

    def wrap(result=None, error: dict | None = None):
        if error:
            return {"jsonrpc": "2.0", "id": req_id, "error": error}
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    try:
        if method == "a2a.send_message":
            target = params.get("targetAgent") or params.get("target_agent") or ""
            message = params.get("message") or {}
            task_id = params.get("taskId") or params.get("task_id") or ""
            if not target:
                return wrap(error={"code": -32602, "message": "targetAgent required"})
            task = _bus.send_message(target, message, task_id)
            return wrap(task)
        if method == "a2a.get_task":
            task_id = params.get("taskId") or params.get("task_id") or ""
            task = _bus.get_task(task_id)
            if not task:
                return wrap(error={"code": 404, "message": "Task not found"})
            return wrap(task)
        if method == "a2a.list_tasks":
            return wrap(_bus.list_tasks(params.get("agentName") or params.get("agent_name") or ""))
        if method == "a2a.list_agents":
            return wrap(AgentRegistry.list_agents())
        if method == "a2a.get_agent_card":
            name = params.get("name") or params.get("agentName") or ""
            card = AgentRegistry.get_card(name)
            if not card:
                return wrap(error={"code": 404, "message": "Agent not found"})
            return wrap(card)
        return wrap(error={"code": -32601, "message": f"Method not found: {method}"})
    except Exception as e:
        return wrap(error={"code": -32000, "message": str(e)})
