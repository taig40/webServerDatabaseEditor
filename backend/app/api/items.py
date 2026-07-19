from typing import Union, Optional, List, Dict
from fastapi import APIRouter, Query, HTTPException
from app.services.yaml_parser import yaml_db
from app.services.mob_parser import mob_db
from app.services.npc_parser import npc_db

router = APIRouter()


@router.get("/status")
async def get_status():
    """Returns the current background loading status for display in the UI.

    Returns:
        dict: Keys ``is_loading``, ``message``, and ``items_loaded``.
    """
    return {
        "is_loading": yaml_db.is_loading,
        "message": yaml_db.loading_status,
        "items_loaded": yaml_db.items_loaded
    }


@router.get("/lookup")
async def get_items_lookup():
    """Returns a JSON hash-map of Id → AegisName for O(1) resolution in the frontend.

    Returns:
        dict: Mapping of string item IDs to their AegisName, e.g. ``{"501": "Red_Potion"}``.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando na memória RAM.")
    items = yaml_db.get_items()
    lookup = {}
    for item in items:
        item_id = item.get("Id")
        if item_id is not None:
            lookup[str(item_id)] = item.get("AegisName", f"ITEM_{item_id}")
    return lookup


@router.get("/references")
async def get_item_references():
    """Returns a lightweight list of all items for the ReferencePicker / Smart Autocomplete.

    Each entry contains only ``Id``, ``AegisName``, ``Name``, and ``is_custom``.

    Returns:
        dict: A ``{"items": [...]}`` payload for the frontend autocomplete widget.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando na memória RAM.")
    items = yaml_db.get_items()
    result = []
    for item in items:
        item_id = item.get("Id")
        if item_id is None:
            continue
        result.append({
            "Id": item_id,
            "AegisName": item.get("AegisName", f"ITEM_{item_id}"),
            "Name": item.get("Name", item.get("AegisName", f"ITEM_{item_id}")),
            "is_custom": (item.get("_source") == "custom")
        })
    return {"items": result}


@router.get("/{item_id}/sold-by")
@router.get("/{item_id}/sold_by")
async def get_item_sold_by(item_id: str):
    """Returns a list of NPC shops that sell the given item.

    Accepts both a numeric ID and an AegisName string in the path. If the
    lookup by ID fails, falls back to a lookup by AegisName from the item
    cache. Prices reported as ``-1`` are resolved to the item's native Buy
    value automatically.

    Args:
        item_id: Numeric item ID or AegisName string.

    Returns:
        list: Shop entries, or an empty list if the item is not sold anywhere.
    """
    try:
        from app.services.shop_parser_service import shop_service
        lookup_key: Union[int, str] = int(item_id) if item_id.isdigit() else item_id
        shops = shop_service.get_sold_by(lookup_key)
        if not shops and isinstance(lookup_key, int):
            item = yaml_db.get_item(lookup_key)
            if item and item.get("AegisName"):
                shops = shop_service.get_sold_by(item.get("AegisName"))

        # Resolve native item price when the shop entry reports -1
        if shops and isinstance(lookup_key, int):
            item_data = yaml_db.get_item(lookup_key)
            if item_data:
                default_buy = item_data.get("Buy", 0)
                for s in shops:
                    if s.get("price") == -1 and default_buy:
                        s["price"] = default_buy

        return shops or []
    except Exception as e:
        print(f"[items.py] Erro em /sold-by para item {item_id}: {e}")
        return []


@router.get("/")
async def get_items(
    page: int = Query(1, ge=1, description="Página atual (1-based)"),
    limit: int = Query(50, ge=1, description="Número de itens a retornar"),
    search: str = Query("", description="Termo de busca retrocompatível"),
    search_query: str = Query("", description="O texto digitado pelo usuário"),
    search_target: str = Query("name", description="Onde procurar: name ou script"),
    item_type: str = Query("", description="O tipo do item no YAML (ex: Equipment, Consumable, etc.)"),
    source: str = Query("", description="Filtra por origem: rathena ou custom"),
    skip: Optional[int] = Query(None, description="Opcional retrocompatibilidade com skip")
):
    """Returns a paginated list of items from the in-memory YAML database.

    Each entry is enriched with ``identifiedDisplayName`` and
    ``identifiedResourceName`` from the client-side ItemInfo Lua cache.

    Args:
        page: 1-based page index.
        limit: Number of items per page (capped at 100).
        search: Legacy free-text search term.
        search_query: Typed search text (takes precedence over ``search``).
        search_target: Search field — ``"name"`` or ``"script"``.
        item_type: YAML type filter (e.g. ``"Equipment"``, ``"Consumable"``).
        source: Origin filter — ``"rathena"`` or ``"custom"``.
        skip: Optional raw offset for backwards-compatible pagination.

    Returns:
        dict: Paginated response with ``total``, ``page``, ``limit``, ``has_more``, and ``items``.

    Raises:
        HTTPException: 503 if the database is still loading.
    """
    limit = min(max(1, limit), 100)
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando na memória RAM.")

    paginated_items, total_count = yaml_db.search_items(
        page=page,
        limit=limit,
        search=search,
        source=source,
        skip=skip,
        search_query=search_query,
        search_target=search_target,
        item_type=item_type
    )

    from app.services.iteminfo_parser import iteminfo_db
    merged_items = []
    for item in paginated_items:
        item_id = item.get("Id")
        aegis_name = item.get("AegisName", "")
        name = item.get("Name", aegis_name)
        item_type = item.get("Type", "Etc")
        source_val = item.get("_source", "rathena")

        identified_name = ""
        identified_res = ""
        if item_id and iteminfo_db.loaded:
            entry = iteminfo_db.item_map.get(item_id)
            if entry:
                identified_name = entry.get("identifiedDisplayName", "")
                identified_res = entry.get("identifiedResourceName", "")

        dto = {
            "Id": item_id,
            "AegisName": aegis_name,
            "Name_Aegis": aegis_name,
            "Name": name,
            "Name_Eng": name,
            "Type": item_type,
            "_source": source_val,
            "is_custom": (source_val == "custom"),
            "identifiedDisplayName": identified_name,
            "identifiedResourceName": identified_res,
        }
        merged_items.append(dto)

    effective_skip = skip if skip is not None else (page - 1) * limit

    return {
        "total": total_count,
        "total_count": total_count,
        "page": page,
        "limit": limit,
        "skip": effective_skip,
        "has_more": (effective_skip + len(merged_items)) < total_count,
        "items": merged_items
    }


@router.get("/{item_id}")
async def get_item_detail(item_id: int):
    """Returns the full item object (including scripts, random options, etc.) for detail/edit view.

    The response is enriched with ``identifiedDisplayName`` and
    ``identifiedResourceName`` from the ItemInfo Lua cache, and annotated with
    ``is_custom`` / ``_source`` flags.

    Args:
        item_id: Numeric rAthena item ID.

    Returns:
        dict: Complete item object.

    Raises:
        HTTPException: 503 if loading; 404 if item not found.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando.")

    item = yaml_db.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Item with Id {item_id} not found")

    from app.services.iteminfo_parser import iteminfo_db
    it = dict(item)
    if iteminfo_db.loaded:
        entry = iteminfo_db.item_map.get(item_id)
        if entry:
            it["identifiedDisplayName"] = entry.get("identifiedDisplayName")
            it["identifiedResourceName"] = entry.get("identifiedResourceName")
    target_filepath = yaml_db.item_index.get(item_id, "")
    is_custom = "/db/import/" in target_filepath.replace("\\", "/")

    it["is_custom"] = is_custom
    it["_source"] = "custom" if is_custom else "rathena"

    return it


from app.models.item import ItemDBModel, ItemUpdateModel


@router.get("/{item_id}/dropped_by")
async def get_item_dropped_by(item_id: int):
    """Returns the list of monsters that drop the given item.

    Args:
        item_id: Numeric rAthena item ID.

    Returns:
        list: Entries with ``MobId``, ``MobName``, ``MobAegisName``, ``Rate``, and ``Type``.

    Raises:
        HTTPException: 503 if either database is loading; 404 if the item does not exist.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando.")

    items = yaml_db.get_items()
    target_item = next((i for i in items if i.get("Id") == item_id), None)
    if not target_item:
        raise HTTPException(status_code=404, detail=f"Item with Id {item_id} not found")

    aegis_name = target_item.get("AegisName")
    if not aegis_name:
        return []

    from app.services.mob_parser import mob_db
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de monstros ainda está carregando.")

    mobs = mob_db.get_mobs()
    droppers = []

    for mob in mobs:
        drops = mob.get("Drops", [])
        if drops:
            for drop in drops:
                if drop.get("Item") == aegis_name:
                    droppers.append({
                        "MobId": mob.get("Id"),
                        "MobName": mob.get("Name"),
                        "MobAegisName": mob.get("AegisName"),
                        "Rate": drop.get("Rate", 0),
                        "Type": "Normal"
                    })

    return droppers


@router.put("/{item_id}")
async def update_item(
    item_id: int,
    item_data: ItemUpdateModel,
    save_mode: str = Query("import", description="Modo de salvamento: 'import' para cópia em db/import/ ou 'overwrite' para sobrescrever")
):
    """Updates an item in the YAML database and persists it to disk.

    Uses ``exclude_none=True`` and ``exclude_defaults=True`` on the Pydantic model
    to produce a clean YAML output — no null keys or rAthena-default values are written,
    preventing potential map-server crashes. The primary key ``Id`` is intentionally
    stripped from the patch dict to avoid overwriting the YAML index entry.

    Args:
        item_id: Numeric rAthena item ID.
        item_data: Partial item payload (all fields optional via ``ItemUpdateModel``).
        save_mode: ``"import"`` writes to ``db/import/``; ``"overwrite"`` patches in place.

    Returns:
        dict: The updated item object.

    Raises:
        HTTPException: 404 if the item is not found.
    """
    updated_dict = item_data.model_dump(exclude_none=True, exclude_defaults=True)
    updated_dict.pop("Id", None)

    updated_item = yaml_db.update_item(item_id, updated_dict, save_mode=save_mode)

    if not updated_item:
        raise HTTPException(status_code=404, detail=f"Item with Id {item_id} not found")

    return updated_item


@router.post("/")
async def create_item(item_data: ItemDBModel):
    """Creates a new custom item and saves it to ``db/import/item_db.yml``.

    Args:
        item_data: Full item payload. ``Id`` is required.

    Returns:
        dict: The newly created item object.

    Raises:
        HTTPException: 503 if loading; 400 if ``Id`` is missing; 409 if the ID already exists.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando.")

    item_id = item_data.Id
    if not item_id:
        raise HTTPException(status_code=400, detail="Id is required")

    if item_id in yaml_db.item_index:
        raise HTTPException(status_code=409, detail=f"Um item com o ID {item_id} já existe.")

    clean_data = item_data.model_dump(exclude_none=True, exclude_defaults=True)

    try:
        new_item = yaml_db.add_custom_item(clean_data)
        return new_item
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{item_id}", status_code=200)
async def delete_item(item_id: int):
    """Permanently removes an item from ``db/import/item_db.yml``.

    Args:
        item_id: Numeric rAthena item ID.

    Returns:
        dict: ``{"status": "success", "item_id": item_id}`` on successful deletion.

    Raises:
        HTTPException: 503 if loading; 403 if the item belongs to the official rAthena
            database (``db/re/`` or ``db/pre-re/``); 404 if not found.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando.")

    try:
        deleted = yaml_db.delete_item(item_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Item {item_id} não encontrado.")

    return {"status": "success", "message": "Item deletado com sucesso.", "item_id": item_id}
