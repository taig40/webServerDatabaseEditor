"""
api/divinepride.py — Router para importação de dados do Divine Pride.

Responsabilidade ÚNICA (SRP): orquestrar as chamadas entre o Client HTTP
(divine_pride_client) e o Adapter de transformação (divine_pride_adapter),
retornando as respostas HTTP adequadas.

ZERO lógica de negócio, ZERO requests HTTP diretos neste arquivo.

Rotas novas (Preview-to-Save):
    GET /api/divinepride/preview/item/{id}
    GET /api/divinepride/preview/monster/{id}
    GET /api/divinepride/preview/skill/{id}
    GET /api/divinepride/preview/experience

Rotas legadas (retrocompatibilidade — delegam para o novo adapter):
    GET /api/divinepride/import/{resource_type}/{resource_id}
    GET /api/divinepride/import/item/{id}
    GET /api/divinepride/import/skill/{id}
    GET /api/divinepride/import/experience
"""

from fastapi import APIRouter, Header, HTTPException, Query
from typing import Optional
from io import StringIO
from ruamel.yaml import YAML

from app.clients.divine_pride_client import (
    dp_client,
    DPNotFoundException,
    DPAuthException,
    DPNetworkException,
    DPHTTPException,
)
from app.services.divine_pride_adapter import dp_adapter

router = APIRouter()

# ─── YAML helper para geração do preview ──────────────────────────────────────

def _to_yaml_preview(data: dict) -> str:
    """Serializa um dict para YAML formatado no estilo rAthena (para o preview)."""
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.indent(mapping=2, sequence=4, offset=2)
    buf = StringIO()
    yaml.dump(data, buf)
    return buf.getvalue()


# ─── Helpers de autenticação e tradução de exceções ───────────────────────────

def _resolve_key(
    header_key: Optional[str],
    query_key: Optional[str],
) -> str:
    key = (header_key or query_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=400,
            detail="DivinePride API Key não fornecida. Informe via header 'x-divine-pride-key' ou query param 'apiKey'.",
        )
    return key


def _translate_dp_error(exc: Exception, resource_type: str, resource_id) -> HTTPException:
    """Converte exceções tipadas do Client em HTTPException do FastAPI."""
    if isinstance(exc, DPNotFoundException):
        return HTTPException(
            status_code=404,
            detail=f"{resource_type} com ID {resource_id} não encontrado no DivinePride.",
        )
    if isinstance(exc, DPAuthException):
        return HTTPException(status_code=401, detail="DivinePride API Key inválida ou sem permissão.")
    if isinstance(exc, DPHTTPException):
        return HTTPException(status_code=exc.status_code, detail=str(exc))
    if isinstance(exc, DPNetworkException):
        return HTTPException(status_code=502, detail=f"Falha na comunicação com DivinePride: {exc}")
    return HTTPException(status_code=500, detail=f"Erro inesperado: {exc}")


# ─── NOVAS ROTAS: Preview-to-Save ────────────────────────────────────────────

@router.get("/preview/item/{item_id}")
async def preview_item(
    item_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """
    Busca um item no Divine Pride, transforma via Adapter e retorna:
      - mapped: dict compatível com ItemDBModel (pronto para POST /api/items/)
      - yaml_preview: representação YAML formatada do que será escrito em disco
      - raw: JSON bruto do Divine Pride (para debug)
    """
    key = _resolve_key(x_divine_pride_key, api_key)
    try:
        raw = dp_client.fetch_item(item_id, key)
    except Exception as e:
        raise _translate_dp_error(e, "Item", item_id)

    mapped = dp_adapter.adapt_item(raw)
    # Gera preview sem LiteralScalarString (para display no front-end)
    preview_dict = {k: (str(v) if hasattr(v, "lc") else v) for k, v in mapped.items()}

    return {
        "success":      True,
        "source":       "divinepride",
        "resource":     "item",
        "id":           item_id,
        "mapped":       mapped,
        "yaml_preview": _to_yaml_preview(mapped),
        "raw":          raw,
    }


@router.get("/preview/monster/{mob_id}")
async def preview_monster(
    mob_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """
    Busca um monstro no Divine Pride, transforma via Adapter e retorna:
      - mapped: dict compatível com MobDBModelUpdate
      - yaml_preview: representação YAML formatada
      - raw: JSON bruto do Divine Pride
    """
    key = _resolve_key(x_divine_pride_key, api_key)
    try:
        raw = dp_client.fetch_monster(mob_id, key)
    except Exception as e:
        raise _translate_dp_error(e, "Monster", mob_id)

    mapped = dp_adapter.adapt_monster(raw)

    return {
        "success":      True,
        "source":       "divinepride",
        "resource":     "monster",
        "id":           mob_id,
        "mapped":       mapped,
        "yaml_preview": _to_yaml_preview({k: v for k, v in mapped.items() if k != "MobSkills"}),
        "raw":          raw,
    }


@router.get("/preview/skill/{skill_id}")
async def preview_skill(
    skill_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """Busca uma skill no Divine Pride e retorna o dict transformado."""
    key = _resolve_key(x_divine_pride_key, api_key)
    try:
        raw = dp_client.fetch_skill(skill_id, key)
    except Exception as e:
        raise _translate_dp_error(e, "Skill", skill_id)

    mapped = dp_adapter.adapt_skill(raw)
    return {
        "success": True,
        "source":  "divinepride",
        "resource": "skill",
        "id":      skill_id,
        "mapped":  mapped,
        "yaml_preview": _to_yaml_preview(mapped),
        "raw":     raw,
    }


@router.get("/preview/experience")
@router.get("/preview/experience/{exp_type}")
async def preview_experience(
    exp_type: str = "normal",
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """Busca a tabela de experiência no Divine Pride e retorna o dict transformado."""
    key = _resolve_key(x_divine_pride_key, api_key)
    try:
        raw = dp_client.fetch_experience(key)
    except Exception as e:
        raise _translate_dp_error(e, "Experience", exp_type)

    mapped = dp_adapter.adapt_experience(raw, exp_type=exp_type)
    return {"success": True, "source": "divinepride", "mapped": mapped, "raw": raw}


# ─── ROTAS LEGADAS: retrocompatibilidade ─────────────────────────────────────
# Mantidas para não quebrar o DivinePrideImportButton.tsx existente

@router.get("/import/item/{item_id}")
async def import_item_legacy(
    item_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """[Legado] Delega para a nova rota /preview/item/."""
    return await preview_item(item_id, x_divine_pride_key, api_key)


@router.get("/import/skill/{skill_id}")
async def import_skill_legacy(
    skill_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """[Legado] Delega para a nova rota /preview/skill/."""
    return await preview_skill(skill_id, x_divine_pride_key, api_key)


@router.get("/import/experience/{exp_type}")
@router.get("/import/experience")
async def import_experience_legacy(
    exp_type: str = "normal",
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """[Legado] Delega para a nova rota /preview/experience/."""
    return await preview_experience(exp_type, x_divine_pride_key, api_key)


@router.get("/import/{resource_type}/{resource_id}")
async def import_resource_legacy(
    resource_type: str,
    resource_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """[Legado] Rota genérica — delega para as novas rotas específicas."""
    rt = resource_type.lower()
    if rt in ("monster", "mob"):
        return await preview_monster(resource_id, x_divine_pride_key, api_key)
    if rt == "item":
        return await preview_item(resource_id, x_divine_pride_key, api_key)
    if rt == "skill":
        return await preview_skill(resource_id, x_divine_pride_key, api_key)
    raise HTTPException(
        status_code=400,
        detail=f"Tipo de recurso inválido: '{resource_type}'. Use 'monster', 'item' ou 'skill'.",
    )
