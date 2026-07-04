from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.services.mob_parser import mob_db
from app.services.sprite_parser import get_mob_animation_data, get_sprite_name_for_mob

router = APIRouter()

# Schema for updating a Mob
class MobUpdate(BaseModel):
    AegisName: Optional[str] = None
    Name: Optional[str] = None
    JapaneseName: Optional[str] = None
    Level: Optional[int] = None
    Hp: Optional[int] = None
    Sp: Optional[int] = None
    BaseExp: Optional[int] = None
    JobExp: Optional[int] = None
    MvpExp: Optional[int] = None
    Attack: Optional[int] = None
    Attack2: Optional[int] = None
    Defense: Optional[int] = None
    MagicDefense: Optional[int] = None
    Resistance: Optional[int] = None
    MagicResistance: Optional[int] = None
    Str: Optional[int] = None
    Agi: Optional[int] = None
    Vit: Optional[int] = None
    Int: Optional[int] = None
    Dex: Optional[int] = None
    Luk: Optional[int] = None
    AttackRange: Optional[int] = None
    SkillRange: Optional[int] = None
    ChaseRange: Optional[int] = None
    Size: Optional[str] = None
    Race: Optional[str] = None
    Element: Optional[str] = None
    ElementLevel: Optional[int] = None
    WalkSpeed: Optional[int] = None
    AttackDelay: Optional[int] = None
    AttackMotion: Optional[int] = None
    DamageMotion: Optional[int] = None
    DamageTaken: Optional[int] = None
    GroupId: Optional[int] = None
    Title: Optional[str] = None
    Ai: Optional[str] = None
    Class: Optional[str] = None
    Modes: Optional[Dict[str, bool]] = None
    Drops: Optional[List[Dict[str, Any]]] = None
    MvpDrops: Optional[List[Dict[str, Any]]] = None

@router.get("/status")
async def get_status():
    return {
        "is_loading": mob_db.is_loading,
        "message": mob_db.loading_status,
        "mobs_loaded": mob_db.mobs_loaded
    }

@router.get("/")
async def get_mobs(
    skip: int = Query(0, description="Número de monstros a pular"),
    limit: int = Query(50, description="Número de monstros a retornar")
):
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados de monstros ainda está carregando.")
        
    mobs = mob_db.get_mobs()
    total = len(mobs)
    paginated_mobs = mobs[skip: skip + limit]
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "mobs": paginated_mobs
    }

@router.get("/{mob_id}")
async def get_mob(mob_id: int):
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados de monstros ainda está carregando.")
        
    if mob_id not in mob_db.mob_index:
        raise HTTPException(status_code=404, detail=f"Monstro com ID {mob_id} não encontrado.")
        
    filepath = mob_db.mob_index[mob_id]
    data = mob_db.db_cache.get(filepath)
    if data and 'Body' in data:
        for mob in data['Body']:
            if mob.get('Id') == mob_id:
                return mob
                
    raise HTTPException(status_code=404, detail=f"Monstro com ID {mob_id} não encontrado.")

@router.put("/{mob_id}")
async def update_mob(mob_id: int, mob_data: MobUpdate):
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados de monstros ainda está carregando.")
        
    updated_dict = mob_data.model_dump(exclude_unset=True)
    
    if "Id" in updated_dict:
        del updated_dict["Id"]
        
    updated_mob = mob_db.update_mob(mob_id, updated_dict)
    if not updated_mob:
        raise HTTPException(status_code=404, detail=f"Monstro com ID {mob_id} não encontrado.")
        
    return updated_mob

@router.post("/")
async def create_mob(mob_data: dict):
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados de monstros ainda está carregando.")
        
    mob_id = mob_data.get("Id")
    if not mob_id:
        raise HTTPException(status_code=400, detail="Id é obrigatório")
        
    if mob_id in mob_db.mob_index:
        raise HTTPException(status_code=409, detail=f"Um monstro com ID {mob_id} já existe.")
        
    try:
        new_mob = mob_db.add_custom_mob(mob_data)
        return new_mob
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{mob_id}/animation")
async def get_mob_animation(mob_id: int):
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados de monstros ainda está carregando.")
        
    if mob_id not in mob_db.mob_index:
        raise HTTPException(status_code=404, detail=f"Monstro com ID {mob_id} não encontrado.")
        
    # Get mob AegisName
    filepath = mob_db.mob_index[mob_id]
    data = mob_db.db_cache.get(filepath)
    aegis_name = None
    if data and 'Body' in data:
        for mob in data['Body']:
            if mob.get('Id') == mob_id:
                aegis_name = mob.get('AegisName')
                break
                
    if not aegis_name:
        raise HTTPException(status_code=404, detail="Nome Aegis do monstro não encontrado.")
        
    sprite_name = get_sprite_name_for_mob(mob_id, aegis_name)
    if not sprite_name:
        raise HTTPException(status_code=404, detail="Nome de sprite não encontrado para este monstro.")
        
    anim_data = get_mob_animation_data(sprite_name)
    if not anim_data:
        raise HTTPException(status_code=404, detail=f"Animação não encontrada para o sprite '{sprite_name}' do monstro '{aegis_name}'.")
        
    return anim_data
