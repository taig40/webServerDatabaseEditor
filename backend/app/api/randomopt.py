from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from app.services.randomopt_parser import randomopt_db

router = APIRouter()

class GroupOptionLine(BaseModel):
    Option: str
    Chance: int

class RandomOptionGroup(BaseModel):
    Id: int
    Group: str
    Options: List[GroupOptionLine]

class RandomOptPayload(BaseModel):
    groups: List[RandomOptionGroup]

@router.get("")
async def get_random_options():
    randomopt_db.initialize()
    return {
        "options": randomopt_db.options_data,
        "groups": randomopt_db.groups_data
    }

@router.put("")
async def save_random_options(payload: RandomOptPayload):
    groups_list = [g.model_dump() for g in payload.groups]
    success = randomopt_db.save_groups(groups_list)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save random option groups to file.")
    return {"status": "saved"}
