from pydantic import BaseModel, ConfigDict
from typing import Optional, Any

class ItemUpdate(BaseModel):
    # Using extra='allow' so that dynamic fields from rAthena (like Script, EquipScript, etc.) can be updated freely
    model_config = ConfigDict(extra='allow')
    
    Name: Optional[str] = None
    Type: Optional[str] = None
    Buy: Optional[int] = None
    Sell: Optional[int] = None
    Weight: Optional[int] = None
    Atk: Optional[int] = None
    Def: Optional[int] = None
    Slots: Optional[int] = None
    Script: Optional[str] = None
