"""
Modelos Pydantic V2 com tipagem estrita para o mob_db.yml do rAthena.

A classe base `rAthenaBaseModel` usa `extra='ignore'` para blindar o sistema
contra chaves inesperadas enviadas pelo Front-end, prevenindo crashes no
map-server por YAML inválido.

Na serialização para YAML, use sempre `model.model_dump(exclude_none=True)`
para omitir campos não preenchidos e manter o output limpo.
"""

from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Literal, Union


# ─── Base ─────────────────────────────────────────────────────────────────────

class rAthenaBaseModel(BaseModel):
    """
    Classe base que blinda o sistema contra chaves enviadas por engano pelo
    Front-end. Qualquer campo não declarado é silenciosamente descartado.
    """
    model_config = ConfigDict(extra='ignore')


# ─── Sub-modelos ──────────────────────────────────────────────────────────────

class MobRaceGroups(rAthenaBaseModel):
    Goblin:                Optional[bool] = None
    Kobold:                Optional[bool] = None
    Orc:                   Optional[bool] = None
    Golem:                 Optional[bool] = None
    Guardian:              Optional[bool] = None
    Ninja:                 Optional[bool] = None
    Gvg:                   Optional[bool] = None
    Battlefield:           Optional[bool] = None
    Treasure:              Optional[bool] = None
    Biolab:                Optional[bool] = None
    Manuk:                 Optional[bool] = None
    Splendide:             Optional[bool] = None
    Scaraba:               Optional[bool] = None
    Ogh_Atk_Def:           Optional[bool] = None
    Ogh_Hidden:            Optional[bool] = None
    Bio5_Swordman_Thief:   Optional[bool] = None
    Bio5_Acolyte_Merchant: Optional[bool] = None
    Bio5_Mage_Archer:      Optional[bool] = None
    Bio5_Mvp:              Optional[bool] = None
    Clocktower:            Optional[bool] = None
    Thanatos:              Optional[bool] = None
    Faceworm:              Optional[bool] = None
    Hearthunter:           Optional[bool] = None
    Rockridge:             Optional[bool] = None
    Werner_Lab:            Optional[bool] = None
    Temple_Demon:          Optional[bool] = None
    Illusion_Vampire:      Optional[bool] = None


class MobDrop(rAthenaBaseModel):
    Item:              Union[str, int]
    Rate:              int
    StealProtected:    Optional[bool] = None
    RandomOptionGroup: Optional[str]  = None
    Index:             Optional[int]  = None


class MobMvpDrop(rAthenaBaseModel):
    Item:              Union[str, int]
    Rate:              int
    RandomOptionGroup: Optional[str] = None
    Index:             Optional[int] = None


# ─── Modelo Principal ─────────────────────────────────────────────────────────

class MobDBModel(rAthenaBaseModel):
    """
    Representação estrita de um monstro do mob_db.yml.
    Campos obrigatórios: Id, SpriteName, Name.
    Todos os demais são opcionais e omitidos com exclude_none=True na exportação.

    Nota sobre Modes: é um Dict[str, bool] flexível porque os modos reconhecidos
    dependem da versão do rAthena (mob_db_mode_list.txt). Validação de chaves
    é feita na camada da API (encode_mob_modes).
    """
    # ── Obrigatórios ──
    Id:         int
    SpriteName: str
    Name:       str

    # ── Identidade ──
    JapaneseName: Optional[str] = None

    # ── Atributos base ──
    Level:   Optional[int] = None
    Hp:      Optional[int] = None
    Sp:      Optional[int] = None
    BaseExp: Optional[int] = None
    JobExp:  Optional[int] = None
    MvpExp:  Optional[int] = None

    # ── Combate ──
    Attack:          Optional[int] = None
    Attack2:         Optional[int] = None
    Defense:         Optional[int] = None
    MagicDefense:    Optional[int] = None
    Resistance:      Optional[int] = None
    MagicResistance: Optional[int] = None

    # ── Atributos (STATS) ──
    Str: Optional[int] = None
    Agi: Optional[int] = None
    Vit: Optional[int] = None
    Int: Optional[int] = None
    Dex: Optional[int] = None
    Luk: Optional[int] = None

    # ── Alcance ──
    AttackRange: Optional[int] = None
    SkillRange:  Optional[int] = None
    ChaseRange:  Optional[int] = None

    # ── Classificação ──
    Size:       Optional[Literal['Small', 'Medium', 'Large']] = None
    Race:       Optional[Literal[
        'Formless', 'Undead', 'Brute', 'Plant', 'Insect',
        'Fish', 'Demon', 'Demihuman', 'Angel', 'Dragon'
    ]] = None
    RaceGroups: Optional[MobRaceGroups] = None

    # ── Elemento ──
    Element:      Optional[Literal[
        'Neutral', 'Water', 'Earth', 'Fire', 'Wind',
        'Poison', 'Holy', 'Dark', 'Ghost', 'Undead'
    ]] = None
    ElementLevel: Optional[int] = None

    # ── Movimentação & Timing ──
    WalkSpeed:          Optional[int] = None
    AttackDelay:        Optional[int] = None
    AttackMotion:       Optional[int] = None
    ClientAttackMotion: Optional[int] = None
    DamageMotion:       Optional[int] = None
    DamageTaken:        Optional[int] = None

    # ── Agrupamento & IA ──
    GroupId: Optional[int] = None
    Title:   Optional[str] = None
    Ai:      Optional[str] = None
    Class:   Optional[str] = None

    # ── Modos de comportamento ──
    # Dict flexível — chaves validadas por encode_mob_modes na camada da API.
    Modes: Optional[Dict[str, bool]] = None

    # ── Drops ──
    MvpDrops: Optional[List[MobMvpDrop]] = None
    Drops:    Optional[List[MobDrop]]    = None



# ─── Modelo de Atualização Parcial (PUT) ─────────────────────────────────────

class MobDBModelUpdate(rAthenaBaseModel):
    """
    Variante de MobDBModel para rotas PUT (update parcial).

    Todos os campos são opcionais: o front-end envia apenas os campos
    que foram alterados. Herda extra='ignore' da classe base, descartando
    silenciosamente chaves sintéticas do React (ex: _source, MobSkills).
    """
    # ── Antes obrigatórios, agora opcionais no update ──
    Id:         Optional[int] = None
    SpriteName: Optional[str] = None
    AegisName:  Optional[str] = None
    Name:       Optional[str] = None

    # ── Identidade ──
    JapaneseName: Optional[str] = None

    # ── Atributos base ──
    Level:   Optional[int] = None
    Hp:      Optional[int] = None
    Sp:      Optional[int] = None
    BaseExp: Optional[int] = None
    JobExp:  Optional[int] = None
    MvpExp:  Optional[int] = None

    # ── Combate ──
    Attack:          Optional[int] = None
    Attack2:         Optional[int] = None
    Defense:         Optional[int] = None
    MagicDefense:    Optional[int] = None
    Resistance:      Optional[int] = None
    MagicResistance: Optional[int] = None

    # ── Atributos (STATS) ──
    Str: Optional[int] = None
    Agi: Optional[int] = None
    Vit: Optional[int] = None
    Int: Optional[int] = None
    Dex: Optional[int] = None
    Luk: Optional[int] = None

    # ── Alcance ──
    AttackRange: Optional[int] = None
    SkillRange:  Optional[int] = None
    ChaseRange:  Optional[int] = None

    # ── Classificação ──
    Size:       Optional[Literal['Small', 'Medium', 'Large']] = None
    Race:       Optional[Literal[
        'Formless', 'Undead', 'Brute', 'Plant', 'Insect',
        'Fish', 'Demon', 'Demihuman', 'Angel', 'Dragon'
    ]] = None
    RaceGroups: Optional[MobRaceGroups] = None

    # ── Elemento ──
    Element:      Optional[Literal[
        'Neutral', 'Water', 'Earth', 'Fire', 'Wind',
        'Poison', 'Holy', 'Dark', 'Ghost', 'Undead'
    ]] = None
    ElementLevel: Optional[int] = None

    # ── Movimentação & Timing ──
    WalkSpeed:          Optional[int] = None
    AttackDelay:        Optional[int] = None
    AttackMotion:       Optional[int] = None
    ClientAttackMotion: Optional[int] = None
    DamageMotion:       Optional[int] = None
    DamageTaken:        Optional[int] = None

    # ── Agrupamento & IA ──
    GroupId: Optional[int] = None
    Title:   Optional[str] = None
    Ai:      Optional[str] = None
    Class:   Optional[str] = None

    # ── Modos de comportamento ──
    Modes: Optional[Dict[str, bool]] = None

    # ── Drops ──
    MvpDrops: Optional[List[MobMvpDrop]] = None
    Drops:    Optional[List[MobDrop]]    = None


# ─── Aliases de retrocompatibilidade ──────────────────────────────────────────
# Mantidos para não quebrar código que já importava esses nomes
MobUpdate = MobDBModel
