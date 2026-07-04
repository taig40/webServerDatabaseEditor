from pydantic import BaseModel, ConfigDict
from typing import Optional, Any

class ItemUpdate(BaseModel):
    # Using extra='allow' so that dynamic fields from rAthena (like Script, EquipScript, etc.) can be updated freely
    model_config = ConfigDict(extra='allow')
    
    Name: Optional[Any] = None
    Type: Optional[Any] = None
    Buy: Optional[Any] = None
    Sell: Optional[Any] = None
    Weight: Optional[Any] = None
    Atk: Optional[Any] = None
    Def: Optional[Any] = None
    Slots: Optional[Any] = None
    Script: Optional[Any] = None
    EquipScript: Optional[Any] = None
    UnEquipScript: Optional[Any] = None
