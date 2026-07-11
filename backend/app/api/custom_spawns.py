from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.custom_spawn_service import read_spawns, append_spawn, get_spawn_file_path

router = APIRouter()


# ─── Pydantic Models ──────────────────────────────────────────────────────────

from app.models.item import rAthenaBaseModel
from pydantic import Field
from typing import Union, Optional

class SpawnPayload(rAthenaBaseModel):
    mapname: str = Field(..., min_length=1, max_length=11, description="Nome do mapa (ex: prontera)")
    x: int = Field(0, ge=0, description="Coordenada X (0 para aleatório)")
    y: int = Field(0, ge=0, description="Coordenada Y (0 para aleatório)")
    rx: int = Field(0, ge=0, description="Raio de variação X (0 para ponto exato)")
    ry: int = Field(0, ge=0, description="Raio de variação Y (0 para ponto exato)")
    
    mobid: Union[str, int] = Field(..., description="ID ou AegisName do Monstro")
    mobname: str = Field(..., min_length=1, description="Nome de exibição do monstro")
    
    amount: int = Field(1, ge=1, le=1000, description="Quantidade de monstros")
    delay1: int = Field(0, ge=0, description="Tempo de respawn base (ms)")
    delay2: int = Field(0, ge=0, description="Variação aleatória do respawn (ms)")
    event: str = Field("", max_length=24, description="Label do evento (opcional)")

    def format_rathena_spawn(self) -> str:
        """
        Formata a linha estritamente seguindo o padrão do emulador:
        mapname,x,y,rx,ry<TAB>monster<TAB>mobname<TAB>mobid,amount,delay1,delay2,event
        """
        event_str = f",{self.event}" if self.event else ""
        return (f"{self.mapname},{self.x},{self.y},{self.rx},{self.ry}\t"
                f"monster\t{self.mobname}\t"
                f"{self.mobid},{self.amount},{self.delay1},{self.delay2}{event_str}")


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
    try:
        snippet = payload.format_rathena_spawn()
        result = append_spawn(snippet)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao injetar spawn: {e}")
