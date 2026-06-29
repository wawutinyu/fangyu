import asyncio
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..services.sandbox import run_code
from ..services.executor import run_flow
from ..models.database import get_session
from ..models.setting import Setting

router = APIRouter(prefix="/api/v1/flow", tags=["流程执行"])


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


@router.post("/run")
async def run_flow_endpoint(body: RunFlowBody, db: AsyncSession = Depends(get_session)):
    from ..models.execution_log import ExecutionLog

    global_vars = await _inject_settings(body.global_vars, db)
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

    for log_entry in result.get("logs", []):
        db.add(ExecutionLog(
            flow_id=str(flow_name),
            session_id=str(session_id),
            node_id=log_entry.get("nodeId", ""),
            node_name=log_entry.get("nodeName", ""),
            node_type=log_entry.get("type", ""),
            log_type="start" if log_entry.get("type") == "start" else "complete" if log_entry.get("type") == "complete" else "error",
            inputs_json=json.dumps(log_entry.get("data", {}).get("inputs", {}), ensure_ascii=False),
            outputs_json=json.dumps(log_entry.get("data", {}).get("outputs", {}), ensure_ascii=False),
            error=log_entry.get("data", {}).get("error", ""),
            duration_ms=log_entry.get("time", 0),
        ))

    await db.commit()
    return result


@router.post("/run/stream")
async def run_flow_stream(body: RunFlowBody, db: AsyncSession = Depends(get_session)):
    event_queue: asyncio.Queue = asyncio.Queue()

    async def on_event(evt_type: str, data: dict):
        await event_queue.put({"type": evt_type, **data})

    async def event_generator():
        global_vars = await _inject_settings(body.global_vars, db)
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
