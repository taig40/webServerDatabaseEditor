from pydantic import Field
from typing import Optional, List, Union
from app.models.item import rAthenaBaseModel

class QuestTarget(rAthenaBaseModel):
    Mob: Union[int, str]
    Count: int
    Race: Optional[str] = None
    Size: Optional[str] = None
    Element: Optional[str] = None
    MinLevel: Optional[int] = None
    MaxLevel: Optional[int] = None
    Location: Optional[str] = None
    MapName: Optional[str] = None

class QuestDrop(rAthenaBaseModel):
    Mob: Union[int, str]
    Item: Union[int, str]
    Count: Optional[int] = None
    Rate: int

class QuestDBModel(rAthenaBaseModel):
    Id: int
    Title: str
    TimeLimit: Optional[Union[int, str]] = Field(default=None)
    Targets: Optional[List[QuestTarget]] = None
    Drops: Optional[List[QuestDrop]] = None

class QuestUpdateModel(rAthenaBaseModel):
    Id: Optional[int] = None
    Title: Optional[str] = None
    TimeLimit: Optional[Union[int, str]] = None
    Targets: Optional[List[QuestTarget]] = None
    Drops: Optional[List[QuestDrop]] = None
