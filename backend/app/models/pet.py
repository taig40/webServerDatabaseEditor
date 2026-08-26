"""
Modelos Pydantic V2 com tipagem estrita para o pet_db.yml do rAthena.

A classe base `rAthenaBaseModel` usa `extra='ignore'` para blindar o sistema
contra chaves inesperadas enviadas pelo Front-end.
"""

from pydantic import BaseModel, ConfigDict
from typing import Optional, Union, List, Any

# ─── Base ─────────────────────────────────────────────────────────────────────

class rAthenaBaseModel(BaseModel):
    model_config = ConfigDict(extra='ignore')

# ─── Sub-modelos ──────────────────────────────────────────────────────────────

class ItemRequirement(rAthenaBaseModel):
    Item: Union[str, int]
    Amount: int

class Evolution(rAthenaBaseModel):
    Target: Union[str, int]
    ItemRequirements: Optional[List[ItemRequirement]] = None

# ─── Modelos Principais ───────────────────────────────────────────────────────

class PetCreateRequest(rAthenaBaseModel):
    """DTO para a criação (POST) de um novo Pet."""
    Mob: Union[str, int]
    TameItem: Optional[Union[str, int]] = None
    EggItem: Optional[Union[str, int]] = None
    EquipItem: Optional[Union[str, int]] = None
    FoodItem: Optional[Union[str, int]] = None
    
    Fullness: int = 100
    HungryDelay: int = 60
    HungerIncrease: int = 20
    IntimacyStart: int = 250
    IntimacyFed: int = 50
    IntimacyOverfed: int = -100
    IntimacyHungry: int = -50
    IntimacyOwnerDie: int = -20
    
    CaptureRate: int = 10000
    SpecialPerformance: bool = False
    AttackRate: int = 10000
    RetaliateRate: int = 10000
    ChangeTargetRate: int = 10000
    
    Script: Optional[str] = None
    SupportScript: Optional[str] = None
    Evolutions: Optional[List[Evolution]] = None

class PetUpdateRequest(rAthenaBaseModel):
    """DTO para a atualização parcial (PUT) de um Pet."""
    Mob: Optional[Union[str, int]] = None
    TameItem: Optional[Union[str, int]] = None
    EggItem: Optional[Union[str, int]] = None
    EquipItem: Optional[Union[str, int]] = None
    FoodItem: Optional[Union[str, int]] = None
    
    Fullness: Optional[int] = None
    HungryDelay: Optional[int] = None
    HungerIncrease: Optional[int] = None
    IntimacyStart: Optional[int] = None
    IntimacyFed: Optional[int] = None
    IntimacyOverfed: Optional[int] = None
    IntimacyHungry: Optional[int] = None
    IntimacyOwnerDie: Optional[int] = None
    
    CaptureRate: Optional[int] = None
    SpecialPerformance: Optional[bool] = None
    AttackRate: Optional[int] = None
    RetaliateRate: Optional[int] = None
    ChangeTargetRate: Optional[int] = None
    
    Script: Optional[str] = None
    SupportScript: Optional[str] = None
    Evolutions: Optional[List[Evolution]] = None
