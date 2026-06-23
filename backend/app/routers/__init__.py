from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


@router.get("/")
async def list_projects():
    return {"projects": []}


@router.post("/")
async def create_project():
    return {"project": None}


@router.get("/{project_id}")
async def get_project(project_id: str):
    return {"project": None}


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    return {"success": True}
