from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any

from ..services.variable import (
    variable_get, variable_set, variable_delete, variable_list, variable_persist,
)

router = APIRouter(prefix="/api/v1/variables", tags=["变量"])


class VariableSetBody(BaseModel):
    value: Any


@router.get("/")
async def get_variables():
    return {"variables": variable_list()}


@router.get("/{name}")
async def get_variable(name: str):
    value = variable_get(name)
    return {"name": name, "value": value, "found": value is not None}


@router.put("/{name}")
async def set_variable(name: str, body: VariableSetBody):
    result = variable_set(name, body.value)
    return result


@router.delete("/{name}")
async def delete_variable(name: str):
    return variable_delete(name)


@router.post("/{name}/persist")
async def persist_variable(name: str):
    return variable_persist(name)
