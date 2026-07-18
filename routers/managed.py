"""G2-D 托管面 API — Bundle daemon 启停 / 状态 / 日志。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/managed", tags=["托管"])


class StartBody(BaseModel):
    bundle_dir: str
    name: str = ""
    host: str = "127.0.0.1"
    port: int | None = None
    workspace: str = ""
    wait: bool = True


@router.get("/instances")
def managed_list():
    from fangyu.engine.managed_host import list_instances
    return {"instances": list_instances()}


@router.get("/instances/{instance_id}")
def managed_get(instance_id: str):
    from fangyu.engine.managed_host import get_instance
    inst = get_instance(instance_id)
    if not inst:
        raise HTTPException(404, f"实例不存在: {instance_id}")
    return inst


@router.post("/instances")
def managed_start(body: StartBody):
    from fangyu.engine.managed_host import start_instance
    try:
        return start_instance(
            body.bundle_dir,
            name=body.name or None,
            host=body.host,
            port=body.port,
            workspace=body.workspace or None,
            wait=body.wait,
        )
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@router.post("/instances/{instance_id}/stop")
def managed_stop(instance_id: str):
    from fangyu.engine.managed_host import stop_instance
    try:
        return stop_instance(instance_id)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e


@router.get("/instances/{instance_id}/logs")
def managed_logs(instance_id: str, tail: int = 80):
    from fangyu.engine.managed_host import read_logs
    try:
        return read_logs(instance_id, tail=tail)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e


@router.delete("/instances/{instance_id}")
def managed_remove(instance_id: str):
    from fangyu.engine.managed_host import remove_instance
    try:
        return remove_instance(instance_id)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e
