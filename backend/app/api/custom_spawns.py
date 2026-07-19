from fastapi import APIRouter, HTTPException, Path
from pydantic import Field
from typing import Optional, Union, List, Dict, Any

from app.services.custom_spawn_service import (
    get_active_maps,
    get_map_spawns,
    append_spawn,
    delete_spawn,
    update_spawn,
    get_spawn_index_path
)
from app.models.item import rAthenaBaseModel
from app.services.mob_parser import mob_db


def _resolve_mob_name(mobid: Union[str, int], fallback_name: str) -> str:
    """Resolves a monster's Display Name from the in-memory mob database.

    Looks up by numeric ID first; if the value is not a digit it performs a
    case-insensitive AegisName match instead.  Falls back to ``fallback_name``
    if no entry is found or the database is still loading.

    Args:
        mobid: Numeric mob ID or AegisName string.
        fallback_name: Name to return when resolution fails.

    Returns:
        str: The monster's ``Name`` field from mob_db, or ``fallback_name``.
    """
    if not mobid:
        return fallback_name

    mob_id_str = str(mobid).upper()
    mobs_list = mob_db.get_mobs()

    if mob_id_str.isdigit():
        target_id = int(mob_id_str)
        mob_entry = next((m for m in mobs_list if m.get("Id") == target_id), None)
    else:
        mob_entry = next(
            (m for m in mobs_list if str(m.get("AegisName", "")).upper() == mob_id_str),
            None
        )

    if mob_entry and "Name" in mob_entry:
        return mob_entry["Name"]

    return fallback_name


router = APIRouter()


class SpawnPayload(rAthenaBaseModel):
    """Payload for creating or updating a custom NPC monster spawn.

    Attributes:
        mapname: Target map name (e.g. ``prontera``).
        x: Spawn X coordinate (0 = random within radius).
        y: Spawn Y coordinate (0 = random within radius).
        rx: X random radius.
        ry: Y random radius.
        mobid: Monster ID or AegisName.
        mobname: Monster display name (resolved automatically from mob_db if omitted).
        amount: Number of monsters to spawn.
        delay1: Base respawn delay in milliseconds.
        delay2: Random respawn delay variation in milliseconds.
        event: Optional NPC event label triggered on spawn.
        snippet: Pre-formatted rAthena spawn line (bypasses field-level formatting).
    """

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

    snippet: Optional[str] = Field(None, description="Linha de spawn já formatada")

    def format_rathena_spawn(self, override_map: str = None) -> str:
        """Formats the spawn line strictly following the rAthena NPC script standard.

        Format: ``map,x,y,rx,ry<TAB>monster<TAB>Name<TAB>id,amount,delay1,delay2[,event]``

        Args:
            override_map: Map name to use instead of ``self.mapname``.

        Returns:
            str: The fully formatted rAthena spawn line.
        """
        map_n = override_map or self.mapname
        event_str = f",{self.event}" if self.event else ""
        return (f"{map_n},{self.x},{self.y},{self.rx},{self.ry}\t"
                f"monster\t{self.mobname}\t"
                f"{self.mobid},{self.amount},{self.delay1},{self.delay2}{event_str}")


@router.get("/maps")
async def list_active_maps():
    """Returns the list of maps that have active spawn files registered in ``ui_spawns.conf``.

    Returns:
        dict: ``{"maps": [...], "index_path": "..."}``

    Raises:
        HTTPException: 500 on file read error.
    """
    try:
        return {"maps": get_active_maps(), "index_path": get_spawn_index_path()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler ui_spawns.conf: {e}")


@router.get("/maps/{map_name}")
async def list_spawns_for_map(map_name: str = Path(..., description="Nome do mapa, ex: prontera")):
    """Returns the detailed spawn list for a specific map as structured JSON.

    Args:
        map_name: Map name without extension (e.g. ``prontera``).

    Returns:
        dict: ``{"map": "...", "spawns": [...]}``

    Raises:
        HTTPException: 500 on file read error.
    """
    try:
        return {"map": map_name, "spawns": get_map_spawns(map_name)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler spawns de {map_name}: {e}")


@router.post("/maps/{map_name}")
async def inject_map_spawn(payload: SpawnPayload, map_name: str = Path(..., description="Nome do mapa")):
    """Appends a new spawn entry to a map's spawn file.

    If ``snippet`` is provided in the payload it is written verbatim; otherwise the
    spawn line is formatted from the individual fields.  The monster's Display Name
    is resolved automatically from mob_db before formatting.

    Args:
        payload: Spawn data.
        map_name: Target map name.

    Returns:
        dict: Service result from ``append_spawn``.

    Raises:
        HTTPException: 422 if ``mobid``/``mobname`` are missing when no snippet is provided;
            500 on I/O error.
    """
    try:
        if payload.snippet and payload.snippet.strip():
            snippet = payload.snippet.strip()
        else:
            if not payload.mobid or not payload.mobname:
                raise HTTPException(status_code=422, detail="mobid e mobname são obrigatórios.")
            payload.mobname = _resolve_mob_name(payload.mobid, payload.mobname)
            snippet = payload.format_rathena_spawn(override_map=map_name)

        result = append_spawn(map_name, snippet)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao injetar spawn: {e}")


@router.delete("/maps/{map_name}/{spawn_uuid}")
async def remove_map_spawn(map_name: str, spawn_uuid: str):
    """Removes a spawn entry from a map file by its UUID comment marker.

    Args:
        map_name: Map name without extension.
        spawn_uuid: UUID previously assigned to the spawn entry.

    Returns:
        dict: Service result from ``delete_spawn``.

    Raises:
        HTTPException: 404 if the UUID is not found; 500 on I/O error.
    """
    try:
        result = delete_spawn(map_name, spawn_uuid)
        if not result.get("deleted"):
            raise HTTPException(status_code=404, detail="Spawn não encontrado.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover spawn: {e}")


@router.put("/maps/{map_name}/{spawn_uuid}")
async def edit_map_spawn(payload: SpawnPayload, map_name: str, spawn_uuid: str):
    """Updates an existing spawn entry identified by its UUID.

    The monster's Display Name is resolved from mob_db before the updated
    spawn line is written to disk.

    Args:
        payload: Updated spawn data. Both ``mobid`` and ``mobname`` are required.
        map_name: Map name without extension.
        spawn_uuid: UUID of the spawn entry to update.

    Returns:
        dict: Service result from ``update_spawn``.

    Raises:
        HTTPException: 422 if ``mobid``/``mobname`` are missing; 404 if UUID not found;
            500 on I/O error.
    """
    try:
        if not payload.mobid or not payload.mobname:
            raise HTTPException(status_code=422, detail="mobid e mobname são obrigatórios.")
        payload.mobname = _resolve_mob_name(payload.mobid, payload.mobname)
        snippet = payload.format_rathena_spawn(override_map=map_name)
        result = update_spawn(map_name, spawn_uuid, snippet)
        if not result.get("updated"):
            raise HTTPException(status_code=404, detail="Spawn não encontrado para atualização.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar spawn: {e}")
