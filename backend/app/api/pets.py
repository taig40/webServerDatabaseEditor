"""pets.py — API endpoints for Pet DB (pet_db.yml)."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any, Optional
from app.services.pet_parser import pet_db

router = APIRouter()


class PetUpdate(BaseModel):
    data: dict[str, Any]


class PetCreate(BaseModel):
    data: dict[str, Any]


@router.get("/status")
async def get_pet_status():
    return {
        "is_loading": pet_db.is_loading,
        "message": pet_db.loading_status,
        "pets_loaded": pet_db.entries_loaded,
    }


@router.get("/")
async def get_pets(
    skip: int = Query(0),
    limit: int = Query(50000),
):
    if pet_db.is_loading:
        raise HTTPException(status_code=503, detail="Pet DB ainda carregando.")
    pets = pet_db.get_pets()
    return {
        "total": len(pets),
        "skip": skip,
        "limit": limit,
        "pets": pets[skip : skip + limit],
    }


@router.get("/{mob}")
async def get_pet(mob: str):
    if pet_db.is_loading:
        raise HTTPException(status_code=503, detail="Pet DB ainda carregando.")
    pet = pet_db.get_pet(mob)
    if not pet:
        raise HTTPException(status_code=404, detail="Pet não encontrado.")
    return pet


@router.put("/{mob}")
async def update_pet(mob: str, body: PetUpdate):
    if pet_db.is_loading:
        raise HTTPException(status_code=503, detail="Pet DB ainda carregando.")
    result = pet_db.update_pet(mob, body.data)
    if result is None:
        raise HTTPException(status_code=404, detail="Pet não encontrado.")
    return result


@router.post("/")
async def create_pet(body: PetCreate):
    if pet_db.is_loading:
        raise HTTPException(status_code=503, detail="Pet DB ainda carregando.")
    result = pet_db.add_pet(body.data)
    return result
