from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from ..models.database import get_session
from ..models.project import Project, Save

router = APIRouter(prefix="/api/v1/projects", tags=["项目"])


class CreateProjectBody(BaseModel):
    id: str = ''
    name: str = '未命名项目'
    description: str = ''


class UpdateProjectBody(BaseModel):
    name: str = ''
    description: str = ''


class CreateSaveBody(BaseModel):
    id: str = ''
    name: str = '保存'
    flow_data: str = '{}'


@router.get("/")
async def list_projects(db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Project).order_by(Project.updated_at.desc()))
    projects = result.scalars().all()
    return {
        'projects': [
            {
                'id': p.id,
                'name': p.name,
                'description': p.description,
                'created_at': str(p.created_at),
                'updated_at': str(p.updated_at),
            }
            for p in projects
        ]
    }


@router.post("/")
async def create_project(body: CreateProjectBody, db: AsyncSession = Depends(get_session)):
    project_id = body.id or _gen_id('p')
    project = Project(id=project_id, name=body.name, description=body.description)
    db.add(project)
    await db.commit()
    return {
        'id': project.id,
        'name': project.name,
        'description': project.description,
        'created_at': str(project.created_at),
        'updated_at': str(project.updated_at),
    }


@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, '项目不存在')
    return {
        'id': project.id,
        'name': project.name,
        'description': project.description,
        'created_at': str(project.created_at),
        'updated_at': str(project.updated_at),
    }


@router.put("/{project_id}")
async def update_project(project_id: str, body: UpdateProjectBody, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, '项目不存在')
    if body.name:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    await db.commit()
    return {'success': True}


@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_session)):
    await db.execute(delete(Save).where(Save.project_id == project_id))
    await db.execute(delete(Project).where(Project.id == project_id))
    await db.commit()
    return {'success': True}


@router.get("/{project_id}/saves")
async def list_saves(project_id: str, db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(Save).where(Save.project_id == project_id).order_by(Save.created_at.desc())
    )
    saves = result.scalars().all()
    return {
        'saves': [
            {
                'id': s.id,
                'name': s.name,
                'flow_data': s.flow_data,
                'created_at': str(s.created_at),
            }
            for s in saves
        ]
    }


@router.post("/{project_id}/saves")
async def create_save(project_id: str, body: CreateSaveBody, db: AsyncSession = Depends(get_session)):
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    if not project_result.scalar_one_or_none():
        raise HTTPException(404, '项目不存在')

    save_id = body.id or _gen_id('s')
    save = Save(id=save_id, project_id=project_id, name=body.name, flow_data=body.flow_data)
    db.add(save)
    await db.commit()
    return {
        'id': save.id,
        'name': save.name,
        'flow_data': save.flow_data,
        'created_at': str(save.created_at),
    }


@router.delete("/saves/{save_id}")
async def delete_save(save_id: str, db: AsyncSession = Depends(get_session)):
    await db.execute(delete(Save).where(Save.id == save_id))
    await db.commit()
    return {'success': True}


def _gen_id(prefix: str) -> str:
    import secrets
    return f'{prefix}_{secrets.token_hex(8)}'
