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
    """Returns the current background loading status for the skill database.

    Returns:
        dict: Keys ``is_loading``, ``message``, and ``skills_loaded``.
    """
    return {
        "is_loading": skill_db.is_loading,
        "message": skill_db.loading_status,
        "skills_loaded": skill_db.entries_loaded,
    }

@router.get("/references")
async def get_skill_references():
    """Returns a lightweight list of all skills for the ReferencePicker / Smart Autocomplete.

    Returns:
        dict: A ``{"skills": [...]}`` payload with ``Id``, ``Name``, and ``is_custom`` per entry.

    Raises:
        HTTPException: 503 if the database is still loading.
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
    """Returns a (optionally paginated) list of all skills.

    Args:
        skip: Number of entries to skip (0-based offset).
        limit: Maximum number of entries to return (0 = no limit).

    Returns:
        dict: ``total``, ``skip``, ``limit``, and ``skills`` list.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
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
    """Returns the combined skill tree for a job class and its entire base-class lineage.

    Traverses the inheritance chain recursively (``Inherit`` field) and merges all
    skill nodes into a single list.  Each node is annotated with an ``OriginJob``
    key so the UI can group or colour skills by their source class.

    Args:
        job_name: Internal job name string (e.g. ``Knight``, ``HighWizard``).

    Returns:
        dict: ``{"Job": job_name, "Tree": [...]}``.

    Raises:
        HTTPException: 503 if loading; 404 if no tree data is found for the job.
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

        # Tag each node with its source job for frontend grouping/colouring
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
    """Returns the full skill entry for a given skill ID.

    Args:
        skill_id: Numeric rAthena skill ID.

    Returns:
        dict: Complete skill object.

    Raises:
        HTTPException: 503 if loading; 404 if not found.
    """
    if skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    skill = skill_db.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="ERROR_SKILL_NOT_FOUND")
    return skill


@router.put("/{skill_id}")
async def update_skill(skill_id: int, body: SkillUpdate):
    """Updates a skill entry in the YAML database.

    Args:
        skill_id: Numeric rAthena skill ID.
        body: Skill update payload (only set fields are applied).

    Returns:
        dict: The updated skill object.

    Raises:
        HTTPException: 404 if the skill is not found.
    """
    updated_dict = body.data.model_dump(exclude_unset=True)
    if "Id" in updated_dict:
        del updated_dict["Id"]
    result = skill_db.update_skill(skill_id, updated_dict)
    if result is None:
        raise HTTPException(status_code=404, detail="ERROR_SKILL_NOT_FOUND")
    return result


@router.post("/", status_code=201)
async def create_skill(body: SkillCreate):
    """Creates a new custom skill entry in ``db/import/skill_db.yml``.

    Args:
        body: Skill creation payload. ``Id`` is required.

    Returns:
        dict: The newly created skill object.

    Raises:
        HTTPException: 503 if loading; 422 if ``Id`` is missing; 409 if ID already exists.
    """
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
    """Permanently removes a skill from ``db/import/skill_db.yml``.

    Args:
        skill_id: Numeric rAthena skill ID.

    Returns:
        dict: ``{"deleted": True, "skill_id": skill_id}`` on success.

    Raises:
        HTTPException: 503 if loading; 403 if the skill belongs to the official
            rAthena database; 404 if not found.
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

