from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field
from typing import Optional, Union, List, Dict, Any

from app.services.custom_spawn_service import (
    get_active_maps, 
    get_map_spawns, 
    append_spawn, 
    delete_spawn,
    get_spawn_index_path
)
from app.models.item import rAthenaBaseModel

router = APIRouter()

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class SpawnPayload(rAthenaBaseModel):
    mapname: Optional[str] = Field(None, description="Nome do mapa (ex: prontera)")
    x: int = Field(0, ge=0, description="Coordenada X (0 para aleatório)")
    y: int = Field(0, ge=0, description="Coordenada Y (0 para aleatório)")
    rx: int = Field(0, ge=0, description="Raio de variação X (0 para ponto exato)")
    ry: int = Field(0, ge=0, description="Raio de variação Y (0 para ponto exato)")
    
    mobid: Optional[Union[str, int]] = Field(None, description="ID ou AegisName do Monstro")
    mobname: Optional[str] = Field(None, description="Nome de exibição do monstro")
    
    amount: int = Field(1, ge=1, le=1000, description="Quantidade de monstros")
    delay1: int = Field(0, ge=0, description="Tempo de respawn base (ms)")
    delay2: int = Field(0, ge=0, description="Variação aleatória do respawn (ms)")
    event: str = Field("", max_length=24, description="Label do evento (opcional)")

    # Campos para suporte ao MapEngine
    snippet: Optional[str] = Field(None, description="Linha de spawn já formatada")

    def format_rathena_spawn(self, override_map: str = None) -> str:
        """
        Formata a linha estritamente seguindo o padrão do emulador.
        """
        map_n = override_map or self.mapname
        event_str = f",{self.event}" if self.event else ""
        return (f"{map_n},{self.x},{self.y},{self.rx},{self.ry}\t"
                f"monster\t{self.mobname}\t"
                f"{self.mobid},{self.amount},{self.delay1},{self.delay2}{event_str}")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/maps")
async def list_active_maps():
    """Retorna a lista de mapas que possuem arquivos de spawn ativos no ui_spawns.txt"""
    try:
        return {"maps": get_active_maps(), "index_path": get_spawn_index_path()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler ui_spawns.txt: {e}")

@router.get("/maps/{map_name}")
async def list_spawns_for_map(map_name: str = Path(..., description="Nome do mapa, ex: prontera")):
    """Retorna os spawns detalhados de um mapa específico (JSON)"""
    try:
        return {"map": map_name, "spawns": get_map_spawns(map_name)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler spawns de {map_name}: {e}")

@router.post("/maps/{map_name}")
async def inject_map_spawn(payload: SpawnPayload, map_name: str = Path(..., description="Nome do mapa")):
    """Adiciona um spawn no arquivo do mapa específico."""
    try:
        if payload.snippet and payload.snippet.strip():
            snippet = payload.snippet.strip()
        else:
            if not payload.mobid or not payload.mobname:
                raise HTTPException(status_code=422, detail="mobid e mobname são obrigatórios.")
            snippet = payload.format_rathena_spawn(override_map=map_name)
            
        result = append_spawn(map_name, snippet)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao injetar spawn: {e}")

@router.delete("/maps/{map_name}/{spawn_uuid}")
async def remove_map_spawn(map_name: str, spawn_uuid: str):
    """Remove um spawn do mapa específico via UUID."""
    try:
        result = delete_spawn(map_name, spawn_uuid)
        if not result.get("deleted"):
            raise HTTPException(status_code=404, detail="Spawn não encontrado.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover spawn: {e}")
