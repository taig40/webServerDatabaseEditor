from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from app.services.randomopt_parser import randomopt_db

router = APIRouter()

class RandomOptPayload(BaseModel):
    groups: List[Dict[str, Any]]


@router.get("")
async def get_random_options():
    randomopt_db.initialize()
    return {
        "options": randomopt_db.options_data,
        "groups": randomopt_db.groups_data
    }

@router.get("/{group_id}")
async def get_random_option_group(group_id: int):
    randomopt_db.initialize()
    group = next((g for g in randomopt_db.groups_data if g.get("Id") == group_id), None)
    if not group:
        raise HTTPException(status_code=404, detail="Random Option Group not found")
    return group

@router.put("/{group_id}")
async def save_random_option_group(group_id: int, payload: Dict[str, Any]):
    payload["Id"] = group_id
    success = randomopt_db.save_unified_group(payload)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save random option group.")
    return {"status": "saved", "group": payload}

@router.put("")
async def save_random_options(payload: RandomOptPayload):
    success = randomopt_db.save_groups(payload.groups)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save random option groups to file.")
    return {"status": "saved"}

