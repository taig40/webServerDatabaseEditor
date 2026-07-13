"""mob_skills.py — API endpoints for Mob Skills (mob_skill_db.txt)."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any, Optional, List
from app.services.mob_skill_parser import mob_skill_db

router = APIRouter()


class MobSkillUpdate(BaseModel):
    data: dict[str, Any]


class MobSkillCreate(BaseModel):
    data: dict[str, Any]


@router.get("/status")
async def get_mob_skill_status():
    return {
        "is_loading": mob_skill_db.is_loading,
        "message": mob_skill_db.loading_status,
        "skills_loaded": mob_skill_db.entries_loaded,
    }


@router.get("/")
async def get_mob_skills(
    mob_id: Optional[int] = Query(None, description="Filter skills by mob ID"),
):
    if mob_skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    if mob_id is not None:
        skills = mob_skill_db.get_by_mob(mob_id)
    else:
        skills = mob_skill_db.get_all()
    return {
        "total": len(skills),
        "skills": skills,
    }


@router.put("/{line_index}")
async def update_mob_skill(line_index: int, body: MobSkillUpdate):
    if mob_skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    result = mob_skill_db.update_entry(line_index, body.data)
    if result is None:
        raise HTTPException(status_code=404, detail="ERROR_MOB_SKILL_NOT_FOUND")
    return result


@router.post("/")
async def create_mob_skill(body: MobSkillCreate):
    if mob_skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    result = mob_skill_db.add_entry(body.data)
    return result


@router.delete("/{line_index}")
async def delete_mob_skill(
    line_index: int,
    source: str = Query("custom", description="Source of the entry: 'rathena' or 'custom'"),
):
    if mob_skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    success = mob_skill_db.delete_entry(line_index, source)
    if not success:
        raise HTTPException(status_code=404, detail="ERROR_NOT_FOUND")
    return {"status": "ok", "deleted_index": line_index}
