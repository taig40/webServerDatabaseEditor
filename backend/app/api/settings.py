"""settings.py — Settings API: read and write backend ``.env`` configuration at runtime.

Endpoints:

- ``GET  /api/settings``         — Return current configuration.
- ``PUT  /api/settings``         — Save new configuration to ``.env``.
- ``POST /api/settings/reload``  — Apply new paths without restarting the server.
- ``GET  /api/settings/validate`` — Validate all configured paths.
- ``POST /api/settings/browse``  — Open native OS file/folder picker dialog.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import re
from app.core.config import cfg, ENV_PATH, get_env_path

router = APIRouter()

MAX_GRF_SLOTS = 10


def _get_env_path() -> str:
    """Returns the absolute path to the backend ``.env`` configuration file."""
    return get_env_path()


def _read_env() -> dict:
    """Parses the ``.env`` file and returns a ``key → value`` dict.

    Silently returns an empty dict if the file does not exist.

    Returns:
        dict: Parsed key-value pairs (comments and blank lines are skipped).
    """
    env_path = _get_env_path()
    result = {}
    if not os.path.exists(env_path):
        return result
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                result[key.strip()] = val.strip()
    return result


def _write_env(data: dict):
    """Writes ``key=value`` pairs back to the ``.env`` file, preserving existing comments.

    Keys already present in the file are updated in-place.  New keys are appended
    at the end of the file.

    Args:
        data: Dict of ``{KEY: value}`` pairs to persist.
    """
    env_path = _get_env_path()
    existing_lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            existing_lines = f.readlines()

    managed_keys = set(data.keys())

    new_lines = []
    written_keys = set()
    for line in existing_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=")[0].strip()
            if key in managed_keys:
                new_lines.append(f"{key}={data[key]}\n")
                written_keys.add(key)
                continue
        new_lines.append(line)

    for key, val in data.items():
        if key not in written_keys:
            new_lines.append(f"{key}={val}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)


class GRFEntry(BaseModel):
    """A single GRF file slot with a load priority."""

    priority: int  # 0 = highest priority; 9 = lowest priority
    path: str


class SettingsPayload(BaseModel):
    server_db_base_path: Optional[str] = ""
    iteminfo_path: Optional[str] = ""
    grf_list: list[GRFEntry] = []
    grf_override_path: Optional[str] = ""
    cors_origins: Optional[str] = ""
    server_encoding: Optional[str] = "utf-8"
    client_encoding: Optional[str] = "euc-kr"
    achievements_lua_path: Optional[str] = ""
    quests_lua_path: Optional[str] = ""


@router.get("")
async def get_settings():
    """Returns the current settings object built from the ``.env`` file.

    Supports both the current multi-slot ``GRF_0``–``GRF_9`` format and the
    legacy ``GRF_PATH`` key for backwards-compatibility.

    Returns:
        dict: Current configuration values.
    """
    env = _read_env()

    grf_list = []
    for i in range(MAX_GRF_SLOTS):
        val = env.get(f"GRF_{i}", "").strip()
        if val:
            grf_list.append({"priority": i, "path": val})

    if not grf_list:
        old_grf = env.get("GRF_PATH", "").strip()
        if old_grf:
            grf_list.append({"priority": 0, "path": old_grf})

    return {
        "server_db_base_path": env.get("RATHENA_DB_PATH", "") or env.get("SERVER_DB_BASE_PATH", ""),
        "iteminfo_path": env.get("ITEMINFO_PATH", ""),
        "grf_list": grf_list,
        "grf_override_path": env.get("GRF_OVERRIDE_PATH", ""),
        "cors_origins": env.get("CORS_ORIGINS", ""),
        "server_encoding": env.get("SERVER_ENCODING", "utf-8") or "utf-8",
        "client_encoding": env.get("CLIENT_ENCODING", "euc-kr") or "euc-kr",
        "achievements_lua_path": env.get("ACHIEVEMENTS_LUA_PATH", ""),
        "quests_lua_path": env.get("QUESTS_LUA_PATH", ""),
    }


@router.put("")
async def save_settings(payload: SettingsPayload):
    """Saves new settings to ``.env``.

    Args:
        payload: New settings payload.

    Returns:
        dict: ``{"status": "saved"}``.

    Raises:
        HTTPException: 400 if more than 10 GRF files are provided.
    """
    if len(payload.grf_list) > MAX_GRF_SLOTS:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_GRF_SLOTS} GRF files allowed."
        )

    if payload.iteminfo_path and os.path.exists(payload.iteminfo_path):
        from app.core.utils import read_file_safely
        read_file_safely(payload.iteminfo_path, payload.client_encoding or "euc-kr")

    db_base = payload.server_db_base_path or ""
    if db_base:
        mob_skill_path = os.path.join(db_base, "re/mob_skill_db.txt").replace("\\", "/")
        if not os.path.exists(mob_skill_path):
            mob_skill_path = os.path.join(db_base, "pre-re/mob_skill_db.txt").replace("\\", "/")
    else:
        mob_skill_path = ""
    if mob_skill_path and os.path.exists(mob_skill_path):
        from app.core.utils import read_file_safely
        read_file_safely(mob_skill_path, payload.server_encoding or "utf-8")

    updates: dict = {
        "RATHENA_DB_PATH": payload.server_db_base_path or "",
        "SERVER_DB_BASE_PATH": payload.server_db_base_path or "",
        "ITEMINFO_PATH": payload.iteminfo_path or "",
        "GRF_OVERRIDE_PATH": payload.grf_override_path or "",
        "CORS_ORIGINS": payload.cors_origins or "",
        "SERVER_ENCODING": payload.server_encoding or "utf-8",
        "CLIENT_ENCODING": payload.client_encoding or "euc-kr",
        "ACHIEVEMENTS_LUA_PATH": payload.achievements_lua_path or "",
        "QUESTS_LUA_PATH": payload.quests_lua_path or "",
    }

    for i in range(MAX_GRF_SLOTS):
        updates[f"GRF_{i}"] = ""

    for entry in payload.grf_list:
        p = max(0, min(MAX_GRF_SLOTS - 1, entry.priority))
        updates[f"GRF_{p}"] = entry.path.strip()

    env = _read_env()
    if "GRF_PATH" in env:
        updates["GRF_PATH"] = ""

    _write_env(updates)

    for key, val in updates.items():
        os.environ[key] = val

    cfg.reload_from_env()

    return {"status": "saved"}


@router.post("/reload")
async def reload_settings():
    """Reloads all services from the current ``.env`` settings."""
    env = _read_env()
    from app.core.utils import read_file_safely

    iteminfo_path = env.get("ITEMINFO_PATH", "").strip()
    if iteminfo_path and os.path.exists(iteminfo_path):
        read_file_safely(iteminfo_path, env.get("CLIENT_ENCODING", "euc-kr") or "euc-kr")

    db_base = env.get("SERVER_DB_BASE_PATH", "").strip()
    mob_skill_path = os.path.join(db_base, "re/mob_skill_db.txt").replace("\\", "/") if db_base else ""
    if mob_skill_path and os.path.exists(mob_skill_path):
        read_file_safely(mob_skill_path, env.get("SERVER_ENCODING", "utf-8") or "utf-8")

    for key, val in env.items():
        os.environ[key] = val

    cfg.reload_from_env()

    from app.services.grf_reader import grf_reader, MAX_GRF_SLOTS as _MAX

    grf_list = []
    for i in range(_MAX):
        path = env.get(f"GRF_{i}", "").strip()
        if not path:
            path = env.get("GRF_PATH", "").strip() if i == 0 else ""
        if path:
            grf_list.append({"priority": i, "path": path})

    override_path = env.get("GRF_OVERRIDE_PATH", "").strip()
    grf_reader.load_multi(grf_list, override_path=override_path)

    reloaded = []

    db_base = env.get("SERVER_DB_BASE_PATH", "").strip()

    def _path(key: str, fallback: str) -> str:
        v = env.get(key, "").strip()
        if v:
            return v
        if db_base:
            return os.path.join(db_base, fallback).replace("\\", "/")
        return ""

    from app.services.yaml_parser import yaml_db
    item_path = _path("ITEM_DB_PATH", "re/item_db.yml")
    if item_path:
        yaml_db.load_db_async(item_path)
        reloaded.append(f"item_db -> {item_path}")

    from app.services.mob_parser import mob_db
    mob_path = _path("MOB_DB_PATH", "re/mob_db.yml")
    if mob_path:
        mob_db.load_db_async(mob_path)
        reloaded.append(f"mob_db -> {mob_path}")

    from app.services.skill_parser import skill_db
    skill_path = _path("SKILL_DB_PATH", "re/skill_db.yml")
    if skill_path:
        skill_db.load_db_async(skill_path)
        reloaded.append(f"skill_db -> {skill_path}")

    from app.services.mob_skill_parser import mob_skill_db
    mob_skill_path = _path("MOB_SKILL_DB_PATH", "re/mob_skill_db.txt")
    if mob_skill_path:
        mob_skill_db.load_db_async(mob_skill_path)
        reloaded.append(f"mob_skill_db -> {mob_skill_path}")

    from app.services.combo_parser import combo_db
    combo_path = _path("COMBO_DB_PATH", "re/item_combos.yml")
    if combo_path:
        combo_db.load_db_async(combo_path)
        reloaded.append(f"combo_db -> {combo_path}")

    from app.services.quest_parser import quest_db
    quest_path = _path("QUEST_DB_PATH", "re/quest_db.yml")
    if quest_path:
        quest_db.client_loaded = False
        quest_db.load_db_async(quest_path)
        reloaded.append(f"quest_db -> {quest_path}")

    from app.services.pet_parser import pet_db
    pet_path = _path("PET_DB_PATH", "re/pet_db.yml")
    if pet_path:
        pet_db.load_db_async(pet_path)
        reloaded.append(f"pet_db -> {pet_path}")

    from app.services.achievement_parser import achievement_db
    achievement_path = _path("ACHIEVEMENT_DB_PATH", "re/achievement_db.yml")
    if achievement_path:
        achievement_db.client_loaded = False
        achievement_db.load_db_async(achievement_path)
        reloaded.append(f"achievement_db -> {achievement_path}")

    from app.services.const_parser import const_db
    const_path = _path("CONST_DB_PATH", "const.yml")
    if const_path:
        const_db.load_db_async(const_path)
        reloaded.append(f"const_db -> {const_path}")

    from app.services.iteminfo_parser import iteminfo_db
    iteminfo_path = env.get("ITEMINFO_PATH", "").strip()
    if iteminfo_path:
        iteminfo_db.load_background(iteminfo_path)
        reloaded.append(f"iteminfo -> {iteminfo_path}")

    from app.services.randomopt_parser import randomopt_db
    randomopt_db.initialize()
    reloaded.append("randomopt_db")

    from app.services.sizefix_parser import sizefix_db
    sizefix_db.initialize()
    reloaded.append("sizefix_db")

    from app.services.shop_parser_service import shop_service
    shop_service.load_async()
    reloaded.append("shop_service")

    return {
        "status": "reloaded",
        "grf_count": len(grf_list),
        "reloaded_dbs": reloaded,
    }


@router.get("/validate")
async def validate_settings():
    """Checks all configured paths and returns their status.

    Returns:
        dict: A ``{key: {"status": ..., "exists": bool, "path": str}}`` map for
            each configured path key.
    """
    env = _read_env()
    results = {}

    def _check(key: str, path: str):
        if not path:
            results[key] = {"status": "empty", "exists": False}
        elif os.path.exists(path):
            results[key] = {"status": "ok", "exists": True, "path": path}
        else:
            results[key] = {"status": "not_found", "exists": False, "path": path}

    _check("SERVER_DB_BASE_PATH", env.get("SERVER_DB_BASE_PATH", ""))
    _check("ITEMINFO_PATH", env.get("ITEMINFO_PATH", ""))
    _check("GRF_OVERRIDE_PATH", env.get("GRF_OVERRIDE_PATH", ""))
    _check("ACHIEVEMENTS_LUA_PATH", env.get("ACHIEVEMENTS_LUA_PATH", ""))
    _check("QUESTS_LUA_PATH", env.get("QUESTS_LUA_PATH", ""))

    for i in range(MAX_GRF_SLOTS):
        val = env.get(f"GRF_{i}", "").strip()
        if val:
            _check(f"GRF_{i}", val)

    # Expose legacy GRF_PATH entry if no multi-slot keys are configured
    old_grf = env.get("GRF_PATH", "").strip()
    if old_grf and not any(env.get(f"GRF_{i}", "").strip() for i in range(MAX_GRF_SLOTS)):
        _check("GRF_PATH (legacy)", old_grf)

    return results


@router.post("/browse")
def browse_path(payload: dict):
    """Opens a native directory or file chooser dialog on the host OS.

    Runs synchronously on a thread pool so it does not block the async event loop.
    The hidden tkinter root window is destroyed immediately after selection.

    Args:
        payload: ``{"type": "dir" | "file", "initial": str, "ext": str}``.

    Returns:
        dict: ``{"path": str}`` with forward-slash separators.
    """
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.wm_attributes("-topmost", True)

    dialog_type = payload.get("type", "dir")
    initial_dir = payload.get("initial", "")
    if initial_dir and not os.path.exists(initial_dir):
        initial_dir = ""

    selected_path = ""
    if dialog_type == "dir":
        selected_path = filedialog.askdirectory(
            initialdir=initial_dir,
            title="Select Folder / Selecionar Pasta"
        )
    elif dialog_type == "file":
        ext = payload.get("ext", "")
        filetypes = [("All Files", "*.*")]
        if ext == "lua":
            filetypes = [("Lua Files", "*.lua;*.lub"), ("All Files", "*.*")]
        elif ext == "grf":
            filetypes = [("GRF Files", "*.grf"), ("All Files", "*.*")]
        selected_path = filedialog.askopenfilename(
            initialdir=initial_dir,
            filetypes=filetypes,
            title="Select File / Selecionar Arquivo"
        )

    root.destroy()
    return {"path": selected_path.replace("\\", "/")}

