"""Agent Bundle 独立运行时 — 加载 bundle 并暴露 A2A JSON-RPC。"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from pydantic import BaseModel

from fangyu.core.agent_bundle import load_agent_bundle, bundle_to_flow_mappings
from fangyu.engine.a2a_runtime import AgentRegistry, AgentBus
from fangyu.engine.bundle_mqtt_trigger import get_bundle_mqtt_trigger, start_bundle_mqtt_triggers


class JsonRpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    method: str
    params: dict = {}
    id: str | int | None = None


def _setup_trust_registry(bundle: dict[str, Any]) -> dict[str, Any]:
    """注册 bundle 自身及 trusted_peers 到统一 TrustRegistry。"""
    from fangyu.a2a.trust.registry import TrustRegistry

    ident = bundle["identity"]
    agent_id = ident["agent_id"]
    pubkey = ident["public_key"]
    skills = list(bundle["skills"].keys()) or ["*"]

    TrustRegistry.register(agent_id, pubkey, skills)

    trust_policy = (bundle.get("interfaces") or {}).get("trust_policy") or {}
    for peer in trust_policy.get("trusted_peers") or []:
        pid = peer.get("agent_id") or peer.get("agentId")
        pk = peer.get("public_key") or peer.get("publicKey")
        allowed = peer.get("allowed_skills") or ["*"]
        if pid and pk:
            TrustRegistry.register(pid, pk, allowed)

    return trust_policy


def _register_bundle(bundle: dict[str, Any]) -> str:
    card = bundle["agent_card"]
    name = card.get("name") or bundle["manifest"].get("name") or "Agent"
    flow_mappings = bundle_to_flow_mappings(bundle)
    trust = {
        "enabled": True,
        "agent_id": bundle["identity"]["agent_id"],
        "public_key": bundle["identity"]["public_key"],
    }
    AgentRegistry.register(name, card, flow_mappings, trust=trust)
    return name


def _verify_envelope(envelope_raw: str | None, body_json: str, require: bool) -> str | None:
    """验证 X-A2A-Envelope；require=True 时无信封直接拒绝。"""
    from fangyu.engine.trust_runtime import verify_a2a_envelope
    return verify_a2a_envelope(envelope_raw, body_json, require)


def create_bundle_app(
    bundle_path: str,
    *,
    workspace: str | None = None,
) -> tuple[FastAPI, str]:
    from fangyu.core.agent_bundle import activate_bundle_runtime_context, get_public_identity
    from fangyu.engine.bundle_daemon import daemon_status, record_task
    from fangyu.engine.executor import register_executors
    from fangyu.engine.workspace import bind_external_workspace, init_bundle_workspace
    register_executors()
    bundle = load_agent_bundle(bundle_path)
    data_dir = activate_bundle_runtime_context(bundle["root"])
    # Bundle 内组织 ACL（若有）
    try:
        from fangyu.core.org_acl import activate_bundle_acl
        activate_bundle_acl(bundle["root"])
    except Exception:
        pass
    if workspace:
        bind_external_workspace(bundle["root"], workspace)
        ws = init_bundle_workspace(bundle["root"], workspace_override=workspace)
    else:
        ws = init_bundle_workspace(bundle["root"])
    trust_policy = _setup_trust_registry(bundle)
    require_envelope = bool(trust_policy.get("require_envelope", False))
    agent_name = _register_bundle(bundle)
    public_identity = get_public_identity(bundle)
    bus = AgentBus(enable_trust=True)

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # noqa: ARG001
        trigger = start_bundle_mqtt_triggers(bundle, agent_name, bus)
        if trigger.status()["triggers"]:
            print(f"  mqtt      {len(trigger.status()['triggers'])} trigger(s) active")
        yield
        trigger.stop()

    app = FastAPI(title=f"fangyu bundle: {agent_name}", lifespan=lifespan)

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "agent": agent_name,
            "agent_id": bundle["manifest"]["agent_id"],
            "public_key": public_identity["public_key"],
            "skills": list(bundle["skills"].keys()),
            "require_envelope": require_envelope,
            "agent_kind": bundle["manifest"].get("capabilities", {}).get("agent_kind", "worker"),
            "workspace": str(ws.root.resolve()),
            "data_dir": str(data_dir.resolve()),
            "mqtt_triggers": get_bundle_mqtt_trigger().status() if get_bundle_mqtt_trigger() else {"started": False, "triggers": []},
            **daemon_status(),
        }

    @app.get("/identity/public")
    def identity_public():
        return get_public_identity(bundle)

    @app.get("/card")
    def get_card():
        return bundle["agent_card"]

    @app.post("/im/feishu")
    async def im_feishu(body: dict):
        """飞书事件 → 本 Bundle（毕业 G2-B 导出态入口）。"""
        from fangyu.engine.im_feishu import handle_feishu_event
        from fastapi.responses import JSONResponse

        result = handle_feishu_event(bundle_path, body, workspace=workspace)
        if result.get("challenge") is not None:
            return JSONResponse({"challenge": result["challenge"]})
        if result.get("status") == 403:
            return JSONResponse({"error": result.get("error")}, status_code=403)
        return result

    @app.post("/im/inbound")
    def im_inbound(body: dict):
        """通用 IM 文本入站（任意通道适配后可调）。"""
        from fangyu.engine.im_inbound import handle_inbound_text

        text = str(body.get("text") or "")
        mode = body.get("mode") or None
        return handle_inbound_text(
            bundle_path, text, workspace=workspace, mode=mode,
        )

    @app.post("/rpc")
    def a2a_rpc(body: JsonRpcRequest, request: Request):
        body_json = json.dumps(
            {"jsonrpc": body.jsonrpc, "method": body.method, "params": body.params, "id": body.id},
            separators=(",", ":"),
            ensure_ascii=False,
        )
        envelope_raw = request.headers.get("X-A2A-Envelope") or request.headers.get("x-a2a-envelope")
        env_err = _verify_envelope(envelope_raw, body_json, require_envelope)
        if env_err:
            return _rpc_err(body.id, 403, env_err)

        method = body.method
        params = body.params or {}
        req_id = body.id

        try:
            if method == "a2a.send_message":
                target = params.get("targetAgent") or params.get("target_agent") or agent_name
                message = params.get("message") or {}
                task_id = params.get("taskId") or params.get("task_id") or ""
                task = bus.send_message(target, message, task_id)
                record_task()
                return _rpc_ok(req_id, task)
            if method == "a2a.get_task":
                task_id = params.get("taskId") or params.get("task_id") or ""
                task = bus.get_task(task_id)
                if not task:
                    return _rpc_err(req_id, 404, "Task not found")
                return _rpc_ok(req_id, task)
            if method == "a2a.list_tasks":
                return _rpc_ok(req_id, bus.list_tasks(params.get("agentName") or params.get("agent_name") or ""))
            if method == "a2a.list_agents":
                return _rpc_ok(req_id, AgentRegistry.list_agents())
            if method == "a2a.get_agent_card":
                name = params.get("name") or params.get("agentName") or agent_name
                card = AgentRegistry.get_card(name)
                if not card:
                    return _rpc_err(req_id, 404, "Agent not found")
                return _rpc_ok(req_id, card)
            return _rpc_err(req_id, -32601, f"Method not found: {method}")
        except Exception as e:
            return _rpc_err(req_id, -32000, str(e))

    return app, agent_name


def _rpc_ok(req_id, result):
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _rpc_err(req_id, code: int, message: str):
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def run_bundle_server(
    bundle_path: str,
    host: str = "127.0.0.1",
    port: int = 9001,
    *,
    daemon: bool = False,
    workspace: str | None = None,
) -> None:
    import uvicorn
    from fangyu.core.agent_bundle import get_run_instructions

    app, agent_name = create_bundle_app(bundle_path, workspace=workspace)
    instructions = get_run_instructions(bundle_path, host=host, port=port)
    mode = "daemon" if daemon else "server"
    print(f"fangyu Agent Bundle [{mode}] → {agent_name}")
    print(f"  health    http://{host}:{port}/health")
    print(f"  identity  http://{host}:{port}/identity/public")
    print(f"  rpc       http://{host}:{port}/rpc")
    print(f"  im        http://{host}:{port}/im/feishu  ·  /im/inbound")
    if workspace:
        print(f"  workspace {workspace}")
    if daemon:
        print("  mode      常驻等待 A2A 消息触发 skill 执行")
    print(f"  runbook   {instructions['rpc_example']}")
    uvicorn.run(app, host=host, port=port, log_level="info")
