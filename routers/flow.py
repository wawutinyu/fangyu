import asyncio
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from fangyu.engine.sandbox import run_code
from fangyu.engine.executor import run_flow
from ..models.database import get_session
from ..models.setting import Setting

router = APIRouter(prefix="/api/v1/flow", tags=["流程执行"])


def _redact_log_json(obj) -> str:
    from fangyu.core.auth_gate import redact_mapping
    if isinstance(obj, dict):
        return json.dumps(redact_mapping(obj), ensure_ascii=False)
    return json.dumps(obj, ensure_ascii=False)


class ExecuteCodeBody(BaseModel):
    code: str
    input: dict = {}
    params: dict = {}
    timeout: int = 10


@router.post("/execute-code")
async def execute_code(body: ExecuteCodeBody):
    result = await run_code(
        code=body.code,
        input_data=body.input,
        params=body.params,
        timeout=body.timeout,
    )
    return result


class RunFlowBody(BaseModel):
    nodes: list = []
    edges: list = []
    external_inputs: dict = {}
    global_vars: dict = {}


async def _inject_settings(global_vars: dict, db: AsyncSession) -> dict:
    result = await db.execute(select(Setting))
    for row in result.scalars().all():
        global_vars[row.key] = row.value
    return global_vars


async def _prepare_global_vars(raw: dict, db: AsyncSession) -> dict:
    from fangyu.engine.flow_prompts import inject_canvas_prompts
    from fangyu.engine.workspace import get_active_workspace, init_bundle_workspace
    import tempfile
    from pathlib import Path

    global_vars = await _inject_settings(dict(raw or {}), db)
    global_vars = inject_canvas_prompts(global_vars)

    # 画布预览：为 coding / tool-round 准备 workspace（可拼 harness 验收）
    if get_active_workspace() is None:
        override = global_vars.get("workspace_path") or global_vars.get("workspace")
        bundle = global_vars.get("_bundle_root") or global_vars.get("bundle_root")
        if override:
            root = Path(str(override)).expanduser()
            root.mkdir(parents=True, exist_ok=True)
            tmp = Path(tempfile.mkdtemp(prefix="fangyu-flow-ws-"))
            (tmp / "config").mkdir(parents=True, exist_ok=True)
            init_bundle_workspace(tmp, workspace_override=root)
            global_vars["_bundle_root"] = str(tmp)
            global_vars["workspace_path"] = str(root.resolve())
        elif bundle:
            init_bundle_workspace(bundle)
        else:
            tmp = Path(tempfile.mkdtemp(prefix="fangyu-compose-ws-"))
            (tmp / "workspace").mkdir(exist_ok=True)
            init_bundle_workspace(tmp)
            global_vars["_bundle_root"] = str(tmp)
            global_vars["workspace_path"] = str(tmp / "workspace")
    return global_vars


@router.post("/run")
async def run_flow_endpoint(body: RunFlowBody, db: AsyncSession = Depends(get_session)):
    from ..models.execution_log import ExecutionLog

    global_vars = await _prepare_global_vars(body.global_vars, db)
    result = await run_flow(
        nodes=body.nodes,
        edges=body.edges,
        external_inputs=body.external_inputs,
        global_vars=global_vars,
    )

    # Persist execution logs
    session_id = global_vars.get("session_id", global_vars.get("_chatHistory", id(body)))
    flow_name = body.global_vars.get("flow_id", "")
    if isinstance(session_id, list):
        session_id = str(id(body))

    node_timing: dict[str, int] = {}
    for log_entry in result.get("logs", []):
        nid = log_entry.get("nodeId", "")
        log_type = log_entry.get("type", "")
        if log_type == "start":
            node_timing[nid] = log_entry.get("time", 0)
        lt_map = {"start": "start", "complete": "complete", "complete_with_error": "error",
                  "approval_pending": "approval_pending", "error": "error"}
        duration = 0
        if log_type in ("complete", "complete_with_error", "error") and nid in node_timing:
            duration = log_entry.get("time", 0) - node_timing.get(nid, 0)
        db.add(ExecutionLog(
            flow_id=str(flow_name),
            session_id=str(session_id),
            node_id=nid,
            node_name=log_entry.get("nodeName", ""),
            node_type=log_entry.get("type", ""),
            log_type=lt_map.get(log_type, "error"),
            inputs_json=_redact_log_json(log_entry.get("data", {}).get("inputs", {})),
            outputs_json=_redact_log_json(log_entry.get("data", {}).get("outputs", {})),
            error=log_entry.get("data", {}).get("error", ""),
            duration_ms=duration,
        ))

    await db.commit()
    return result


@router.post("/run/stream")
async def run_flow_stream(body: RunFlowBody, db: AsyncSession = Depends(get_session)):
    event_queue: asyncio.Queue = asyncio.Queue()

    async def on_event(evt_type: str, data: dict):
        await event_queue.put({"type": evt_type, **data})

    async def event_generator():
        global_vars = await _prepare_global_vars(body.global_vars, db)
        task = asyncio.create_task(
            run_flow(
                nodes=body.nodes,
                edges=body.edges,
                external_inputs=body.external_inputs,
                global_vars=global_vars,
                on_event=on_event,
            )
        )

        done = False
        while not done:
            try:
                evt = await asyncio.wait_for(event_queue.get(), timeout=0.5)
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
            except asyncio.TimeoutError:
                if task.done():
                    done = True

        result = await task
        yield f"data: {json.dumps({'type': 'flow_result', **result}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
