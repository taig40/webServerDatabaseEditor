from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.services.mob_parser import mob_db
from app.services.mob_skill_parser import mob_skill_db
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
    Modes: Optional[Dict[str, Any]] = None
    MobSkills: Optional[List[Dict[str, Any]]] = None
    Drops: Optional[List[Dict[str, Any]]] = None
    MvpDrops: Optional[List[Dict[str, Any]]] = None

@router.get("/status")
async def get_status():
    return {
        "is_loading": mob_db.is_loading,
        "message": mob_db.loading_status,
        "mobs_loaded": mob_db.mobs_loaded
    }

RATHENA_MOB_MODES = {
    "CanMove": 0x0000001,
    "Looter": 0x0000002,
    "Aggressive": 0x0000004,
    "Assist": 0x0000008,
    "CastSensorIdle": 0x0000010,
    "NoRandomWalk": 0x0000020,
    "NoCast": 0x0000040,
    "CanAttack": 0x0000080,
    "CastSensorChase": 0x0000200,
    "ChangeChase": 0x0000400,
    "Angry": 0x0000800,
    "ChangeTargetMelee": 0x0001000,
    "ChangeTargetChase": 0x0002000,
    "TargetWeak": 0x0004000,
    "RandomTarget": 0x0008000,
    "IgnoreMelee": 0x0010000,
    "IgnoreMagic": 0x0020000,
    "IgnoreRanged": 0x0040000,
    "Mvp": 0x0080000,
    "IgnoreMisc": 0x0100000,
    "KnockBackImmune": 0x0200000,
    "TeleportBlock": 0x0400000,
    "FixedItemDrop": 0x1000000,
    "Detector": 0x2000000,
    "StatusImmune": 0x4000000,
    "SkillImmune": 0x8000000,
}

def parse_mob_modes(modes_val) -> dict:
    clean_modes = {}
    if isinstance(modes_val, int):
        for k, mask in RATHENA_MOB_MODES.items():
            clean_modes[k] = bool(modes_val & mask)
        return clean_modes
    elif isinstance(modes_val, str):
        val_str = modes_val.strip()
        if val_str.startswith("0x") or val_str.startswith("0X"):
            try:
                num = int(val_str, 16)
                for k, mask in RATHENA_MOB_MODES.items():
                    clean_modes[k] = bool(num & mask)
                return clean_modes
            except ValueError:
                pass
        elif val_str.isdigit():
            try:
                num = int(val_str, 10)
                for k, mask in RATHENA_MOB_MODES.items():
                    clean_modes[k] = bool(num & mask)
                return clean_modes
            except ValueError:
                pass

    if isinstance(modes_val, dict):
        lower_modes = {str(k).lower(): bool(v) for k, v in modes_val.items()}
        for k in RATHENA_MOB_MODES.keys():
            val = modes_val.get(k, lower_modes.get(k.lower(), False))
            clean_modes[k] = bool(val)
        for k, v in modes_val.items():
            if k not in clean_modes:
                clean_modes[str(k)] = bool(v)
    else:
        for k in RATHENA_MOB_MODES.keys():
            clean_modes[k] = False
    return clean_modes

def encode_mob_modes(modes_dict) -> dict:
    if not isinstance(modes_dict, dict):
        return {}
    encoded = {}
    lower_map = {str(k).lower(): bool(v) for k, v in modes_dict.items()}
    for key in RATHENA_MOB_MODES.keys():
        val = modes_dict.get(key, lower_map.get(key.lower(), False))
        if bool(val):
            encoded[key] = True
    for k, v in modes_dict.items():
        if k not in RATHENA_MOB_MODES and bool(v):
            encoded[k] = True
    return encoded

def _normalize_mob_entry(mob: dict) -> dict:
    result = dict(mob)
    mob_id = result.get("Id")
    ai_val = result.get("Ai")
    if ai_val is not None:
        ai_str = str(ai_val).strip()
        if ai_str.isdigit() and len(ai_str) == 1:
            ai_str = "0" + ai_str
        result["Ai"] = ai_str
    else:
        result["Ai"] = "06"
    result["Modes"] = parse_mob_modes(result.get("Modes"))
    if mob_id is not None:
        result["MobSkills"] = mob_skill_db.get_by_mob(mob_id)
    else:
        result["MobSkills"] = []
    return result

@router.get("/")
async def get_mobs(
    page: int = Query(1, ge=1, description="Página atual (1-based)"),
    limit: int = Query(50, ge=1, le=5000, description="Número de monstros a retornar"),
    search: str = Query("", description="Termo de busca pelo ID, Nome ou AegisName"),
    source: str = Query("", description="Filtro de origem: rathena ou custom"),
    skip: Optional[int] = Query(None, description="Opcional retrocompatibilidade com skip")
):
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
        
    paginated_mobs_raw, total_count = mob_db.search_mobs(
        page=page, limit=limit, search=search, source=source, skip=skip
    )
    paginated_mobs = [_normalize_mob_entry(m) for m in paginated_mobs_raw]
    
    effective_skip = skip if skip is not None else (page - 1) * limit
    
    return {
        "total": total_count,
        "total_count": total_count,
        "page": page,
        "limit": limit,
        "skip": effective_skip,
        "has_more": (effective_skip + len(paginated_mobs)) < total_count,
        "mobs": paginated_mobs
    }

@router.get("/{mob_id}")
async def get_mob(mob_id: int):
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
        
    if mob_id not in mob_db.mob_index:
        raise HTTPException(status_code=404, detail="ERROR_MOB_NOT_FOUND")
        
    filepath = mob_db.mob_index[mob_id]
    data = mob_db.db_cache.get(filepath)
    if data and 'Body' in data:
        for mob in data['Body']:
            if mob.get('Id') == mob_id:
                return _normalize_mob_entry(mob)
                
    raise HTTPException(status_code=404, detail="ERROR_MOB_NOT_FOUND")

@router.put("/{mob_id}")
async def update_mob(
    mob_id: int,
    mob_data: MobUpdate,
    save_mode: str = Query("import", description="'import' para db/import/ ou 'overwrite' para sobrescrever o arquivo original")
):
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
        
    updated_dict = mob_data.model_dump(exclude_unset=True)
    
    if "Id" in updated_dict:
        del updated_dict["Id"]

    mob_skills = updated_dict.pop("MobSkills", None)
    if "Ai" in updated_dict and updated_dict["Ai"] is not None:
        ai_str = str(updated_dict["Ai"]).strip()
        if ai_str.isdigit() and len(ai_str) == 1:
            ai_str = "0" + ai_str
        updated_dict["Ai"] = ai_str
    if "Modes" in updated_dict and isinstance(updated_dict["Modes"], dict):
        updated_dict["Modes"] = encode_mob_modes(updated_dict["Modes"])
        
    updated_mob = mob_db.update_mob(mob_id, updated_dict, save_mode=save_mode)
    if not updated_mob:
        raise HTTPException(status_code=404, detail="ERROR_MOB_NOT_FOUND")

    if mob_skills is not None and isinstance(mob_skills, list):
        dummy_name = updated_mob.get("AegisName") or updated_mob.get("Name") or str(mob_id)
        mob_skill_db.sync_mob_skills(mob_id, str(dummy_name), mob_skills)
        
    return _normalize_mob_entry(updated_mob)

@router.post("/")
async def create_mob(mob_data: dict):
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
        
    mob_id = mob_data.get("Id")
    if not mob_id:
        raise HTTPException(status_code=400, detail="ERROR_ID_REQUIRED")
        
    if mob_id in mob_db.mob_index:
        raise HTTPException(status_code=409, detail="ERROR_DUPLICATE_ID")
        
    if "Ai" in mob_data and mob_data["Ai"] is not None:
        ai_str = str(mob_data["Ai"]).strip()
        if ai_str.isdigit() and len(ai_str) == 1:
            ai_str = "0" + ai_str
        mob_data["Ai"] = ai_str
    if "Modes" in mob_data and isinstance(mob_data["Modes"], dict):
        mob_data["Modes"] = encode_mob_modes(mob_data["Modes"])
    try:
        new_mob = mob_db.add_custom_mob(mob_data)
        return _normalize_mob_entry(new_mob)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{mob_id}/animation")
async def get_mob_animation(mob_id: int):
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
        
    if mob_id not in mob_db.mob_index:
        raise HTTPException(status_code=404, detail="ERROR_MOB_NOT_FOUND")
        
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
        raise HTTPException(status_code=404, detail="ERROR_NOT_FOUND")
        
    sprite_name = get_sprite_name_for_mob(mob_id, aegis_name)
    if not sprite_name:
        raise HTTPException(status_code=404, detail="ERROR_NOT_FOUND")
        
    anim_data = get_mob_animation_data(sprite_name)
    if not anim_data:
        raise HTTPException(status_code=404, detail="ERROR_NOT_FOUND")
        
    return anim_data


@router.get("/{mob_id}/skills")
async def get_mob_skills(mob_id: int):
    """Retorna as skills usadas por um monstro específico."""
    from app.services.mob_skill_parser import mob_skill_db
    if mob_skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    skills = mob_skill_db.get_by_mob(mob_id)
    return {"mob_id": mob_id, "skills": skills}


from fastapi import UploadFile, File as FastAPIFile

def _get_mob_aegis(mob_id: int) -> str | None:
    """Helper: retorna o AegisName de um monstro pelo ID."""
    if mob_id not in mob_db.mob_index:
        return None
    filepath = mob_db.mob_index[mob_id]
    data = mob_db.db_cache.get(filepath)
    if data and 'Body' in data:
        for mob in data['Body']:
            if mob.get('Id') == mob_id:
                return mob.get('AegisName')
    return None


@router.post("/{mob_id}/sprite/upload")
async def upload_mob_sprite_spr_act(
    mob_id: int,
    spr_file: UploadFile = FastAPIFile(..., description="Arquivo .spr do Ragnarok Online"),
    act_file: UploadFile = FastAPIFile(..., description="Arquivo .act do Ragnarok Online"),
):
    """
    Recebe um par de arquivos .spr + .act nativos do RO e os salva no override path do GRF
    com o nome correto (AegisName do monstro), de forma que o sprite_parser os encontre
    automaticamente no próximo request de animação — exatamente como o Tokeiburu faz.
    """
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    if mob_id not in mob_db.mob_index:
        raise HTTPException(status_code=404, detail="ERROR_MOB_NOT_FOUND")

    # Validate extensions
    spr_filename = (spr_file.filename or "").lower()
    act_filename = (act_file.filename or "").lower()
    if not spr_filename.endswith(".spr"):
        raise HTTPException(status_code=400, detail="ERROR_INVALID_FILE_TYPE")
    if not act_filename.endswith(".act"):
        raise HTTPException(status_code=400, detail="ERROR_INVALID_FILE_TYPE")

    aegis_name = _get_mob_aegis(mob_id)
    if not aegis_name:
        raise HTTPException(status_code=404, detail="ERROR_NOT_FOUND")

    from app.services.grf_reader import grf_reader

    spr_bytes = await spr_file.read()
    act_bytes = await act_file.read()

    try:
        spr_path = grf_reader.save_mob_spr(aegis_name, spr_bytes)
        act_path = grf_reader.save_mob_act(aegis_name, act_bytes)
        return {
            "status": "ok",
            "aegis_name": aegis_name,
            "spr_saved": spr_path,
            "act_saved": act_path,
        }
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar sprite: {e}")
