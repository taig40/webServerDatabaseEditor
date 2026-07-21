from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
from app.services.mob_parser import mob_db
from app.services.mob_skill_parser import mob_skill_db
from app.services.sprite_parser import get_mob_animation_data, get_sprite_name_for_mob
from app.models.mob import MobDBModel, MobDBModelUpdate

router = APIRouter()

@router.get("/status")
async def get_status():
    """Returns the current background loading status for the mob database.

    Returns:
        dict: Keys ``is_loading``, ``message``, and ``mobs_loaded``.
    """
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
    """Normalizes a rAthena Modes field to a canonical bool-keyed dict.

    Accepts integer bitmasks, hexadecimal strings, decimal strings, or the
    already-expanded dict format. Unknown integer/string formats default to all
    modes ``False``.

    Args:
        modes_val: Raw value from the parsed YAML (``int``, ``str``, or ``dict``).

    Returns:
        dict: Mapping of each ``RATHENA_MOB_MODES`` key to a boolean.
    """
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
    """Converts a bool-keyed modes dict back to rAthena YAML format (only ``True`` keys kept).

    Args:
        modes_dict: Mapping of mode name to boolean value.

    Returns:
        dict: Sparse dict containing only the modes that are active (``True``).
    """
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
    """Enriches a raw mob dict with normalized ``Ai``, ``Modes``, ``MobSkills``, and ``is_custom``.

    Args:
        mob: Raw mob entry from ``mob_db.db_cache``.

    Returns:
        dict: Enriched mob entry ready for API serialization.
    """
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
    
    result["is_custom"] = (mob.get("_source") == "custom")
    return result

@router.get("/references")
async def get_mob_references():
    """Returns a lightweight list of all monsters for the ReferencePicker / Smart Autocomplete.

    Each entry contains only ``Id``, ``AegisName``, ``Name``, and ``is_custom``.

    Returns:
        dict: A ``{"mobs": [...]}`` payload for the frontend autocomplete widget.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    mobs = mob_db.get_mobs()
    result = []
    for mob in mobs:
        mob_id = mob.get("Id")
        if mob_id is None:
            continue
        result.append({
            "Id": mob_id,
            "AegisName": mob.get("AegisName", f"MOB_{mob_id}"),
            "Name": mob.get("Name", mob.get("AegisName", f"MOB_{mob_id}")),
            "is_custom": (mob.get("_source") == "custom")
        })
    return {"mobs": result}

@router.get("/")
async def get_mobs(
    page: int = Query(1, ge=1, description="Página atual (1-based)"),
    limit: int = Query(50, ge=1, description="Número de monstros a retornar"),
    search: str = Query("", description="Termo de busca pelo ID, Nome ou AegisName"),
    source: str = Query("", description="Filtro de origem: rathena ou custom"),
    skip: Optional[int] = Query(None, description="Opcional retrocompatibilidade com skip")
):
    """Returns a paginated, normalized list of monsters from the in-memory YAML database.

    Args:
        page: 1-based page index.
        limit: Items per page (capped at 100).
        search: Free-text search against ID, Name, or AegisName.
        source: Origin filter — ``"rathena"`` or ``"custom"``.
        skip: Optional raw offset for backwards-compatible pagination.

    Returns:
        dict: Paginated response with ``total``, ``page``, ``limit``, ``has_more``, and ``mobs``.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    limit = min(max(1, limit), 100)
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
    """Returns the full, normalized mob entry for detail/edit view.

    Args:
        mob_id: Numeric rAthena mob ID.

    Returns:
        dict: Normalized mob object (``Ai``, ``Modes`` expanded, ``MobSkills`` attached).

    Raises:
        HTTPException: 503 if loading; 404 if not found.
    """
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
    mob_data: MobDBModelUpdate,
    save_mode: str = Query("import", description="'import' para db/import/ ou 'overwrite' para sobrescrever o arquivo original")
):
    """Updates a mob in the YAML database and persists it to disk.

    Strips synthetic frontend keys (``_source``, ``MobSkills``) from the payload before
    saving.  ``MobSkills`` are managed separately by ``mob_skill_db``.  ``Modes`` are
    re-encoded to a sparse dict and ``Ai`` is zero-padded to two digits for rAthena
    compatibility.

    Args:
        mob_id: Numeric rAthena mob ID.
        mob_data: Partial mob payload.
        save_mode: ``"import"`` copies to ``db/import/``; ``"overwrite"`` patches in place.

    Returns:
        dict: The updated, normalized mob object.

    Raises:
        HTTPException: 503 if loading; 404 if not found.
    """
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    updated_dict = mob_data.model_dump(exclude_none=True, exclude_defaults=True)
    updated_dict.pop("Id", None)

    # MobSkills is managed by mob_skill_db (separate file — do not persist here)
    mob_skills = updated_dict.pop("MobSkills", None)

    if "Ai" in updated_dict and updated_dict["Ai"] is not None:
        ai_str = str(updated_dict["Ai"]).strip()
        if ai_str.isdigit() and len(ai_str) == 1:
            ai_str = "0" + ai_str
        updated_dict["Ai"] = ai_str

    if "Modes" in updated_dict and isinstance(updated_dict["Modes"], dict):
        updated_dict["Modes"] = encode_mob_modes(updated_dict["Modes"])

    # Serialize Drops/MvpDrops sub-models back to plain dicts, stripping None values
    for field in ("Drops", "MvpDrops"):
        if field in updated_dict and updated_dict[field] is not None:
            updated_dict[field] = [
                {k: v for k, v in d.items() if v is not None}
                for d in updated_dict[field]
            ]

    updated_mob = mob_db.update_mob(mob_id, updated_dict, save_mode=save_mode)
    if not updated_mob:
        raise HTTPException(status_code=404, detail="ERROR_MOB_NOT_FOUND")

    if mob_skills is not None and isinstance(mob_skills, list):
        dummy_name = updated_mob.get("AegisName") or updated_mob.get("Name") or str(mob_id)
        mob_skill_db.sync_mob_skills(mob_id, str(dummy_name), mob_skills)

    return _normalize_mob_entry(updated_mob)

@router.post("/")
async def create_mob(mob_data: MobDBModel):
    """Creates a new custom monster and saves it to ``db/import/mob_db.yml``.

    Args:
        mob_data: Full mob payload. ``Id`` is required.

    Returns:
        dict: The newly created, normalized mob object.

    Raises:
        HTTPException: 503 if loading; 400 if ``Id`` missing; 409 if ID already exists.
    """
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    mob_id = mob_data.Id
    if not mob_id:
        raise HTTPException(status_code=400, detail="ERROR_ID_REQUIRED")

    if mob_id in mob_db.mob_index:
        raise HTTPException(status_code=409, detail="ERROR_DUPLICATE_ID")

    clean_data = mob_data.model_dump(exclude_none=True)
    mob_skills = clean_data.pop("MobSkills", None)

    if "Ai" in clean_data and clean_data["Ai"] is not None:
        ai_str = str(clean_data["Ai"]).strip()
        if ai_str.isdigit() and len(ai_str) == 1:
            ai_str = "0" + ai_str
        clean_data["Ai"] = ai_str

    if "Modes" in clean_data and isinstance(clean_data["Modes"], dict):
        clean_data["Modes"] = encode_mob_modes(clean_data["Modes"])

    # Serialize Drops/MvpDrops sub-models back to plain dicts, stripping None values
    for field in ("Drops", "MvpDrops"):
        if field in clean_data and clean_data[field] is not None:
            clean_data[field] = [
                {k: v for k, v in d.items() if v is not None}
                for d in clean_data[field]
            ]

    try:
        new_mob = mob_db.add_custom_mob(clean_data)
        if mob_skills is not None and isinstance(mob_skills, list):
            dummy_name = new_mob.get("AegisName") or new_mob.get("Name") or str(mob_id)
            mob_skill_db.sync_mob_skills(mob_id, str(dummy_name), mob_skills)
        return _normalize_mob_entry(new_mob)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{mob_id}/animation")
async def get_mob_animation(mob_id: int):
    """Returns the animation JSON data for a mob's sprite.

    Resolves the mob's AegisName from the index, looks up its sprite name via
    ``get_sprite_name_for_mob``, then returns the full animation frame data with
    aggressive HTTP cache headers.

    Args:
        mob_id: Numeric rAthena mob ID.

    Returns:
        JSONResponse: Animation data object with 1-year immutable cache headers.

    Raises:
        HTTPException: 503 if loading; 404 if mob, sprite, or animation data not found.
    """
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    if mob_id not in mob_db.mob_index:
        raise HTTPException(status_code=404, detail="ERROR_MOB_NOT_FOUND")

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
        
    from fastapi.responses import JSONResponse
    return JSONResponse(
        content=anim_data,
        headers={"Cache-Control": "public, max-age=31536000, immutable"}
    )


@router.get("/{mob_id}/skills")
async def get_mob_skills(mob_id: int):
    """Returns the skill list for a specific monster.

    Args:
        mob_id: Numeric rAthena mob ID.

    Returns:
        dict: ``{"mob_id": ..., "skills": [...]}``.

    Raises:
        HTTPException: 503 if the mob_skill database is still loading.
    """
    from app.services.mob_skill_parser import mob_skill_db
    if mob_skill_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")
    skills = mob_skill_db.get_by_mob(mob_id)
    return {"mob_id": mob_id, "skills": skills}


from fastapi import UploadFile, File as FastAPIFile

def _get_mob_aegis(mob_id: int) -> str | None:
    """Returns the AegisName of a monster by its numeric ID.

    Args:
        mob_id: Numeric rAthena mob ID.

    Returns:
        str | None: The AegisName string, or ``None`` if not found.
    """
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
    """Receives a .spr + .act file pair and saves them to the GRF override path.

    Files are persisted under the mob's AegisName so that ``sprite_parser`` discovers
    them automatically on the next animation request — mirroring the workflow used
    by tools like GRF Editor.

    Args:
        mob_id: Numeric rAthena mob ID.
        spr_file: Native Ragnarok Online ``.spr`` sprite file.
        act_file: Native Ragnarok Online ``.act`` action file.

    Returns:
        dict: Confirmation payload with ``aegis_name``, ``spr_saved``, and ``act_saved`` paths.

    Raises:
        HTTPException: 400 for invalid extensions; 404 if mob not found; 500 on I/O error.
    """
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="ERROR_DATABASE_LOADING")

    if mob_id not in mob_db.mob_index:
        raise HTTPException(status_code=404, detail="ERROR_MOB_NOT_FOUND")

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


@router.delete("/{mob_id}", status_code=200)
async def delete_mob(mob_id: int):
    """Permanently removes a monster from ``db/import/mob_db.yml``.

    Args:
        mob_id: Numeric rAthena mob ID.

    Returns:
        dict: ``{"deleted": True, "mob_id": mob_id}`` on success.

    Raises:
        HTTPException: 503 if loading; 403 if the mob belongs to the official rAthena
            database (``db/re/`` or ``db/pre-re/``); 404 if not found.
    """
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando.")

    try:
        deleted = mob_db.delete_mob(mob_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Monstro {mob_id} não encontrado.")

    return {"deleted": True, "mob_id": mob_id}
