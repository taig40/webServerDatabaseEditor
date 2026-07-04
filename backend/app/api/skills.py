"""skills.py — API endpoints for Skill DB."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any, Optional
from app.services.skill_parser import skill_db

router = APIRouter()


class SkillUpdate(BaseModel):
    data: dict[str, Any]


@router.get("/status")
async def get_skill_status():
    return {
        "is_loading": skill_db.is_loading,
        "message": skill_db.loading_status,
        "skills_loaded": skill_db.entries_loaded,
    }


@router.get("/")
async def get_skills(
    skip: int = Query(0),
    limit: int = Query(50000),
):
    if skill_db.is_loading:
        raise HTTPException(status_code=503, detail="Skill DB ainda carregando.")
    skills = skill_db.get_skills()
    return {
        "total": len(skills),
        "skip": skip,
        "limit": limit,
        "skills": skills[skip: skip + limit],
    }


@router.get("/{skill_id}")
async def get_skill(skill_id: int):
    if skill_db.is_loading:
        raise HTTPException(status_code=503, detail="Skill DB ainda carregando.")
    skill = skill_db.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill não encontrada.")
    return skill


@router.put("/{skill_id}")
async def update_skill(skill_id: int, body: SkillUpdate):
    result = skill_db.update_skill(skill_id, body.data)
    if result is None:
        raise HTTPException(status_code=404, detail="Skill não encontrada.")
    return result
