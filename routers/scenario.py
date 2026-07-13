"""场景模板 API — 列表与一键实例化。"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from fangyu.core.scenario_templates import instantiate_scenario, list_scenarios

router = APIRouter(prefix="/api/v1/scenario", tags=["场景模板"])


class InstantiateRequest(BaseModel):
    id: str = Field(..., min_length=1, description="场景 id，如 line_inspection")
    apply_policies: bool = True
    create_bundle: bool = True


@router.get("/templates")
def get_templates():
    return {"scenarios": list_scenarios()}


@router.post("/instantiate")
def post_instantiate(body: InstantiateRequest):
    try:
        return instantiate_scenario(
            body.id.strip(),
            apply_policies=body.apply_policies,
            create_bundle=body.create_bundle,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"实例化失败: {exc}") from exc
