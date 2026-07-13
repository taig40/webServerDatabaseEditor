from pydantic import BaseModel, ConfigDict
from typing import Optional

class VisualEquipmentModel(BaseModel):
    view_id: int
    identity: str  # The constant, e.g., ACCESSORY_MyVisual
    name: str      # The sprite suffix, e.g., _MyVisual
    
    model_config = ConfigDict(extra='ignore')

class VisualEquipmentModelUpdate(BaseModel):
    identity: Optional[str] = None
    name: Optional[str] = None
    
    model_config = ConfigDict(extra='ignore')
