"""
Settings API — Read and write the backend .env configuration at runtime.

Endpoints:
  GET  /api/settings          → Return current configuration
  PUT  /api/settings          → Save new configuration to .env
  POST /api/settings/reload   → Apply new paths without restarting the server
  GET  /api/settings/validate → Validate all paths and return status
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import re
from app.core.config import cfg, ENCODING_OPTIONS, ENV_PATH, get_env_path

router = APIRouter()

MAX_GRF_SLOTS = 10

# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_env_path() -> str:
    return get_env_path()


def _read_env() -> dict:
    """Parse the .env file and return a dict of key → value."""
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
    """Write key-value pairs back to the .env file, preserving comments."""
    env_path = _get_env_path()
    existing_lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            existing_lines = f.readlines()

    # Build a set of keys we want to manage
    managed_keys = set(data.keys())

    # Rewrite existing lines, updating values for managed keys
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

    # Append keys that weren't already in the file
    for key, val in data.items():
        if key not in written_keys:
            new_lines.append(f"{key}={val}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)


# ── Models ─────────────────────────────────────────────────────────────────────

class GRFEntry(BaseModel):
    priority: int   # 0 = highest, 9 = lowest
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


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
async def get_settings():
    """Return the current settings from .env."""
    env = _read_env()

    # Collect GRF list from GRF_0 ... GRF_9
    grf_list = []
    for i in range(MAX_GRF_SLOTS):
        val = env.get(f"GRF_{i}", "").strip()
        if val:
            grf_list.append({"priority": i, "path": val})

    # Migration: if old GRF_PATH exists and no GRF_0, expose as priority 0
    if not grf_list:
        old_grf = env.get("GRF_PATH", "").strip()
        if old_grf:
            grf_list.append({"priority": 0, "path": old_grf})

    return {
        "server_db_base_path": env.get("SERVER_DB_BASE_PATH", ""),
        "iteminfo_path": env.get("ITEMINFO_PATH", ""),
        "grf_list": grf_list,
        "grf_override_path": env.get("GRF_OVERRIDE_PATH", ""),
        "cors_origins": env.get("CORS_ORIGINS", ""),
        "server_encoding": env.get("SERVER_ENCODING", "utf-8") or "utf-8",
        "client_encoding": env.get("CLIENT_ENCODING", "euc-kr") or "euc-kr",
        "achievements_lua_path": env.get("ACHIEVEMENTS_LUA_PATH", ""),
        "quests_lua_path": env.get("QUESTS_LUA_PATH", ""),
        "encoding_options": ENCODING_OPTIONS,
    }


@router.put("")
async def save_settings(payload: SettingsPayload):
    """Save new settings to .env (does NOT reload — call /reload after)."""
    if len(payload.grf_list) > MAX_GRF_SLOTS:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_GRF_SLOTS} GRF files allowed (matching the official RO client DATA.INI limit)."
        )

    # Validate client encoding
    if payload.iteminfo_path and os.path.exists(payload.iteminfo_path):
        from app.core.utils import read_file_safely
        read_file_safely(payload.iteminfo_path, payload.client_encoding or "euc-kr")

    # Validate server encoding
    db_base = payload.server_db_base_path or ""
    mob_skill_path = os.path.join(db_base, "re/mob_skill_db.txt").replace("\\", "/") if db_base else ""
    if mob_skill_path and os.path.exists(mob_skill_path):
        from app.core.utils import read_file_safely
        read_file_safely(mob_skill_path, payload.server_encoding or "utf-8")

    updates: dict = {
        "SERVER_DB_BASE_PATH": payload.server_db_base_path or "",
        "ITEMINFO_PATH": payload.iteminfo_path or "",
        "GRF_OVERRIDE_PATH": payload.grf_override_path or "",
        "CORS_ORIGINS": payload.cors_origins or "",
        "SERVER_ENCODING": payload.server_encoding or "utf-8",
        "CLIENT_ENCODING": payload.client_encoding or "euc-kr",
        "ACHIEVEMENTS_LUA_PATH": payload.achievements_lua_path or "",
        "QUESTS_LUA_PATH": payload.quests_lua_path or "",
    }

    # Clear all GRF slots first, then write only the ones provided
    for i in range(MAX_GRF_SLOTS):
        updates[f"GRF_{i}"] = ""

    for entry in payload.grf_list:
        p = max(0, min(MAX_GRF_SLOTS - 1, entry.priority))
        updates[f"GRF_{p}"] = entry.path.strip()

    # Remove the old single-path key if migrating
    env = _read_env()
    if "GRF_PATH" in env:
        updates["GRF_PATH"] = ""  # blank it out (keep the key so we don't orphan comments)

    _write_env(updates)

    # Apply to os.environ so they take effect in the current process
    for key, val in updates.items():
        os.environ[key] = val

    # Apply encoding changes immediately to the live config object
    cfg.reload_from_env()

    return {"status": "saved"}


@router.post("/reload")
async def reload_settings():
    """
    Reload all services from the current .env settings without restarting.
    This re-initialises the GRF reader, DB parsers and iteminfo.
    """
    env = _read_env()
    from app.core.utils import read_file_safely

    # Validate client encoding
    iteminfo_path = env.get("ITEMINFO_PATH", "").strip()
    if iteminfo_path and os.path.exists(iteminfo_path):
        read_file_safely(iteminfo_path, env.get("CLIENT_ENCODING", "euc-kr") or "euc-kr")

    # Validate server encoding
    db_base = env.get("SERVER_DB_BASE_PATH", "").strip()
    mob_skill_path = os.path.join(db_base, "re/mob_skill_db.txt").replace("\\", "/") if db_base else ""
    if mob_skill_path and os.path.exists(mob_skill_path):
        read_file_safely(mob_skill_path, env.get("SERVER_ENCODING", "utf-8") or "utf-8")

    # Apply to os.environ
    for key, val in env.items():
        os.environ[key] = val

    # Apply encoding to live config object
    cfg.reload_from_env()

    # ── GRF reload ──────────────────────────────────────────────────────
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

    # ── DB reload ───────────────────────────────────────────────────────
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
    """Check all configured paths and return their status."""
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

    # Migration fallback
    old_grf = env.get("GRF_PATH", "").strip()
    if old_grf and not any(env.get(f"GRF_{i}", "").strip() for i in range(MAX_GRF_SLOTS)):
        _check("GRF_PATH (legacy)", old_grf)

    return results


@router.post("/browse")
def browse_path(payload: dict):
    """
    Open a native directory/file chooser dialog on the host OS.
    Runs synchronously on a thread pool so it does not block the async event loop.
    """
    import tkinter as tk
    from tkinter import filedialog
    
    # Hide root window
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

