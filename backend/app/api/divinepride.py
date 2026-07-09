from fastapi import APIRouter, Header, HTTPException, Query
from typing import Optional
import json
import urllib.request
import urllib.error
from app.services.divinepride_mapper import (
    DivinePrideMapper,
    DivinePrideItemMapper,
    DivinePrideSkillMapper,
    DivinePrideExpMapper,
)

router = APIRouter()

@router.get("/import/item/{id}")
async def import_item_from_divine_pride(
    id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey")
):
    return await import_from_divine_pride("item", id, x_divine_pride_key, api_key)

@router.get("/import/skill/{id}")
async def import_skill_from_divine_pride(
    id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey")
):
    return await import_from_divine_pride("skill", id, x_divine_pride_key, api_key)

@router.get("/import/experience/{type}")
@router.get("/import/experience")
async def import_experience_from_divine_pride(
    type: str = "normal",
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey")
):
    key = x_divine_pride_key or api_key
    if not key or not str(key).strip():
        raise HTTPException(status_code=400, detail="DivinePride API Key não fornecida.")

    url = f"https://divine-pride.net/api/database/Experience?apiKey={key}"

    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "rAthena-WebSDE/1.0",
                "Accept": "application/json"
            }
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise HTTPException(status_code=404, detail="Tabela de experiência não encontrada no DivinePride.")
        elif e.code in (401, 403):
            raise HTTPException(status_code=401, detail="DivinePride API Key inválida ou sem permissão.")
        else:
            raise HTTPException(status_code=e.code, detail=f"Erro do DivinePride HTTP {e.code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Falha na comunicação com DivinePride: {str(e)}")

    mapped_data = DivinePrideExpMapper.map_exp_to_rathena(data, exp_type=type)

    return {
        "success": True,
        "source": "divinepride",
        "raw": data,
        "mapped": mapped_data
    }

@router.get("/import/{resource_type}/{resource_id}")
async def import_from_divine_pride(
    resource_type: str,
    resource_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey")
):
    key = x_divine_pride_key or api_key
    if not key or not str(key).strip():
        raise HTTPException(status_code=400, detail="DivinePride API Key não fornecida.")

    res_type_lower = resource_type.lower()
    if res_type_lower in ("monster", "mob"):
        dp_endpoint_type = "Monster"
    elif res_type_lower in ("item",):
        dp_endpoint_type = "Item"
    elif res_type_lower in ("skill",):
        dp_endpoint_type = "Skill"
    else:
        raise HTTPException(status_code=400, detail="Tipo de recurso inválido. Use 'monster', 'item' ou 'skill'.")

    url = f"https://divine-pride.net/api/database/{dp_endpoint_type}/{resource_id}?apiKey={key}"

    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "rAthena-WebSDE/1.0",
                "Accept": "application/json"
            }
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise HTTPException(status_code=404, detail=f"{dp_endpoint_type} com ID {resource_id} não encontrado no DivinePride.")
        elif e.code in (401, 403):
            raise HTTPException(status_code=401, detail="DivinePride API Key inválida ou sem permissão.")
        else:
            raise HTTPException(status_code=e.code, detail=f"Erro do DivinePride HTTP {e.code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Falha na comunicação com DivinePride: {str(e)}")

    if dp_endpoint_type == "Monster":
        mapped_data = DivinePrideMapper.map_monster_to_rathena(data)
    elif dp_endpoint_type == "Skill":
        mapped_data = DivinePrideSkillMapper.map_skill_to_rathena(data)
    else:
        mapped_data = DivinePrideItemMapper.map_item_to_rathena(data)

    return {
        "success": True,
        "source": "divinepride",
        "raw": data,
        "mapped": mapped_data
    }
