"""
progression.py — Rotas da API para Módulos de Progressão:
  - Job Database (job_stats & job_basepoints)
  - Experience Tables (job_exp)
  - Visual Skill Tree (skill_tree)
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
    job_outfits_db
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
    index: int
    data: Dict[str, Any]

class SkillTreeUpdatePayload(BaseModel):
    tree: List[Dict[str, Any]]
    inherit: Optional[Dict[str, Any]] = None


# ─── JOB DATABASE ENDPOINTS ────────────────────────────────────────────────

@router.get("/jobs")
async def get_all_jobs():
    """
    Retorna a lista combinada de classes com atributos básicos, pontos base,
    ASPD e outfits alternativos.
    """
    stats_list = job_stats_db.get_all()
    basepoints_list = job_basepoints_db.get_all()
    aspd_list = job_aspd_db.get_all()
    outfits_list = job_outfits_db.get_all()

    print(f"[progression] GET /jobs - stats: {len(stats_list)}, basepoints: {len(basepoints_list)}, aspd: {len(aspd_list)}, outfits: {len(outfits_list)}")
    return {
        "job_stats": stats_list,
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
    """
    Retorna os detalhes de uma classe específica em todos os arquivos de configuração de classes.
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
    """
    Atualiza uma entrada em job_stats.yml pelo índice.
    """
    updated = job_stats_db.update_entry(payload.index, payload.data)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_JOB_STATS_FAILED")
    return updated

@router.put("/jobs/basepoints")
async def update_job_basepoints(payload: JobBasepointsUpdatePayload):
    """
    Atualiza uma entrada em job_basepoints.yml pelo índice.
    """
    updated = job_basepoints_db.update_entry(payload.index, payload.data)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_JOB_BASEPOINTS_FAILED")
    return updated

@router.put("/jobs/aspd")
async def update_job_aspd(payload: JobAspdUpdatePayload):
    """
    Atualiza uma entrada em job_aspd.yml pelo índice.
    """
    updated = job_aspd_db.update_entry(payload.index, payload.data)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_JOB_ASPD_FAILED")
    return updated

@router.put("/jobs/outfits")
async def update_job_outfits(payload: JobOutfitsUpdatePayload):
    """
    Atualiza uma entrada em job_outfits.yml pelo índice.
    """
    updated = job_outfits_db.update_entry(payload.index, payload.data)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_JOB_OUTFITS_FAILED")
    return updated



# ─── EXPERIENCE TABLES ENDPOINTS ──────────────────────────────────────────

@router.get("/exp")
async def get_experience_tables():
    """
    Retorna todas as tabelas de experiência configuradas em job_exp.yml.
    """
    exp_tables = job_exp_db.get_all()
    print(f"[progression] GET /exp - tables: {len(exp_tables)}")
    return {
        "tables": exp_tables,
        "is_loading": job_exp_db.is_loading
    }

@router.put("/exp")
async def update_experience_table(payload: ExpGroupUpdatePayload):
    """
    Atualiza uma tabela de experiência em job_exp.yml.
    """
    updated = job_exp_db.update_group(payload.index, payload.data)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_EXP_TABLE_FAILED")
    return updated


# ─── VISUAL SKILL TREE ENDPOINTS ──────────────────────────────────────────

@router.get("/skill_tree")
async def get_all_skill_trees():
    """
    Retorna um resumo de todas as classes configuradas na árvore de habilidades.
    """
    trees = skill_tree_db.get_all_raw()
    summary = []
    for t in trees:
        summary.append({
            "Job": t.get("Job"),
            "Inherit": t.get("Inherit", {}),
            "SkillCount": len(t.get("Tree", [])) if isinstance(t.get("Tree"), list) else 0
        })
    print(f"[progression] GET /skill_tree - summary entries: {len(summary)}")
    return {
        "jobs": summary,
        "is_loading": skill_tree_db.is_loading
    }

@router.get("/skill_tree/{job_name}")
async def get_job_skill_tree(job_name: str):
    """
    Retorna a árvore de habilidades de uma classe, enriquecida com IDs, descrições e ícones do skill_db.
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
    """
    Atualiza a árvore de habilidades e pré-requisitos de uma classe no skill_tree.yml.
    """
    updated = skill_tree_db.update_job_tree(job_name, payload.tree, payload.inherit)
    if not updated:
        raise HTTPException(status_code=400, detail="ERROR_UPDATE_SKILL_TREE_FAILED")
    return updated
