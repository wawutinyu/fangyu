from fastapi import APIRouter
from pydantic import BaseModel

from ..services.tool_registry import register_tool, unregister_tool, list_tools, execute_tool, register_from_llm_output

router = APIRouter(prefix="/api/v1/tools", tags=["工具注册"])


class RegisterToolBody(BaseModel):
    name: str
    description: str
    parameters: dict = {}
    implementation: dict = {"type": "prompt", "template": ""}


class ExecuteToolBody(BaseModel):
    name: str
    args: dict = {}


class ParseFromLLMBody(BaseModel):
    content: str


@router.get("/")
async def get_tools():
    return {"tools": list_tools()}


@router.post("/register")
async def create_tool(body: RegisterToolBody):
    result = register_tool(body.name, body.description, body.parameters, body.implementation)
    return result


@router.post("/unregister")
async def delete_tool(name: str):
    result = unregister_tool(name)
    return result


@router.post("/execute")
async def run_tool(body: ExecuteToolBody):
    try:
        result = await execute_tool(body.name, body.args, {})
        return {"success": True, "result": result}
    except ValueError as e:
        return {"success": False, "error": str(e)}


@router.post("/parse-from-llm")
async def parse_from_llm(body: ParseFromLLMBody):
    results = register_from_llm_output(body.content)
    return {"tools_registered": results, "count": len(results)}
