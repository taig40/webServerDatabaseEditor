"""api/divinepride.py — Router for Divine Pride data import.

Single Responsibility: orchestrates calls between the HTTP client
(``divine_pride_client``) and the transformation adapter (``divine_pride_adapter``),
returning appropriate HTTP responses.  No business logic, no direct HTTP requests.

**Preview (new) routes:**

- ``GET /api/divinepride/preview/item/{id}``
- ``GET /api/divinepride/preview/monster/{id}``
- ``GET /api/divinepride/preview/skill/{id}``
- ``GET /api/divinepride/preview/experience``

**Legacy routes (backwards-compatibility):**

- ``GET /api/divinepride/import/{resource_type}/{resource_id}``
- ``GET /api/divinepride/import/item/{id}``
- ``GET /api/divinepride/import/skill/{id}``
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
    DPNetworkException,
    DPHTTPException,
)
from app.services.divine_pride_adapter import dp_adapter

router = APIRouter()


def _to_yaml_preview(data: dict) -> str:
    """Serializes a dict to YAML formatted in the rAthena style for the preview panel.

    Args:
        data: The dict to serialize.

    Returns:
        str: YAML string.
    """
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
    """Resolves the Divine Pride API key from request headers or query params.

    Args:
        header_key: Value of the ``x-divine-pride-key`` HTTP header.
        query_key: Value of the ``apiKey`` query parameter.

    Returns:
        str: The resolved API key string.

    Raises:
        HTTPException: 400 if neither source provides a key.
    """
    key = (header_key or query_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=400,
            detail="DivinePride API Key não fornecida. Informe via header 'x-divine-pride-key' ou query param 'apiKey'.",
        )
    return key


def _translate_dp_error(exc: Exception, resource_type: str, resource_id) -> HTTPException:
    """Converts typed Divine Pride client exceptions into FastAPI ``HTTPException``s.

    Args:
        exc: The caught exception from the DP client.
        resource_type: Human-readable resource label (e.g. ``"Item"``).
        resource_id: The requested resource ID (used in the error message).

    Returns:
        HTTPException: Mapped HTTP error with an appropriate status code.
    """
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


@router.get("/preview/item/{item_id}")
async def preview_item(
    item_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """Fetches an item from Divine Pride, transforms it via the adapter, and returns a preview.

    Response includes:
    - ``mapped``: dict compatible with ``ItemDBModel`` (ready for ``POST /api/items/``).
    - ``yaml_preview``: formatted YAML string of what will be written to disk.
    - ``raw``: original JSON from Divine Pride (for debugging).

    Args:
        item_id: Numeric item ID.
        x_divine_pride_key: API key from the ``x-divine-pride-key`` header.
        api_key: API key from the ``apiKey`` query parameter (fallback).

    Returns:
        dict: Preview payload with ``success``, ``source``, ``resource``, ``id``,
            ``mapped``, ``yaml_preview``, and ``raw``.

    Raises:
        HTTPException: 400 if no API key; 401/404/502/500 from Divine Pride errors.
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
    """Fetches a monster from Divine Pride, transforms it via the adapter, and returns a preview.

    Args:
        mob_id: Numeric monster ID.
        x_divine_pride_key: API key from the ``x-divine-pride-key`` header.
        api_key: API key from the ``apiKey`` query parameter (fallback).

    Returns:
        dict: ``{"success", "source", "resource", "id", "mapped", "yaml_preview", "raw"}``.

    Raises:
        HTTPException: 400 if no API key; 401/404/502/500 from Divine Pride errors.
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
    """Fetches a skill from Divine Pride, transforms it via the adapter, and returns a preview.

    Args:
        skill_id: Numeric skill ID.
        x_divine_pride_key: API key from the ``x-divine-pride-key`` header.
        api_key: API key from the ``apiKey`` query parameter (fallback).

    Returns:
        dict: ``{"success", "source", "resource", "id", "mapped", "yaml_preview", "raw"}``.

    Raises:
        HTTPException: 400 if no API key; 401/404/502/500 from Divine Pride errors.
    """
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
    """Fetches the experience table from Divine Pride and returns the adapted data.

    Args:
        exp_type: Experience table type (e.g. ``"normal"``, ``"premium"``).
        x_divine_pride_key: API key from the ``x-divine-pride-key`` header.
        api_key: API key from the ``apiKey`` query parameter (fallback).

    Returns:
        dict: ``{"success", "source", "mapped", "raw"}``.

    Raises:
        HTTPException: 400 if no API key; 401/404/502/500 from Divine Pride errors.
    """
    key = _resolve_key(x_divine_pride_key, api_key)
    try:
        raw = dp_client.fetch_experience(key)
    except Exception as e:
        raise _translate_dp_error(e, "Experience", exp_type)

    mapped = dp_adapter.adapt_experience(raw, exp_type=exp_type)
    return {"success": True, "source": "divinepride", "mapped": mapped, "raw": raw}


@router.get("/import/item/{item_id}")
async def import_item_legacy(
    item_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """[Legacy] Delegates to the new ``/preview/item/`` route for backwards-compatibility."""
    return await preview_item(item_id, x_divine_pride_key, api_key)


@router.get("/import/skill/{skill_id}")
async def import_skill_legacy(
    skill_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """[Legacy] Delegates to the new ``/preview/skill/`` route for backwards-compatibility."""
    return await preview_skill(skill_id, x_divine_pride_key, api_key)


@router.get("/import/experience/{exp_type}")
@router.get("/import/experience")
async def import_experience_legacy(
    exp_type: str = "normal",
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """[Legacy] Delegates to the new ``/preview/experience/`` route for backwards-compatibility."""
    return await preview_experience(exp_type, x_divine_pride_key, api_key)


@router.get("/import/{resource_type}/{resource_id}")
async def import_resource_legacy(
    resource_type: str,
    resource_id: int,
    x_divine_pride_key: Optional[str] = Header(None, alias="x-divine-pride-key"),
    api_key: Optional[str] = Query(None, alias="apiKey"),
):
    """[Legacy] Generic catch-all route — delegates to the appropriate typed preview route.

    Args:
        resource_type: One of ``"monster"`` / ``"mob"``, ``"item"``, or ``"skill"``.
        resource_id: Numeric resource ID.
        x_divine_pride_key: API key from the ``x-divine-pride-key`` header.
        api_key: API key from the ``apiKey`` query parameter (fallback).

    Raises:
        HTTPException: 400 if ``resource_type`` is not recognized.
    """
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
