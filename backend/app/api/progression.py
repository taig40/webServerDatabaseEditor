"""progression.py — API routes for Progression modules.

Covers:

- **Job Database** (``job_stats``, ``job_basepoints``, ``job_aspd``, ``job_outfits``)
- **Experience Tables** (``job_exp``)
- **Visual Skill Tree** (``skill_tree``)
"""

from fastapi import APIRouter, HTTPException, Query, Body
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from app.services.progression_parser import (
    job_stats_db,
    job_basepoints_db,
    job_exp_db,
    skill_tree_db,
    job_aspd_db,
    job_outfits_db,
    is_alternate_sprite,
    classify_job_category
)

router = APIRouter()

class JobStatsUpdatePayload(BaseModel):
    index: int
    data: Dict[str, Any]

class JobBasepointsUpdatePayload(BaseModel):
    index: int
    data: Dict[str, Any]

class JobAspdUpdatePayload(BaseModel):
    index: int
    data: Dict[str, Any]

class JobOutfitsUpdatePayload(BaseModel):
    index: int
    data: Dict[str, Any]

class ExpGroupUpdatePayload(BaseModel):
    index: Optional[int] = None
    data: Optional[Dict[str, Any]] = None
    className: Optional[str] = None
    base_index: Optional[int] = -1
    job_index: Optional[int] = -1
    base_exp: Optional[List[Dict[str, Any]]] = None
    job_exp: Optional[List[Dict[str, Any]]] = None

class SkillTreeUpdatePayload(BaseModel):
    tree: List[Dict[str, Any]]
    inherit: Optional[Dict[str, Any]] = None


# ─── JOB DATABASE ENDPOINTS ────────────────────────────────────────────────

@router.get("/jobs")
async def get_all_jobs():
    """Returns the combined list of all job classes with stats, basepoints, ASPD, and outfit data.

    Each entry is enriched with:
    - ``is_alternate_sprite``: ``True`` if the class only has alternate sprite names.
    - ``has_alternate_sprite``: ``True`` if any base job in this entry has alternate outfits.
    - ``category``: Job tier/category string from ``classify_job_category``.

    Returns:
        dict: ``{"job_stats", "job_basepoints", "job_aspd", "job_outfits", "is_loading"}``.
    """
    stats_list = job_stats_db.get_all()
    basepoints_list = job_basepoints_db.get_all()
    aspd_list = job_aspd_db.get_all()
    outfits_list = job_outfits_db.get_all()

    alt_base_jobs = set()
    for o in outfits_list:
        alts = o.get("AlternateOutfits")
        if alts:
            jobs = o.get("Jobs", {})
            if isinstance(jobs, dict):
                alt_base_jobs.update(jobs.keys())
            elif isinstance(jobs, list):
                alt_base_jobs.update(jobs)

    enriched_stats = []
    for entry in stats_list:
        jobs_field = entry.get("Jobs", {})
        job_names = list(jobs_field.keys()) if isinstance(jobs_field, dict) else (list(jobs_field) if isinstance(jobs_field, list) else [])
        non_alt_names = [j for j in job_names if not is_alternate_sprite(j)]
        if not non_alt_names:
            entry["is_alternate_sprite"] = True
            primary_name = job_names[0] if job_names else "Unknown"
        else:
            entry["is_alternate_sprite"] = False
            primary_name = non_alt_names[0]

        entry["category"] = classify_job_category(primary_name)
        entry["has_alternate_sprite"] = any(j in alt_base_jobs for j in job_names)
        enriched_stats.append(entry)

    print(f"[progression] GET /jobs - stats: {len(enriched_stats)}, basepoints: {len(basepoints_list)}, aspd: {len(aspd_list)}, outfits: {len(outfits_list)}")
    return {
        "job_stats": enriched_stats,
        "job_basepoints": basepoints_list,
        "job_aspd": aspd_list,
        "job_outfits": outfits_list,
        "is_loading": (
            job_stats_db.is_loading or
            job_basepoints_db.is_loading or
            job_aspd_db.is_loading or
            job_outfits_db.is_loading
        )
    }

@router.get("/jobs/{job_name}")
async def get_job_details(job_name: str):
    """Returns all configuration details for a specific job class.

    Args:
        job_name: rAthena job constant name (e.g. ``Knight``).

    Returns:
        dict: ``{"job_name", "stats", "basepoints", "aspd", "outfits"}``.

    Raises:
        HTTPException: 404 if the job is not found in any configuration file.
    """
    stats_entry = job_stats_db.get_by_job(job_name)
    bp_entry = job_basepoints_db.get_by_job(job_name)
    aspd_entry = job_aspd_db.get_by_job(job_name)
    outfits_entry = job_outfits_db.get_by_job(job_name)

    if not stats_entry and not bp_entry and not aspd_entry and not outfits_entry:
        raise HTTPException(status_code=404, detail="ERROR_JOB_NOT_FOUND")

    print(f"[progression] GET /jobs/{job_name} - stats: {stats_entry is not None}, basepoints: {bp_entry is not None}, aspd: {aspd_entry is not None}, outfits: {outfits_entry is not None}")
    return {
        "job_name": job_name,
        "stats": stats_entry,
        "basepoints": bp_entry,
        "aspd": aspd_entry,
        "outfits": outfits_entry
    }

@router.put("/jobs/stats")
async def update_job_stats(payload: JobStatsUpdatePayload):
    """Updates a job stats entry in ``job_stats.yml`` by index.

    Args:
        payload: ``{index, data}`` where index is the 0-based entry position.

    Returns:
        dict: The updated job stats entry.

    Raises:
        HTTPException: 400 if the update fails.
    """
    updated = job_stats_db.update_entry(payload.index, payload.data)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_JOB_STATS_FAILED")
    return updated

@router.put("/jobs/basepoints")
async def update_job_basepoints(payload: JobBasepointsUpdatePayload):
    """Updates a job basepoints entry in ``job_basepoints.yml`` by index.

    Args:
        payload: ``{index, data}`` where index is the 0-based entry position.

    Returns:
        dict: The updated job basepoints entry.

    Raises:
        HTTPException: 400 if the update fails.
    """
    updated = job_basepoints_db.update_entry(payload.index, payload.data)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_JOB_BASEPOINTS_FAILED")
    return updated

@router.put("/jobs/aspd")
async def update_job_aspd(payload: JobAspdUpdatePayload):
    """Updates a job ASPD entry in ``job_aspd.yml`` by index.

    Args:
        payload: ``{index, data}`` where index is the 0-based entry position.

    Returns:
        dict: The updated ASPD entry.

    Raises:
        HTTPException: 400 if the update fails.
    """
    updated = job_aspd_db.update_entry(payload.index, payload.data)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_JOB_ASPD_FAILED")
    return updated

@router.put("/jobs/outfits")
async def update_job_outfits(payload: JobOutfitsUpdatePayload):
    """Updates a job outfits entry in ``job_outfits.yml`` by index.

    Args:
        payload: ``{index, data}`` where index is the 0-based entry position.

    Returns:
        dict: The updated outfits entry.

    Raises:
        HTTPException: 400 if the update fails.
    """
    updated = job_outfits_db.update_entry(payload.index, payload.data)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_JOB_OUTFITS_FAILED")
    return updated



# ─── EXPERIENCE TABLES ENDPOINTS ──────────────────────────────────────────

@router.get("/exp")
async def get_experience_tables():
    """Returns all experience tables aggregated and merged by job class.

    Returns:
        dict: ``{"tables": [...], "is_loading": bool}``.
    """
    aggregated_tables = job_exp_db.get_aggregated_tables()
    print(f"[progression] GET /exp - aggregated tables: {len(aggregated_tables)}")
    return {
        "tables": aggregated_tables,
        "is_loading": job_exp_db.is_loading
    }

@router.put("/exp")
async def update_experience_table(payload: ExpGroupUpdatePayload):
    """Updates one or both experience curves in ``job_exp.yml``.

    Accepts two modes:
    - **Aggregated mode**: provide ``className`` + ``base_index``/``job_index`` + ``base_exp``/``job_exp``.
    - **Direct mode**: provide ``index`` + ``data`` for a raw group update.

    Args:
        payload: Update payload (see ``ExpGroupUpdatePayload`` for full schema).

    Returns:
        dict: ``{"status": "success", "className": str}`` or the updated group entry.

    Raises:
        HTTPException: 400 if payload is invalid or the update fails.
    """
    if payload.className is not None and (payload.base_index is not None or payload.job_index is not None):
        success = job_exp_db.update_aggregated_exp(
            base_index=payload.base_index if payload.base_index is not None else -1,
            job_index=payload.job_index if payload.job_index is not None else -1,
            base_exp=payload.base_exp,
            job_exp=payload.job_exp
        )
        if not success:
            raise HTTPException(status_code=400, detail="ERROR_UPDATE_EXP_TABLE_FAILED")
        return {"status": "success", "className": payload.className}
    elif payload.index is not None and payload.data is not None:
        updated = job_exp_db.update_group(payload.index, payload.data)
        if not updated:
            raise HTTPException(status_code=400, detail="ERROR_UPDATE_EXP_TABLE_FAILED")
        return updated
    else:
        raise HTTPException(status_code=400, detail="INVALID_PAYLOAD")


# ─── VISUAL SKILL TREE ENDPOINTS ──────────────────────────────────────────

@router.get("/skill_tree")
async def get_all_skill_trees():
    """Returns a summary of all job classes configured in ``skill_tree.yml``.

    Alternate sprite variants are excluded from the summary.  Each entry is
    enriched with ``SkillCount`` and ``category``.

    Returns:
        dict: ``{"jobs": [...], "is_loading": bool}``.
    """
    trees = skill_tree_db.get_all_raw()
    summary = []
    for t in trees:
        job_name = t.get("Job", "")
        if is_alternate_sprite(job_name):
            continue
        summary.append({
            "Job": job_name,
            "Inherit": t.get("Inherit", {}),
            "SkillCount": len(t.get("Tree", [])) if isinstance(t.get("Tree"), list) else 0,
            "category": classify_job_category(job_name)
        })
    print(f"[progression] GET /skill_tree - summary entries: {len(summary)}")
    return {
        "jobs": summary,
        "is_loading": skill_tree_db.is_loading
    }

@router.get("/skill_tree/{job_name}")
async def get_job_skill_tree(job_name: str):
    """Returns the skill tree for a specific job class, enriched with IDs, descriptions, and icons.

    Returns an empty tree structure if the job has no entries in ``skill_tree.yml``.

    Args:
        job_name: rAthena job constant name.

    Returns:
        dict: ``{"Job", "Inherit", "Tree": [{...skill info...}]}``.
    """
    enriched = skill_tree_db.get_job_tree_enriched(job_name)
    if not enriched:
        enriched = {
            "Job": job_name,
            "Inherit": {},
            "Tree": []
        }
    print(f"[progression] GET /skill_tree/{job_name} - tree nodes: {len(enriched.get('Tree', [])) if enriched else 0}")
    return enriched

@router.put("/skill_tree/{job_name}")
async def update_job_skill_tree(job_name: str, payload: SkillTreeUpdatePayload):
    """Updates the skill tree and prerequisites for a job class in ``skill_tree.yml``.

    Args:
        job_name: rAthena job constant name.
        payload: ``{tree: [...], inherit: {...}}``.

    Returns:
        dict: The updated skill tree entry.

    Raises:
        HTTPException: 400 if the update fails.
    """
    updated = skill_tree_db.update_job_tree(job_name, payload.tree, payload.inherit)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_SKILL_TREE_FAILED")
    return updated
