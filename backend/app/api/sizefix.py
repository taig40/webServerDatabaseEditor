from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from app.services.sizefix_parser import sizefix_db

router = APIRouter()

class SizeFixEntry(BaseModel):
    Weapon: str
    Small: int
    Medium: int
    Large: int

class SizeFixPayload(BaseModel):
    matrix: List[SizeFixEntry]

@router.get("")
async def get_size_fix():
    """Returns the full size-modifier penalty matrix from ``size_fix.txt``.

    Returns:
        list: Rows of ``{Weapon, Small, Medium, Large}`` modifier entries.
    """
    sizefix_db.initialize()
    return sizefix_db.matrix_data

@router.put("")
async def save_size_fix(payload: SizeFixPayload):
    """Saves the updated size-modifier matrix back to ``size_fix.txt``.

    Args:
        payload: Full matrix payload.

    Returns:
        dict: ``{"status": "saved"}``.

    Raises:
        HTTPException: 500 if the write fails.
    """
    matrix_list = [entry.model_dump() for entry in payload.matrix]
    success = sizefix_db.save_matrix(matrix_list)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save size penalties to file.")
    return {"status": "saved"}
