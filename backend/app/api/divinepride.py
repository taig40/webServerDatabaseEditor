"""api/divinepride.py — Router for Divine Pride data import.

Single Responsibility: orchestrates calls between the HTTP client
(``divine_pride_client``) and the transformation adapter (``divine_pride_adapter``),
returning appropriate HTTP responses.  No business logic, no direct HTTP requests.

**Preview routes:**

- ``GET /api/divinepride/preview/item/{id}``
- ``GET /api/divinepride/preview/monster/{id}``
- ``GET /api/divinepride/preview/skill/{id}``
- ``GET /api/divinepride/preview/quest/{id}``
- ``GET /api/divinepride/preview/efst/{id}``
- ``GET /api/divinepride/preview/experience``

**Legacy routes (backwards-compatibility):**

- ``GET /api/divinepride/import/{resource_type}/{resource_id}``
- ``GET /api/divinepride/import/item/{id}``
- ``GET /api/divinepride/import/skill/{id}``
- ``GET /api/divinepride/import/quest/{id}``
- ``GET /api/divinepride/import/efst/{id}``
- ``GET /api/divinepride/import/experience``
"""

from fastapi import APIRouter, Header, HTTPException, Query
from typing import Optional
from io import StringIO
from ruamel.yaml import YAML

from app.clients.divine_pride_client import (
    dp_client,
    DPNotFoundException,
    DPAuthException,
    DPRateLimitException,
    DPNetworkException,
    DPHTTPException,
)
from app.services.divine_pride_adapter import dp_adapter

router = APIRouter()


def _to_yaml_preview(data: dict) -> str:
    """Serializes a dict to YAML formatted in the rAthena style for the preview panel."""
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.indent(mapping=2, sequence=4, offset=2)
    buf = StringIO()
    yaml.dump(data, buf)
    return buf.getvalue()


def _resolve_key(
    header_key: Optional[str],
    query_key: Optional[str],
) -> str:
    """Resolves the Divine Pride API key from request headers or query params."""
    key = (header_key or query_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=400,
            detail="DivinePride API Key não fornecida. Informe via header 'x-divine-pride-key' ou query param 'apiKey'.",
        )
    return key


def _resolve_server(header_server: Optional[str], query_server: Optional[str]) -> Optional[str]:
    server = (header_server or query_server or "").strip()
    return server if server else None


def _resolve_language(header_lang: Optional[str], query_lang: Optional[str]) -> Optional[str]:
    lang = (header_lang or query_lang or "").strip()
    return lang if lang else None


def _translate_dp_error(exc: Exception, resource_type: str, resource_id) -> HTTPException:
    """Converts typed Divine Pride client exceptions into FastAPI ``HTTPException``s."""
    if isinstance(exc, DPRateLimitException):
        return HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": str(exc.retry_after)},
        )
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


def _build_combo_previews(combos: list) -> list:
    """Serializes adapter combo descriptors into YAML-with-comments preview strings."""
    results = []
    for c in combos:
        comment_lines = [c["_yaml_comment"]]
        if c.get("_visual_script_note"):
            comment_lines.append(c["_visual_script_note"])

        combo_data: dict = {
            "Combos": [{"Combo": c["combo_items"]}],
        }
        if c["script"] is not None:
            combo_data["Script"] = str(c["script"])

        yaml_block = _to_yaml_preview(combo_data)
        combo_yaml = "\n".join(comment_lines) + "\n" + yaml_block

        results.append({
            "combo_yaml":            combo_yaml,
            "has_missing_items":     c["has_missing_items"],
            "original_ids":          c["original_ids"],
            "script_is_server_side": c["script_is_server_side"],
            "combo_data":            combo_data,
        })
    return results


@router.get("/preview/item/{item_id}")
async def preview_item(
    item_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """Fetches an item from Divine Pride, transforms it via the adapter, and returns a preview."""
    key = _resolve_key(x_divine_pride_key, api_key)
    srv = _resolve_server(x_server, server)
    lng = _resolve_language(accept_language, language)
    try:
        raw = dp_client.fetch_item(item_id, key, server=srv, language=lng)
    except Exception as e:
        raise _translate_dp_error(e, "Item", item_id)

    mapped = dp_adapter.adapt_item(raw)
    combo_previews = _build_combo_previews(dp_adapter.adapt_item_combos(raw, item_id))

    return {
        "success":      True,
        "source":       "divinepride",
        "resource":     "item",
        "id":           item_id,
        "mapped":       mapped,
        "yaml_preview": _to_yaml_preview(mapped),
        "combos":       combo_previews,
        "raw":          raw,
    }


@router.get("/preview/monster/{mob_id}")
async def preview_monster(
    mob_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """Fetches a monster from Divine Pride, transforms it via the adapter, and returns a preview."""
    key = _resolve_key(x_divine_pride_key, api_key)
    srv = _resolve_server(x_server, server)
    lng = _resolve_language(accept_language, language)
    try:
        raw = dp_client.fetch_monster(mob_id, key, server=srv, language=lng)
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
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """Fetches a skill from Divine Pride, transforms it via the adapter, and returns a preview."""
    key = _resolve_key(x_divine_pride_key, api_key)
    srv = _resolve_server(x_server, server)
    lng = _resolve_language(accept_language, language)
    try:
        raw = dp_client.fetch_skill(skill_id, key, server=srv, language=lng)
    except Exception as e:
        raise _translate_dp_error(e, "Skill", skill_id)

    mapped = dp_adapter.adapt_skill(raw)
    return {
        "success":      True,
        "source":       "divinepride",
        "resource":     "skill",
        "id":           skill_id,
        "mapped":       mapped,
        "yaml_preview": _to_yaml_preview(mapped),
        "raw":          raw,
    }


@router.get("/preview/quest/{quest_id}")
async def preview_quest(
    quest_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """Fetches a quest from Divine Pride, transforms it via the adapter, and returns a preview."""
    key = _resolve_key(x_divine_pride_key, api_key)
    srv = _resolve_server(x_server, server)
    lng = _resolve_language(accept_language, language)
    try:
        raw = dp_client.fetch_quest(quest_id, key, server=srv, language=lng)
    except Exception as e:
        raise _translate_dp_error(e, "Quest", quest_id)

    mapped = dp_adapter.adapt_quest(raw)
    return {
        "success":      True,
        "source":       "divinepride",
        "resource":     "quest",
        "id":           quest_id,
        "mapped":       mapped,
        "yaml_preview": _to_yaml_preview(mapped),
        "raw":          raw,
    }


@router.get("/preview/efst/{efst_id}")
async def preview_efst(
    efst_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """Fetches an status effect (efst) from Divine Pride and returns a preview."""
    key = _resolve_key(x_divine_pride_key, api_key)
    srv = _resolve_server(x_server, server)
    lng = _resolve_language(accept_language, language)
    try:
        raw = dp_client.fetch_efst(efst_id, key, server=srv, language=lng)
    except Exception as e:
        raise _translate_dp_error(e, "Efst", efst_id)

    mapped = dp_adapter.adapt_efst(raw)
    return {
        "success":      True,
        "source":       "divinepride",
        "resource":     "efst",
        "id":           efst_id,
        "mapped":       mapped,
        "yaml_preview": _to_yaml_preview(mapped),
        "raw":          raw,
    }


@router.get("/preview/experience")
@router.get("/preview/experience/{exp_type}")
async def preview_experience(
    exp_type: str = "normal",
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """Fetches the experience table from Divine Pride and returns the adapted data."""
    key = _resolve_key(x_divine_pride_key, api_key)
    srv = _resolve_server(x_server, server)
    lng = _resolve_language(accept_language, language)
    try:
        raw = dp_client.fetch_experience(key, server=srv, language=lng)
    except Exception as e:
        raise _translate_dp_error(e, "Experience", exp_type)

    mapped = dp_adapter.adapt_experience(raw, exp_type=exp_type)
    return {"success": True, "source": "divinepride", "mapped": mapped, "raw": raw}


@router.get("/import/item/{item_id}")
async def import_item_legacy(
    item_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """[Legacy] Delegates to the new ``/preview/item/`` route for backwards-compatibility."""
    return await preview_item(item_id, x_divine_pride_key, api_key, x_server, server, accept_language, language)


@router.get("/import/skill/{skill_id}")
async def import_skill_legacy(
    skill_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """[Legacy] Delegates to the new ``/preview/skill/`` route for backwards-compatibility."""
    return await preview_skill(skill_id, x_divine_pride_key, api_key, x_server, server, accept_language, language)


@router.get("/import/quest/{quest_id}")
async def import_quest_legacy(
    quest_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """[Legacy] Delegates to the new ``/preview/quest/`` route for backwards-compatibility."""
    return await preview_quest(quest_id, x_divine_pride_key, api_key, x_server, server, accept_language, language)


@router.get("/import/efst/{efst_id}")
async def import_efst_legacy(
    efst_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """[Legacy] Delegates to the new ``/preview/efst/`` route for backwards-compatibility."""
    return await preview_efst(efst_id, x_divine_pride_key, api_key, x_server, server, accept_language, language)


@router.get("/import/experience/{exp_type}")
@router.get("/import/experience")
async def import_experience_legacy(
    exp_type: str = "normal",
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """[Legacy] Delegates to the new ``/preview/experience/`` route for backwards-compatibility."""
    return await preview_experience(exp_type, x_divine_pride_key, api_key, x_server, server, accept_language, language)


@router.get("/import/{resource_type}/{resource_id}")
async def import_resource_legacy(
    resource_type: str,
    resource_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
    x_server: Optional[str] = Header(None, alias="x-server"),
    server: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),
    language: Optional[str] = Query(None),
):
    """[Legacy] Generic catch-all route — delegates to the appropriate typed preview route."""
    rt = resource_type.lower()
    if rt in ("monster", "mob"):
        return await preview_monster(resource_id, x_divine_pride_key, api_key, x_server, server, accept_language, language)
    if rt == "item":
        return await preview_item(resource_id, x_divine_pride_key, api_key, x_server, server, accept_language, language)
    if rt == "skill":
        return await preview_skill(resource_id, x_divine_pride_key, api_key, x_server, server, accept_language, language)
    if rt == "quest":
        return await preview_quest(resource_id, x_divine_pride_key, api_key, x_server, server, accept_language, language)
    if rt in ("efst", "status", "statuseffect"):
        return await preview_efst(resource_id, x_divine_pride_key, api_key, x_server, server, accept_language, language)
    raise HTTPException(
        status_code=400,
        detail=f"Tipo de recurso inválido: '{resource_type}'. Use 'monster', 'item', 'skill', 'quest' ou 'efst'.",
    )

