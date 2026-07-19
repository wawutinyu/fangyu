"""Intent → Flow / Agent 网 API。"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from fangyu.core.intent_agents import TemplateId as AgentTemplateId
from fangyu.core.intent_agents import intent_to_agent_graph
from fangyu.core.intent_flow import TemplateId, intent_to_flow

router = APIRouter(prefix="/api/v1/intent", tags=["Intent → Flow"])


class IntentToFlowRequest(BaseModel):
    intent: str = Field(..., min_length=1, description="自然语言目标")
    template: TemplateId | None = Field(
        default=None,
        description="强制模板；默认按关键词自动选择",
    )
    use_llm_plan: bool = False
    model: str = "deepseek-chat"


class IntentToAgentsRequest(BaseModel):
    intent: str = Field(..., min_length=1)
    template: AgentTemplateId | None = None


@router.post("/to-flow")
def to_flow(body: IntentToFlowRequest):
    try:
        return intent_to_flow(
            body.intent,
            template=body.template,
            use_llm_plan=body.use_llm_plan,
            model=body.model,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/to-agents")
def to_agents(body: IntentToAgentsRequest):
    try:
        return intent_to_agent_graph(body.intent, template=body.template)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/templates")
def list_templates():
    return {
        "templates": [
            {
                "id": "opencode_harness",
                "label": "OpenCode Harness",
                "desc": "input → agent-loop → output（画布验证多轮工具环）",
            },
            {
                "id": "action_loop",
                "label": "行动闭环",
                "desc": "observe → plan → act → verify",
            },
            {
                "id": "doc_assistant",
                "label": "文档助手",
                "desc": "input → llm → output",
            },
            {
                "id": "simple_io",
                "label": "简单输入输出",
                "desc": "input → output",
            },
        ],
        "agent_templates": [
            {
                "id": "office_report",
                "label": "办公起草·审校·落盘",
                "desc": "P4 办公×编排：三专家 + write_deliverable",
            },
            {
                "id": "search_analyze_summarize",
                "label": "检索·分析·汇总",
                "desc": "路由器 + 三 Agent",
            },
            {
                "id": "worker_pair",
                "label": "观察·执行",
                "desc": "双 Worker Agent",
            },
            {
                "id": "simple_dual",
                "label": "双 Agent",
                "desc": "最小协作对",
            },
        ],
    }
