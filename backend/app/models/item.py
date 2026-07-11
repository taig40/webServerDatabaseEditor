"""
Modelos Pydantic V2 com tipagem estrita para o item_db.yml do rAthena.

A classe base `rAthenaBaseModel` usa `extra='ignore'` para blindar o sistema
contra chaves inesperadas enviadas pelo Front-end, prevenindo crashes no
map-server por YAML inválido.

Na serialização para YAML, use sempre `model.model_dump(exclude_none=True)`
para omitir campos não preenchidos e manter o output limpo.
"""

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Literal, Union


# ─── Base ─────────────────────────────────────────────────────────────────────

class rAthenaBaseModel(BaseModel):
    """
    Classe base que blinda o sistema contra chaves enviadas por engano pelo
    Front-end. Qualquer campo não declarado é silenciosamente descartado.
    """
    model_config = ConfigDict(extra='ignore')


# ─── Sub-modelos ──────────────────────────────────────────────────────────────

class ItemFlags(rAthenaBaseModel):
    BuyingStore:   Optional[bool] = None
    DeadBranch:    Optional[bool] = None
    Container:     Optional[bool] = None
    UniqueId:      Optional[bool] = None
    BindOnEquip:   Optional[bool] = None
    DropAnnounce:  Optional[bool] = None
    NoConsume:     Optional[bool] = None
    # DropEffect aceita bool OU string com o nome do efeito visual
    # Exemplos no rAthena: true, false, 'CLIENT', 'DYING', etc.
    DropEffect: Optional[Union[bool, str]] = None


class ItemDelay(rAthenaBaseModel):
    Duration: Optional[int] = None
    Status:   Optional[str] = None


class ItemStack(rAthenaBaseModel):
    Amount:       Optional[int]  = None
    Inventory:    Optional[bool] = None
    Cart:         Optional[bool] = None
    Storage:      Optional[bool] = None
    GuildStorage: Optional[bool] = None


class ItemNoUse(rAthenaBaseModel):
    Override: Optional[int]  = None
    Sitting:  Optional[bool] = None


class ItemTrade(rAthenaBaseModel):
    Override:        Optional[int]  = None
    NoDrop:          Optional[bool] = None
    NoTrade:         Optional[bool] = None
    TradePartner:    Optional[bool] = None
    NoSell:          Optional[bool] = None
    NoCart:          Optional[bool] = None
    NoStorage:       Optional[bool] = None
    NoGuildStorage:  Optional[bool] = None
    NoMail:          Optional[bool] = None
    NoAuction:       Optional[bool] = None


class ItemJobs(rAthenaBaseModel):
    All:            Optional[bool] = None
    Acolyte:        Optional[bool] = None
    Alchemist:      Optional[bool] = None
    Archer:         Optional[bool] = None
    Assassin:       Optional[bool] = None
    BardDancer:     Optional[bool] = None
    Blacksmith:     Optional[bool] = None
    Crusader:       Optional[bool] = None
    Gunslinger:     Optional[bool] = None
    Hunter:         Optional[bool] = None
    KagerouOboro:   Optional[bool] = None
    Knight:         Optional[bool] = None
    Mage:           Optional[bool] = None
    Merchant:       Optional[bool] = None
    Monk:           Optional[bool] = None
    Ninja:          Optional[bool] = None
    Novice:         Optional[bool] = None
    Priest:         Optional[bool] = None
    Rebellion:      Optional[bool] = None
    Rogue:          Optional[bool] = None
    Sage:           Optional[bool] = None
    SoulLinker:     Optional[bool] = None
    StarGladiator:  Optional[bool] = None
    Summoner:       Optional[bool] = None
    SuperNovice:    Optional[bool] = None
    Swordman:       Optional[bool] = None
    Taekwon:        Optional[bool] = None
    Thief:          Optional[bool] = None
    Wizard:         Optional[bool] = None


class ItemClasses(rAthenaBaseModel):
    All:        Optional[bool] = None
    Normal:     Optional[bool] = None
    Upper:      Optional[bool] = None
    Baby:       Optional[bool] = None
    Third:      Optional[bool] = None
    Third_Upper: Optional[bool] = None
    Third_Baby: Optional[bool] = None
    Fourth:     Optional[bool] = None
    All_Upper:  Optional[bool] = None
    All_Baby:   Optional[bool] = None
    All_Third:  Optional[bool] = None


class ItemLocations(rAthenaBaseModel):
    Head_Top:               Optional[bool] = None
    Head_Mid:               Optional[bool] = None
    Head_Low:               Optional[bool] = None
    Armor:                  Optional[bool] = None
    Right_Hand:             Optional[bool] = None
    Left_Hand:              Optional[bool] = None
    Garment:                Optional[bool] = None
    Shoes:                  Optional[bool] = None
    Right_Accessory:        Optional[bool] = None
    Left_Accessory:         Optional[bool] = None
    Costume_Head_Top:       Optional[bool] = None
    Costume_Head_Mid:       Optional[bool] = None
    Costume_Head_Low:       Optional[bool] = None
    Costume_Garment:        Optional[bool] = None
    Ammo:                   Optional[bool] = None
    Shadow_Armor:           Optional[bool] = None
    Shadow_Weapon:          Optional[bool] = None
    Shadow_Shield:          Optional[bool] = None
    Shadow_Shoes:           Optional[bool] = None
    Shadow_Right_Accessory: Optional[bool] = None
    Shadow_Left_Accessory:  Optional[bool] = None
    Both_Hand:              Optional[bool] = None
    Both_Accessory:         Optional[bool] = None


# ─── Modelo Principal ─────────────────────────────────────────────────────────

class ItemDBModel(rAthenaBaseModel):
    """
    Representação estrita de um item do item_db.yml.
    Campos obrigatórios: Id, AegisName, Name.
    Todos os demais são opcionais e omitidos com exclude_none=True na exportação.
    """
    # ── Obrigatórios ──
    Id:        int
    AegisName: str
    Name:      str

    # ── Opcionais ──
    Type:          str = "Etc"
    SubType:       Optional[str] = None
    Buy:           Optional[int] = None
    Sell:          Optional[int] = None
    Weight:        Optional[int] = None
    Attack:        Optional[int] = None
    MagicAttack:   Optional[int] = None
    Defense:       int = 0
    Range:         Optional[int] = None
    Slots:         Optional[int] = None
    Jobs:          Optional[ItemJobs] = Field(default_factory=lambda: ItemJobs(All=True))
    Classes:       Optional[ItemClasses] = Field(default_factory=lambda: ItemClasses(All=True))
    Gender:        Literal['Female', 'Male', 'Both'] = "Both"
    Locations:     Optional[ItemLocations] = None
    WeaponLevel:   Optional[int] = None
    ArmorLevel:    int = 1
    EquipLevelMin: Optional[int] = None
    EquipLevelMax: Optional[int] = None
    Refineable:    bool = False
    Gradable:      Optional[bool] = None
    View:          Optional[int] = None
    AliasName:     Optional[str] = None
    Flags:         Optional[ItemFlags]  = None
    Delay:         Optional[ItemDelay]  = None
    Stack:         Optional[ItemStack]  = None
    NoUse:         Optional[ItemNoUse]  = None
    Trade:         Optional[ItemTrade]  = None
    Script:        Optional[str] = None
    EquipScript:   Optional[str] = None
    UnEquipScript: Optional[str] = None


# ─── Alias de retrocompatibilidade ────────────────────────────────────────────
# Mantido para não quebrar rotas que já importam ItemUpdate
ItemUpdate = ItemDBModel


# ─── Modelo de Atualização Parcial (PUT) ─────────────────────────────────────

class ItemUpdateModel(rAthenaBaseModel):
    """
    Variante de ItemDBModel para rotas PUT (update parcial).

    Todos os campos são opcionais: o front-end envia apenas os campos
    que foram alterados. Herda extra='ignore' da classe base.
    """
    # ── Antes obrigatórios, agora opcionais no update ──
    Id:        Optional[int] = None
    AegisName: Optional[str] = None
    Name:      Optional[str] = None

    # ── Mesmos campos opcionais do ItemDBModel ──
    Type:          Optional[str] = None
    SubType:       Optional[str] = None
    Buy:           Optional[int] = None
    Sell:          Optional[int] = None
    Weight:        Optional[int] = None
    Attack:        Optional[int] = None
    MagicAttack:   Optional[int] = None
    Defense:       Optional[int] = None
    Range:         Optional[int] = None
    Slots:         Optional[int] = None
    Jobs:          Optional[ItemJobs]      = None
    Classes:       Optional[ItemClasses]   = None
    Gender:        Optional[Literal['Female', 'Male', 'Both']] = None
    Locations:     Optional[ItemLocations] = None
    WeaponLevel:   Optional[int] = None
    EquipLevelMin: Optional[int] = None
    EquipLevelMax: Optional[int] = None
    Refineable:    Optional[bool] = None
    Gradable:      Optional[bool] = None
    View:          Optional[int] = None
    AliasName:     Optional[str] = None
    Flags:         Optional[ItemFlags]  = None
    Delay:         Optional[ItemDelay]  = None
    Stack:         Optional[ItemStack]  = None
    NoUse:         Optional[ItemNoUse]  = None
    Trade:         Optional[ItemTrade]  = None
    Script:        Optional[str] = None
    EquipScript:   Optional[str] = None
    UnEquipScript: Optional[str] = None
