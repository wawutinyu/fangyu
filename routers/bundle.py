"""Agent Bundle API — 导出与校验"""
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from fangyu.core.agent_bundle import (
    BUNDLE_VERSION,
    create_agent_bundle,
    export_bundle_zip,
    load_agent_bundle,
    validate_bundle_integrity,
)

router = APIRouter(prefix="/api/v1/bundle", tags=["Agent Bundle"])


class SkillFlowBody(BaseModel):
    skill_id: str = "default"
    nodes: list = []
    edges: list = []
    links: list = []


class ExportBundleBody(BaseModel):
    name: str
    worker_only: bool = True
    agent_kind: str = "worker"
    a2a_port: int = 9001
    require_envelope: bool = True
    agent_card: dict | None = None
    trusted_peers: list[dict] = []
    skills: list[SkillFlowBody] = []


@router.get("/schema")
def get_bundle_schema():
    return {
        "bundle_version": BUNDLE_VERSION,
        "required_files": ["manifest.json", "agent.card.json", "identity.json", "skills/*/flow.json"],
        "capabilities": ["a2a_server", "a2a_client", "worker_only"],
    }


@router.post("/export")
def export_bundle(body: ExportBundleBody):
    import tempfile

    skills_map: dict = {}
    if body.skills:
        for s in body.skills:
            flow = {"nodes": s.nodes, "edges": s.edges or s.links}
            skills_map[s.skill_id] = flow
    tmp = Path(tempfile.mkdtemp(prefix="fyu-bundle-"))
    bundle_dir = tmp / body.name
    try:
        create_agent_bundle(
            bundle_dir,
            name=body.name,
            skills=skills_map or None,
            agent_card=body.agent_card,
            worker_only=body.worker_only,
            agent_kind=body.agent_kind,
            a2a_port=body.a2a_port,
            require_envelope=body.require_envelope,
            trusted_peers=body.trusted_peers or None,
        )
        zip_path = export_bundle_zip(bundle_dir, tmp / f"{body.name}.bundle.zip")
        return FileResponse(
            path=str(zip_path),
            filename=f"{body.name}.bundle.zip",
            media_type="application/zip",
        )
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/validate")
def validate_bundle_path(body: dict):
    path = body.get("path", "")
    if not path:
        raise HTTPException(400, "path required")
    try:
        bundle = load_agent_bundle(path)
        return {
            "valid": True,
            "agent_id": bundle["manifest"]["agent_id"],
            "name": bundle["manifest"].get("name"),
            "skills": list(bundle["skills"].keys()),
        }
    except Exception as e:
        return {"valid": False, "error": str(e)}
