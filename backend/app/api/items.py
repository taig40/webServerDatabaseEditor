from fastapi import APIRouter, Query, HTTPException
from app.services.yaml_parser import yaml_db

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

@router.get("/")
async def get_items(
    skip: int = Query(0, description="Número de itens a pular"),
    limit: int = Query(50000, description="Número de itens a retornar")
):
    """
    Returns a paginated list of items from the in-memory YAML database.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando na memória RAM.")

    items = yaml_db.get_items()
    total = len(items)
    
    # Paginate
    paginated_items = items[skip : skip + limit]
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": paginated_items
    }

from app.models.item import ItemUpdate
from fastapi import HTTPException

@router.put("/{item_id}")
async def update_item(item_id: int, item_data: ItemUpdate):
    """
    Updates an item in the YAML database and saves to disk.
    Preserves all comments and original formatting.
    """
    # Exclude unset fields so we only update what the frontend actually sent
    updated_dict = item_data.model_dump(exclude_unset=True)
    
    # Avoid modifying the primary key ID if passed accidentally
    if "Id" in updated_dict:
        del updated_dict["Id"]
        
    updated_item = yaml_db.update_item(item_id, updated_dict)
    
    if not updated_item:
        raise HTTPException(status_code=404, detail=f"Item with Id {item_id} not found")
        
    return updated_item

@router.post("/")
async def create_item(item_data: dict):
    """
    Creates a new custom item and saves it to db/import/item_db.yml.
    """
    if yaml_db.is_loading:
        raise HTTPException(status_code=503, detail="O banco de dados ainda está carregando.")
        
    item_id = item_data.get("Id")
    if not item_id:
        raise HTTPException(status_code=400, detail="Id is required")
        
    if item_id in yaml_db.item_index:
        raise HTTPException(status_code=409, detail=f"Um item com o ID {item_id} já existe.")
        
    try:
        new_item = yaml_db.add_custom_item(item_data)
        return new_item
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
