import json
from fastapi import APIRouter, Depends, HTTPException, Query
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
                "trace_id": getattr(log, "trace_id", "") or "",
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


@router.get("/traces/{trace_id}")
async def get_trace(trace_id: str, db: AsyncSession = Depends(get_session)):
    """Q1：按 trace_id 查询结构化事件。"""
    from ..models.trace_log import TraceLog

    result = await db.execute(
        select(TraceLog)
        .where(TraceLog.trace_id == trace_id)
        .order_by(TraceLog.timestamp.asc(), TraceLog.id.asc())
    )
    rows = result.scalars().all()
    return {
        "trace_id": trace_id,
        "events": [
            {
                "id": r.id,
                "flow_id": r.flow_id,
                "node_id": r.node_id,
                "node_name": r.node_name,
                "node_type": r.node_type,
                "event_type": r.event_type,
                "timestamp": r.timestamp,
                "duration_ms": r.duration_ms,
                "payload": json.loads(r.payload_json) if r.payload_json else {},
                "created_at": str(r.created_at),
            }
            for r in rows
        ],
        "count": len(rows),
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


@router.get("/eval-history")
def get_eval_history(limit: int = Query(20, ge=1, le=100)):
    from fangyu.core.factory_eval import eval_history_path, load_eval_history

    return {
        "path": str(eval_history_path()),
        "history": load_eval_history(limit=limit),
    }


@router.get("/eval-trend")
def get_eval_trend(limit: int = Query(10, ge=2, le=50)):
    from fangyu.core.factory_eval import eval_trend

    return eval_trend(limit=limit)


@router.get("/eval-compare")
def get_eval_compare(
    i: int = Query(0, ge=0, le=99, description="历史下标（0=最新）"),
    j: int = Query(1, ge=0, le=99, description="对比下标"),
    limit: int = Query(40, ge=2, le=100),
):
    """对比两条 Eval 历史（默认 最新 vs 上一次）。"""
    from fangyu.core.factory_eval import compare_eval_reports, load_eval_history

    hist = load_eval_history(limit=limit)
    if len(hist) < 1:
        return {"ok": False, "error": "no history", "history_count": 0}
    if i >= len(hist) or j >= len(hist):
        raise HTTPException(400, f"下标越界：history_count={len(hist)}")
    return {
        "ok": True,
        "i": i,
        "j": j,
        "history_count": len(hist),
        "left": hist[i],
        "right": hist[j],
        "compare": compare_eval_reports(hist[i], hist[j]),
    }


@router.get("/alerts")
def get_monitor_alerts(limit: int = Query(40, ge=1, le=100)):
    """观测告警：工厂离线当前态 + 近期协作 warn 事件。"""
    from fangyu.core.monitor_alerts import collect_monitor_alerts

    return collect_monitor_alerts(limit=limit)


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
