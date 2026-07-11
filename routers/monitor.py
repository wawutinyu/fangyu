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
