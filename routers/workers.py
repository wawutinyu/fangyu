from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..core.worker_registry import (
    append_task_event,
    complete_task,
    enqueue_task,
    get_task,
    get_worker,
    heartbeat,
    list_task_events,
    list_tasks,
    list_workers,
    poll_task,
    register_worker,
)

WORKER_TASK_TYPES = frozenset({"shell", "run_flow", "read_file", "write_file", "adapter_invoke"})

router = APIRouter(prefix="/api/v1/workers", tags=["方隅·行 Worker"])


class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    hostname: str = ""
    os: str = ""
    capabilities: list[str] = Field(default_factory=lambda: ["shell", "run_flow", "read_file", "write_file", "adapter_invoke"])
    worker_id: str | None = None


class HeartbeatBody(BaseModel):
    worker_id: str


class EnqueueTaskBody(BaseModel):
    type: str = Field(min_length=1)
    payload: dict = Field(default_factory=dict)
    worker_id: str | None = None
    worker_name: str | None = None


class CompleteTaskBody(BaseModel):
    worker_id: str
    status: str = Field(pattern="^(done|failed)$")
    result: dict | None = None
    error: str | None = None


class TaskEventBody(BaseModel):
    worker_id: str
    event_type: str = Field(min_length=1)
    message: str = ""
    detail: dict | None = None


class MqttFireBody(BaseModel):
    topic: str = "fangyu/line1/event"
    payload: dict | None = None


@router.post("/register")
async def register(body: RegisterBody):
    worker = register_worker(
        name=body.name,
        hostname=body.hostname,
        os_name=body.os,
        capabilities=body.capabilities,
        worker_id=body.worker_id,
    )
    return {"worker": worker}


@router.post("/heartbeat")
async def worker_heartbeat(body: HeartbeatBody):
    worker = heartbeat(body.worker_id)
    if not worker:
        raise HTTPException(404, "worker not found")
    return {"ok": True, "worker_id": body.worker_id}


@router.get("")
async def workers_list():
    return {"workers": list_workers()}


@router.post("/tasks")
async def create_task(body: EnqueueTaskBody):
    allowed = WORKER_TASK_TYPES
    if body.type not in allowed:
        raise HTTPException(400, f"unsupported task type: {body.type}")

    try:
        task = enqueue_task(
            task_type=body.type,
            payload=body.payload,
            worker_id=body.worker_id,
            worker_name=body.worker_name,
        )
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc

    assigned_name = None
    if task.get("worker_id"):
        w = get_worker(task["worker_id"])
        assigned_name = w["name"] if w else None

    return {
        "task_id": task["id"],
        "status": task["status"],
        "assigned_worker_id": task.get("worker_id"),
        "assigned_worker_name": assigned_name,
    }


@router.get("/tasks/list")
async def tasks_list(limit: int = Query(50, le=200)):
    return {"tasks": list_tasks(limit=limit)}


@router.get("/tasks/poll")
async def tasks_poll(worker_id: str):
    task = poll_task(worker_id)
    if not task:
        return {"task": None}
    return {"task": task}


@router.post("/tasks/{task_id}/events")
async def task_event_append(task_id: str, body: TaskEventBody):
    ok = append_task_event(
        task_id,
        worker_id=body.worker_id,
        event_type=body.event_type,
        message=body.message,
        detail=body.detail,
    )
    if not ok:
        raise HTTPException(404, "task not found or worker mismatch")
    return {"ok": True}


@router.get("/tasks/{task_id}/events")
async def task_events(task_id: str, limit: int = Query(100, le=500)):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "task not found")
    return {"events": list_task_events(task_id, limit=limit)}


@router.get("/tasks/{task_id}")
async def task_status(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "task not found")
    return {"task": task}


@router.post("/tasks/{task_id}/complete")
async def tasks_complete(task_id: str, body: CompleteTaskBody):
    task = complete_task(
        task_id,
        worker_id=body.worker_id,
        status=body.status,
        result=body.result,
        error=body.error,
    )
    if not task:
        raise HTTPException(404, "task not found or worker mismatch")
    return {"task": get_task(task_id)}


@router.get("/triggers/mqtt/status")
async def mqtt_trigger_status():
    from ..core.worker_mqtt_bridge import get_worker_mqtt_bridge

    return get_worker_mqtt_bridge().status()


@router.post("/triggers/mqtt/start")
async def mqtt_trigger_start():
    from ..core.worker_mqtt_bridge import get_worker_mqtt_bridge

    return get_worker_mqtt_bridge().start()


@router.post("/triggers/mqtt/fire")
async def mqtt_trigger_fire(body: MqttFireBody):
    from ..core.worker_mqtt_bridge import get_worker_mqtt_bridge

    try:
        return get_worker_mqtt_bridge().fire_sim(body.topic, body.payload)
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.get("/{worker_id}")
async def worker_detail(worker_id: str):
    worker = get_worker(worker_id)
    if not worker:
        raise HTTPException(404, "worker not found")
    return {"worker": worker}
