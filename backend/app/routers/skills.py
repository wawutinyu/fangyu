from fastapi import APIRouter
from pydantic import BaseModel

from ..services.skill import (
    create_skill, edit_skill, delete_skill, list_skills, get_skill_content, learn_from_llm,
    skill_write_file, skill_remove_file,
)

router = APIRouter(prefix="/api/v1/skills", tags=["技能"])


class CreateSkillBody(BaseModel):
    name: str
    description: str = ""
    content: str = ""


class EditSkillBody(BaseModel):
    content: str


class LearnFromLLMBody(BaseModel):
    content: str


class SkillFileBody(BaseModel):
    skill_name: str
    filename: str
    content: str = ""


class SkillRemoveFileBody(BaseModel):
    skill_name: str
    filename: str


@router.get("/")
async def get_skills():
    return {"skills": list_skills()}


@router.get("/{name}")
async def get_skill(name: str):
    content = get_skill_content(name)
    if content is None:
        return {"found": False, "error": f"技能 '{name}' 不存在"}
    return {"found": True, "name": name, "content": content}


@router.post("/")
async def create_new_skill(body: CreateSkillBody):
    result = create_skill(body.name, body.description, body.content)
    return result


@router.put("/{name}")
async def update_skill(name: str, body: EditSkillBody):
    result = edit_skill(name, body.content)
    return result


@router.delete("/{name}")
async def remove_skill(name: str):
    result = delete_skill(name)
    return result


@router.post("/write-file")
async def write_skill_file(body: SkillFileBody):
    return skill_write_file(body.skill_name, body.filename, body.content)


@router.post("/remove-file")
async def remove_skill_file(body: SkillRemoveFileBody):
    return skill_remove_file(body.skill_name, body.filename)


@router.post("/learn-from-llm")
async def learn_from_llm_endpoint(body: LearnFromLLMBody):
    results = learn_from_llm(body.content)
    return {"skills_created": results, "count": len(results)}
