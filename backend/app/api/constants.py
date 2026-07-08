"""constants.py — API endpoints for emulator constants (const.yml)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Optional, Union
from app.services.const_parser import const_db

router = APIRouter()


class ConstantEntryPayload(BaseModel):
    Name: str
    Value: Union[int, str]
    Parameter: Optional[bool] = False


class ConstantsSavePayload(BaseModel):
    constants: list[ConstantEntryPayload]


@router.get("/status")
async def get_constants_status():
    return {
        "is_loading": const_db.is_loading,
        "message": const_db.loading_status,
        "entries_loaded": const_db.entries_loaded,
    }


@router.get("/")
async def get_constants():
    if const_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    entries = const_db.get_all()
    return {
        "total": len(entries),
        "constants": entries,
    }


@router.put("/")
async def save_constants(body: ConstantsSavePayload):
    if const_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    try:
        entries_dict = [entry.model_dump() for entry in body.constants]
        const_db.save_constants(entries_dict)
        return {"status": "saved", "total": len(entries_dict)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
