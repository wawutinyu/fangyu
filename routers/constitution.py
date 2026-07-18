"""宪法 API — 读取/更新规则与审计日志"""
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from fangyu.core.constitution import (
    apply_flow_governance,
    audit_event,
    load_constitution,
    read_audit_log,
    save_constitution,
)

router = APIRouter(prefix="/api/v1/constitution", tags=["宪法"])


class ConstitutionUpdate(BaseModel):
    version: str | None = None
    name: str | None = None
    enabled: bool | None = None
    values: list[str] | None = None
    forbidden_actions: list[str] | None = None
    forbidden_node_types: list[str] | None = None
    require_audit: bool | None = None
    policies: list[dict] | None = None


class ScanFlowRequest(BaseModel):
    nodes: list[dict]
    context: str = "flow"


class BundleConstitutionBody(BaseModel):
    bundle_dir: str
    constitution: dict | None = None


@router.get("")
def get_constitution():
    return load_constitution()


@router.put("")
def update_constitution(body: ConstitutionUpdate):
    current = load_constitution()
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "无更新内容")
    updated = save_constitution({**current, **patch})
    return {"success": True, "constitution": updated}


@router.get("/policy-templates")
def policy_templates():
    """策略模板目录（与 Studio 模板对齐的服务端副本）。"""
    return {
        "templates": [
            {
                "id": "llm_model_required",
                "name": "LLM 须指定模型",
                "description": "llm 节点缺 model 时警告",
                "policy": {
                    "id": "policy_llm_model",
                    "description": "LLM 节点应指定 model",
                    "enabled": True,
                    "when": {"node_type": "llm"},
                    "assert": {"field": "model", "op": "nonempty"},
                    "on_fail": {"action": "warn", "message": "LLM 节点未指定 model"},
                },
            },
            {
                "id": "deny_shell_node",
                "name": "禁止 shell 节点",
                "description": "画布出现 shell 类节点则拒绝",
                "policy": {
                    "id": "policy_deny_shell",
                    "description": "禁止 shell 节点",
                    "enabled": True,
                    "when": {"node_type_in": ["shell", "code_exec"]},
                    "assert": {"field": "_", "op": "never"},
                    "on_fail": {"action": "deny", "message": "宪法禁止 shell/code_exec 节点"},
                },
            },
            {
                "id": "http_url_required",
                "name": "HTTP 须有 URL",
                "description": "http 请求节点缺 url 警告",
                "policy": {
                    "id": "policy_http_url",
                    "description": "HTTP 节点需要 url",
                    "enabled": True,
                    "when": {"node_type": "http"},
                    "assert": {"field": "url", "op": "nonempty"},
                    "on_fail": {"action": "warn", "message": "HTTP 节点缺少 url"},
                },
            },
        ]
    }


@router.post("/from-bundle")
def constitution_from_bundle(body: BundleConstitutionBody):
    """从 Bundle 根目录加载 constitution.json 到平台 DATA_DIR。"""
    root = Path(body.bundle_dir).expanduser()
    src = root / "constitution.json"
    if not src.is_file():
        raise HTTPException(404, f"未找到 {src}")
    try:
        doc = json.loads(src.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(400, f"读取失败: {exc}") from exc
    if not isinstance(doc, dict):
        raise HTTPException(400, "constitution.json 不是对象")
    saved = save_constitution(doc)
    audit_event("constitution_from_bundle", {"bundle_dir": str(root)})
    return {"ok": True, "constitution": saved, "source": str(src)}


@router.post("/to-bundle")
def constitution_to_bundle(body: BundleConstitutionBody):
    """把当前（或请求体）宪法写入 Bundle。"""
    root = Path(body.bundle_dir).expanduser()
    if not root.is_dir():
        raise HTTPException(400, "bundle_dir 不是目录")
    doc = body.constitution if isinstance(body.constitution, dict) else load_constitution()
    path = root / "constitution.json"
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    # 同步包内 data 副本
    data_c = root / "data" / "constitution.json"
    try:
        data_c.parent.mkdir(parents=True, exist_ok=True)
        data_c.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass
    audit_event("constitution_to_bundle", {"bundle_dir": str(root)})
    return {"ok": True, "path": str(path)}


@router.post("/scan")
def scan_flow(body: ScanFlowRequest):
    gov = apply_flow_governance(body.nodes, context=body.context)
    return {
        "deny": gov["deny"],
        "warn": gov["warn"],
        "all": gov["all"],
        "blocked": len(gov["deny"]) > 0,
    }


@router.get("/audit/verify")
def verify_audit(limit: int = 200):
    from ..core.constitution import verify_audit_chain
    limit = max(1, min(limit, 500))
    return verify_audit_chain(limit)


@router.get("/audit")
def get_audit_log(limit: int = 50):
    limit = max(1, min(limit, 200))
    return {"entries": read_audit_log(limit)}


@router.post("/audit/test")
def write_test_audit():
    audit_event("manual_test", {"source": "api"})
    return {"success": True}
