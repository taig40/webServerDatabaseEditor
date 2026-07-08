from pydantic import BaseModel, ConfigDict
from typing import Optional, Union, List, Dict, Any

class LevelAmount(BaseModel):
    Level: int
    Amount: int

class LevelSize(BaseModel):
    Level: int
    Size: int

class LevelTime(BaseModel):
    Level: int
    Time: int

class LevelCount(BaseModel):
    Level: int
    Count: int

class LevelElement(BaseModel):
    Level: int
    Element: str

class LevelArea(BaseModel):
    Level: int
    Area: int

class LevelMax(BaseModel):
    Level: int
    Max: int

# Requires sub-structure
class RequiresItemCost(BaseModel):
    Item: str  # AegisName
    Amount: int
    Level: Optional[int] = None

class RequiresModel(BaseModel):
    model_config = ConfigDict(extra='allow')
    
    HpCost: Optional[Union[int, List[LevelAmount]]] = None
    SpCost: Optional[Union[int, List[LevelAmount]]] = None
    ApCost: Optional[Union[int, List[LevelAmount]]] = None
    HpRateCost: Optional[Union[int, List[LevelAmount]]] = None
    SpRateCost: Optional[Union[int, List[LevelAmount]]] = None
    ApRateCost: Optional[Union[int, List[LevelAmount]]] = None
    MaxHpTrigger: Optional[Union[int, List[LevelAmount]]] = None
    ZenyCost: Optional[Union[int, List[LevelAmount]]] = None
    Weapon: Optional[Dict[str, bool]] = None
    Ammo: Optional[Dict[str, bool]] = None
    AmmoAmount: Optional[Union[int, List[LevelAmount]]] = None
    State: Optional[str] = None
    Status: Optional[str] = None
    SpiritSphereCost: Optional[Union[int, List[LevelAmount]]] = None
    ItemCost: Optional[List[RequiresItemCost]] = None
    Equipment: Optional[str] = None

# Consumes sub-structure
class ConsumableItem(BaseModel):
    Item: Union[str, int]
    Amount: int
    Level: Optional[int] = None

class ConsumesModel(BaseModel):
    model_config = ConfigDict(extra='allow')
    
    Item: Optional[List[ConsumableItem]] = None

# Top level Skill Model
class SkillModel(BaseModel):
    model_config = ConfigDict(extra='allow')
    
    Id: int
    Name: str
    Description: Optional[str] = None
    MaxLevel: int = 1
    Type: Optional[str] = None
    TargetType: Optional[str] = None
    DamageFlags: Optional[Dict[str, bool]] = None
    Flags: Optional[Dict[str, bool]] = None
    Range: Optional[Union[int, List[LevelSize]]] = None
    Hit: Optional[str] = None
    HitCount: Optional[Union[int, List[LevelCount]]] = None
    Element: Optional[Union[str, List[LevelElement]]] = None
    SplashArea: Optional[Union[int, List[LevelArea]]] = None
    ActiveInstance: Optional[Union[int, List[LevelMax]]] = None
    Knockback: Optional[Union[int, List[LevelAmount]]] = None
    GiveAp: Optional[Union[int, List[LevelAmount]]] = None
    CastCancel: Optional[bool] = None
    CastDefenseReduction: Optional[int] = None
    CastTime: Optional[Union[int, List[LevelTime]]] = None
    FixedCastTime: Optional[Union[int, List[LevelTime]]] = None
    AfterCastActDelay: Optional[Union[int, List[LevelTime]]] = None
    Cooldown: Optional[Union[int, List[LevelTime]]] = None
    Duration1: Optional[Union[int, List[LevelTime]]] = None
    Duration2: Optional[Union[int, List[LevelTime]]] = None
    Requires: Optional[RequiresModel] = None
    Consumes: Optional[ConsumesModel] = None
