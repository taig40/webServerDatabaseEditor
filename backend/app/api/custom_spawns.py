from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.custom_spawn_service import read_spawns, append_spawn, get_spawn_file_path

router = APIRouter()


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class SpawnPayload(BaseModel):
    snippet: str
    # Metadados opcionais para log / identificação
    map_name: Optional[str] = None
    monster_name: Optional[str] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("")
async def get_custom_spawns():
    """
    Lê o arquivo npc/custom/ui_spawns.txt e retorna suas linhas.
    Cria o arquivo automaticamente se não existir.
    """
    try:
        return read_spawns()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler ui_spawns.txt: {e}")


@router.get("/path")
async def get_spawn_path():
    """Retorna o caminho resolvido do arquivo de spawns."""
    return {"file_path": get_spawn_file_path()}


@router.post("")
async def inject_custom_spawn(payload: SpawnPayload):
    """
    Faz append do snippet no final de npc/custom/ui_spawns.txt.
    Nunca altera arquivos de script oficiais do rAthena.
    """
    if not payload.snippet or not payload.snippet.strip():
        raise HTTPException(status_code=400, detail="Snippet não pode ser vazio.")
    try:
        result = append_spawn(payload.snippet)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao injetar spawn: {e}")
