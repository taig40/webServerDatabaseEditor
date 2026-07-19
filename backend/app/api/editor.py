"""editor.py — Endpoints for editor-wide utilities and IntelliSense autocomplete."""

from fastapi import APIRouter
from app.services.item_intellisense_service import item_intellisense_svc

router = APIRouter()

@router.get("/item-intellisense")
async def get_item_intellisense():
    """Returns aggregated item data (AegisNames, IDs, names) for frontend autocompletion."""
    return item_intellisense_svc.get_full_intellisense()

