from pydantic import Field
from typing import Optional, List, Union
from app.models.item import rAthenaBaseModel

class ComboEntry(rAthenaBaseModel):
    """
    Representa uma regra de combo única.
    Obrigatório conter a chave 'Combo' com um Array de pelo menos 2 itens (AegisName ou ID).
    """
    Combo: List[Union[str, int]] = Field(..., min_length=2)

class ItemComboDBModel(rAthenaBaseModel):
    """
    Representa o bloco principal de um item dentro do item_combos.yml.
    """
    Combos: List[ComboEntry]
    Clear: Optional[bool] = None
    Script: Optional[str] = None
