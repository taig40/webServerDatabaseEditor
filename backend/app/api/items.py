from fastapi import APIRouter, Query, HTTPException
from app.services.yaml_parser import yaml_db
from app.services.mob_parser import mob_db
from app.services.npc_parser import npc_db

router = APIRouter()

@router.get("/status")
async def get_status():
    """
    Retorna o status atual do carregamento em background (para exibição na UI).
    """
    return {
        "is_loading": yaml_db.is_loading,
        "message": yaml_db.loading_status,
        "items_loaded": yaml_db.items_loaded
    }

@router.get("/references")
async def get_item_references():
    """
    Retorna uma lista leve de todos os itens (Id, AegisName, Name, is_custom)
    para o ReferencePicker / Smart Autocomplete do Front-end.
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

@router.get("/{item_id}/sold_by")
async def get_item_sold_by(item_id: int):
    """
    Returns a list of shops that sell the given item.
    """
    item = yaml_db.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    shops = npc_db.get_shops_selling_item(item_id, item.get('AegisName'))
    
    result = []
    for s in shops:
        price = s['items'].get(item_id)
        if price is None and item.get('AegisName') in s['items']:
            price = s['items'][item.get('AegisName')]
            
        if price == -1:
            price = item.get('Buy', 0)
            
        result.append({
            "map": s['map'],
            "x": s['x'],
            "y": s['y'],
            "name": s['name'],
            "full_name": s['full_name'],
            "sprite_id": s['sprite_id'],
            "price": price,
            "all_items": s['items']
        })
    return result

from typing import Optional

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
    """
    Returns a paginated list of items from the in-memory YAML database.
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

    # Merge client database LUA properties (identifiedDisplayName, identifiedResourceName)
    from app.services.iteminfo_parser import iteminfo_db
    merged_items = []
    for item in paginated_items:
        it = dict(item)
        item_id = it.get("Id")
        if item_id and iteminfo_db.loaded:
            entry = iteminfo_db.item_map.get(item_id)
            if entry:
                it["identifiedDisplayName"] = entry.get("identifiedDisplayName")
                it["identifiedResourceName"] = entry.get("identifiedResourceName")
        it["is_custom"] = (it.get("_source") == "custom")
        merged_items.append(it)

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

from app.models.item import ItemDBModel, ItemUpdateModel
from fastapi import HTTPException
from typing import List, Dict

@router.get("/{item_id}/dropped_by")
async def get_item_dropped_by(item_id: int):
    """
    Retorna a lista de monstros que dropam este item.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando.")
        
    # Primeiro acha o item pelo ID para pegar o AegisName
    items = yaml_db.get_items()
    target_item = next((i for i in items if i.get("Id") == item_id), None)
    if not target_item:
        raise HTTPException(status_code=404, detail=f"Item with Id {item_id} not found")
        
    aegis_name = target_item.get("AegisName")
    if not aegis_name:
        return []

    # Busca no mob_db os monstros que dropam este AegisName
    from app.services.mob_parser import mob_db
    if mob_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de monstros ainda está carregando.")
        
    mobs = mob_db.get_mobs()
    droppers = []
    
    for mob in mobs:
        drops = mob.get("Drops", [])
        if drops:
            for drop in drops:
                # O formato do drop é {"Item": "AegisName", "Rate": 100}
                if drop.get("Item") == aegis_name:
                    droppers.append({
                        "MobId": mob.get("Id"),
                        "MobName": mob.get("Name"),
                        "MobAegisName": mob.get("AegisName"),
                        "Rate": drop.get("Rate", 0),
                        "Type": "Normal" # Podemos refinar se tivermos StealProtected ou Mvp
                    })
                    
    return droppers


@router.put("/{item_id}")
async def update_item(
    item_id: int,
    item_data: ItemUpdateModel,
    save_mode: str = Query("import", description="Modo de salvamento: 'import' para cópia em db/import/ ou 'overwrite' para sobrescrever")
):
    """
    Atualiza um item no banco YAML e salva no disco.
    Utiliza exclude_none=True para omitir campos nulos, evitando chaves
    inválidas que possam causar crash no map-server do rAthena.
    Preserva comentários e formatação original via ruamel.yaml.
    """
    # exclude_none=True → chaves não preenchidas não são escritas no YAML
    # exclude_defaults=True → chaves correspondentes ao padrão do rAthena são omitidas
    # extra='ignore' no modelo → campos desconhecidos do front-end são descartados
    updated_dict = item_data.model_dump(exclude_none=True, exclude_defaults=True)

    # A chave primária não deve sobrescrever o índice existente
    updated_dict.pop("Id", None)

    updated_item = yaml_db.update_item(item_id, updated_dict, save_mode=save_mode)

    if not updated_item:
        raise HTTPException(status_code=404, detail=f"Item with Id {item_id} not found")

    return updated_item

@router.post("/")
async def create_item(item_data: ItemDBModel):
    """
    Cria um novo item customizado e salva em db/import/item_db.yml.
    Usa exclude_none=True para omitir campos não preenchidos e
    extra='ignore' no modelo para descartar chaves desconhecidas.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando.")

    item_id = item_data.Id
    if not item_id:
        raise HTTPException(status_code=400, detail="Id is required")

    if item_id in yaml_db.item_index:
        raise HTTPException(status_code=409, detail=f"Um item com o ID {item_id} já existe.")

    # Serializa descartando nulos e defaults → YAML limpo, sem chaves inválidas
    clean_data = item_data.model_dump(exclude_none=True, exclude_defaults=True)

    try:
        new_item = yaml_db.add_custom_item(clean_data)
        return new_item
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── DELETE /api/items/{item_id} ──────────────────────────────────────────────

@router.delete("/{item_id}", status_code=200)
async def delete_item(item_id: int):
    """
    Remove permanentemente um item de db/import/item_db.yml.

    Retorna 403 se o item pertencer ao banco oficial do rAthena (db/re/ ou db/pre-re/).
    Retorna 404 se o item não existir no índice.
    Retorna 200 { deleted: true, item_id } em caso de sucesso.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando.")

    try:
        deleted = yaml_db.delete_item(item_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Item {item_id} não encontrado.")

    return {"deleted": True, "item_id": item_id}
