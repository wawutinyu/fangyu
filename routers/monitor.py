import json
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from ..models.database import get_session
from ..models.execution_log import ExecutionLog

router = APIRouter(prefix="/api/v1/monitor", tags=["监控"])


@router.get("/logs")
async def list_logs(
    flow_id: str = "",
    session_id: str = "",
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_session),
):
    query = select(ExecutionLog).order_by(desc(ExecutionLog.created_at))
    if flow_id:
        query = query.where(ExecutionLog.flow_id == flow_id)
    if session_id:
        query = query.where(ExecutionLog.session_id == session_id)
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()
    return {
        "logs": [
            {
                "id": log.id,
                "flow_id": log.flow_id,
                "session_id": log.session_id,
                "node_id": log.node_id,
                "node_name": log.node_name,
                "node_type": log.node_type,
                "log_type": log.log_type,
                "inputs": json.loads(log.inputs_json) if log.inputs_json else {},
                "outputs": json.loads(log.outputs_json) if log.outputs_json else {},
                "error": log.error,
                "duration_ms": log.duration_ms,
                "token_usage": json.loads(log.token_usage) if log.token_usage else {},
                "created_at": str(log.created_at),
            }
            for log in logs
        ],
        "total": len(logs),
    }


@router.get("/harness-traces")
def list_harness_traces(
    bundle_dir: str = "",
    workspace: str = "",
    limit: int = Query(50, le=200),
):
    """观测：读取 harness_trace.jsonl + 聚合摘要。"""
    from fangyu.engine.harness_trace import (
        read_traces,
        resolve_trace_path,
        summarize_trace_rows,
    )

    path = resolve_trace_path(bundle_dir=bundle_dir or None, workspace=workspace or None)
    if not path or not path.is_file():
        return {
            "path": str(path) if path else None,
            "traces": [],
            "summary": summarize_trace_rows([]),
        }
    rows = read_traces(path, limit=limit)
    return {
        "path": str(path),
        "traces": rows,
        "summary": summarize_trace_rows(rows),
    }


@router.get("/eval-report")
def get_eval_report():
    """最近一次 factory_gate 写出的 Eval 报告。"""
    from fangyu.core.factory_eval import eval_report_path, load_eval_report

    doc = load_eval_report()
    return {
        "path": str(eval_report_path()),
        "report": doc,
    }


@router.delete("/logs")
async def clear_logs(
    flow_id: str = "",
    session_id: str = "",
    db: AsyncSession = Depends(get_session),
):
    from sqlalchemy import delete as _delete
    query = _delete(ExecutionLog)
    if flow_id:
        query = query.where(ExecutionLog.flow_id == flow_id)
    if session_id:
        query = query.where(ExecutionLog.session_id == session_id)
    await db.execute(query)
    await db.commit()
    return {"success": True}
