"""skills.py — API endpoints for Skill DB."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any, Optional
from app.services.skill_parser import skill_db
from app.services.progression_parser import skill_tree_db

router = APIRouter()


from app.models.skill import SkillModel

class SkillUpdate(BaseModel):
    data: SkillModel


class SkillCreate(BaseModel):
    data: SkillModel



@router.get("/status")
async def get_skill_status():
    return {
        "is_loading": skill_db.is_loading,
        "message": skill_db.loading_status,
        "skills_loaded": skill_db.entries_loaded,
    }

@router.get("/references")
async def get_skill_references():
    """
    Retorna uma lista leve de todas as habilidades para o ReferencePicker / Smart Autocomplete do Front-end.
    """
    if skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    skills = skill_db.get_skills()
    result = []
    for skill in skills:
        skill_id = skill.get("Id")
        if skill_id is None:
            continue
        result.append({
            "Id": skill_id,
            "Name": skill.get("Name", skill.get("Description", f"SKILL_{skill_id}")),
            "is_custom": False
        })
    return {"skills": result}

@router.get("/")
async def get_skills(
    skip: int = Query(0),
    limit: int = Query(0),
):
    if skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    skills = skill_db.get_skills()
    if limit > 0:
        result_skills = skills[skip: skip + limit]
    else:
        result_skills = skills[skip:]
    return {
        "total": len(skills),
        "skip": skip,
        "limit": limit,
        "skills": result_skills,
    }


@router.get("/tree/{job_name}")
async def get_skill_tree_with_lineage(job_name: str):
    """
    Retorna a árvore de habilidades combinada da classe e de suas classes base (linhagem).
    """
    if skill_tree_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    
    visited_jobs = set()
    combined_tree = []
    
    def fetch_tree(current_job: str):
        if current_job in visited_jobs:
            return
        visited_jobs.add(current_job)
        
        enriched = skill_tree_db.get_job_tree_enriched(current_job)
        if not enriched:
            return
            
        tree_nodes = enriched.get("Tree", [])
        
        # Inject OriginJob to each node so UI knows where it came from
        for node in tree_nodes:
            node["OriginJob"] = current_job
            
        combined_tree.extend(tree_nodes)
        
        inherit_data = enriched.get("Inherit")
        if not inherit_data:
            return
            
        if isinstance(inherit_data, str):
            fetch_tree(inherit_data)
        elif isinstance(inherit_data, dict):
            for base_job in inherit_data.keys():
                fetch_tree(base_job)
        elif isinstance(inherit_data, list):
            for base_job in inherit_data:
                fetch_tree(base_job)
                
    fetch_tree(job_name)
    
    if not combined_tree:
        raise HTTPException(status_code=404, detail="Tree not found")
        
    return {"Job": job_name, "Tree": combined_tree}


@router.get("/{skill_id}")
async def get_skill(skill_id: int):
    if skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    skill = skill_db.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="ERROR_SKILL_NOT_FOUND")
    return skill


@router.put("/{skill_id}")
async def update_skill(skill_id: int, body: SkillUpdate):
    updated_dict = body.data.model_dump(exclude_unset=True)
    if "Id" in updated_dict:
        del updated_dict["Id"]
    result = skill_db.update_skill(skill_id, updated_dict)
    if result is None:
        raise HTTPException(status_code=404, detail="ERROR_SKILL_NOT_FOUND")
    return result


@router.post("/", status_code=201)
async def create_skill(body: SkillCreate):
    if skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    validated_data = body.data.model_dump(exclude_none=True)
    if "Id" not in validated_data or not validated_data["Id"]:
        raise HTTPException(status_code=422, detail="O campo 'Id' é obrigatório para criação de uma habilidade.")

    if skill_db.get_skill(validated_data["Id"]) is not None:
        raise HTTPException(status_code=409, detail=f"A habilidade com Id {validated_data['Id']} já existe.")

    created = skill_db.create_skill(validated_data)
    return created


@router.delete("/{skill_id}", status_code=200)
async def delete_skill(skill_id: int):
    """
    Remove permanentemente uma habilidade de db/import/skill_db.yml.

    Retorna 403 se a habilidade pertencer ao banco oficial do rAthena (db/re/ ou db/pre-re/).
    Retorna 404 se a habilidade não existir no índice.
    Retorna 200 { deleted: true, skill_id } em caso de sucesso.
    """
    if skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    try:
        deleted = skill_db.delete_skill(skill_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if not deleted:
        raise HTTPException(status_code=404, detail="ERROR_SKILL_NOT_FOUND")

    return {"deleted": True, "skill_id": skill_id}

