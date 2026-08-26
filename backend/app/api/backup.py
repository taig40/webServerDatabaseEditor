"""backup.py — Backup & Restore API for the rAthena Web Editor.

Endpoints:

- ``POST /api/backup/browse-dest``  — Open native folder picker and return the selected path.
- ``POST /api/backup/browse-zip``   — Open native file picker filtered to .zip files.
- ``POST /api/backup/create``       — Generate a timestamped .zip backup (runs off the event loop).
- ``POST /api/backup/restore``      — Restore files from a chosen .zip (runs off the event loop).
- ``GET  /api/backup/list``         — List .zip files inside a given directory.
"""

import asyncio
import os
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from app.core.config import cfg

router = APIRouter()


# ─── DTOs ─────────────────────────────────────────────────────────────────────

class _rAthenaBaseModel(BaseModel):
    """Shared Pydantic config: silently discard unknown keys from the frontend."""
    model_config = ConfigDict(extra="ignore")


class BackupCreateRequest(_rAthenaBaseModel):
    scope: Literal["server", "client", "full"]
    dest_dir: str


class BackupRestoreRequest(_rAthenaBaseModel):
    zip_path: str
    scope: Literal["server", "client", "full"]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_env_paths() -> dict:
    """Reads all relevant env-vars required by the backup service."""
    return {
        "db_base_path":           os.environ.get("SERVER_DB_BASE_PATH", "").strip()
                                  or os.environ.get("RATHENA_DB_PATH", "").strip(),
        "iteminfo_path":          os.environ.get("ITEMINFO_PATH", "").strip(),
        "achievements_lua_path":  cfg.achievements_lua_path or "",
        "quests_lua_path":        cfg.quests_lua_path or "",
    }


def _open_dir_picker(initial: str = "") -> str:
    """Runs the tkinter folder picker synchronously and returns the selected path."""
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.wm_attributes("-topmost", True)
    if initial and not os.path.exists(initial):
        initial = ""
    selected = filedialog.askdirectory(
        initialdir=initial,
        title="Select Backup Destination / Selecionar Destino do Backup",
    )
    root.destroy()
    return selected.replace("\\", "/") if selected else ""


def _open_zip_picker(initial: str = "") -> str:
    """Runs the tkinter file picker (filtered to .zip) and returns the selected path."""
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.wm_attributes("-topmost", True)
    if initial and not os.path.exists(initial):
        initial = ""
    selected = filedialog.askopenfilename(
        initialdir=initial,
        filetypes=[("ZIP Archives", "*.zip"), ("All Files", "*.*")],
        title="Select Backup File / Selecionar Arquivo de Backup",
    )
    root.destroy()
    return selected.replace("\\", "/") if selected else ""


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/browse-dest")
def browse_dest(payload: dict = {}):
    """Opens a native folder picker and returns the selected directory path.

    Runs synchronously in FastAPI's thread pool (called from a sync def) so the
    blocking tkinter call does not stall the async event loop.

    Args:
        payload: Optional ``{"initial": str}`` to seed the dialog's starting directory.

    Returns:
        dict: ``{"path": str}`` with the selected folder path (forward slashes) or empty string.
    """
    initial = payload.get("initial", "") if isinstance(payload, dict) else ""
    selected = _open_dir_picker(initial)
    return {"path": selected}


@router.post("/browse-zip")
def browse_zip(payload: dict = {}):
    """Opens a native file picker filtered to .zip files for restore selection.

    Args:
        payload: Optional ``{"initial": str}`` to seed the dialog's starting directory.

    Returns:
        dict: ``{"path": str}`` with the selected .zip file path or empty string.
    """
    initial = payload.get("initial", "") if isinstance(payload, dict) else ""
    selected = _open_zip_picker(initial)
    return {"path": selected}


@router.post("/create")
async def create_backup(payload: BackupCreateRequest):
    """Creates a timestamped .zip backup of the requested scope.

    Runs the CPU-bound compression in a thread pool via ``asyncio.to_thread``
    so the FastAPI event loop remains responsive during long operations.

    Args:
        payload: ``{scope, dest_dir}``.

    Returns:
        dict: ``{"status": "ok", "filename": str, "path": str, "file_count": int}``.

    Raises:
        HTTPException 400: If dest_dir does not exist or no files are collected.
        HTTPException 500: If the zip creation fails unexpectedly.
    """
    from app.services.backup_service import create_backup as svc_create

    paths = _get_env_paths()

    try:
        zip_path = await asyncio.to_thread(
            svc_create,
            scope=payload.scope,
            dest_dir=payload.dest_dir,
            db_base_path=paths["db_base_path"],
            iteminfo_path=paths["iteminfo_path"],
            achievements_lua_path=paths["achievements_lua_path"],
            quests_lua_path=paths["quests_lua_path"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Filesystem error: {exc}")

    import zipfile
    file_count = 0
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            file_count = len(zf.namelist())
    except Exception:
        pass

    return {
        "status": "ok",
        "filename": os.path.basename(zip_path),
        "path": zip_path,
        "file_count": file_count,
    }


@router.post("/restore")
async def restore_backup(payload: BackupRestoreRequest):
    """Restores files from a .zip backup to their original locations.

    Uses zip-slip protection inside the service layer. Runs off the event loop
    via ``asyncio.to_thread``.

    Args:
        payload: ``{zip_path, scope}``.

    Returns:
        dict: ``{"status": "ok", "restored_count": int}``.

    Raises:
        HTTPException 400: If the zip file is invalid or not found.
        HTTPException 500: If a filesystem error occurs during extraction.
    """
    from app.services.backup_service import restore_backup as svc_restore

    paths = _get_env_paths()

    try:
        restored_count = await asyncio.to_thread(
            svc_restore,
            zip_path=payload.zip_path,
            scope=payload.scope,
            db_base_path=paths["db_base_path"],
            iteminfo_path=paths["iteminfo_path"],
            achievements_lua_path=paths["achievements_lua_path"],
            quests_lua_path=paths["quests_lua_path"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Filesystem error: {exc}")

    return {"status": "ok", "restored_count": restored_count}


@router.get("/list")
def list_backups(dir: Optional[str] = None):
    """Lists .zip files inside the given directory, sorted by modification time (newest first).

    Args:
        dir: Query parameter — the folder path to scan. Returns empty list if not provided.

    Returns:
        dict: ``{"backups": [{"filename": str, "path": str, "size_bytes": int, "modified": float}]}``.
    """
    if not dir or not os.path.isdir(dir):
        return {"backups": []}

    backups = []
    try:
        for entry in os.scandir(dir):
            if entry.is_file() and entry.name.lower().endswith(".zip"):
                stat = entry.stat()
                backups.append({
                    "filename": entry.name,
                    "path": entry.path.replace("\\", "/"),
                    "size_bytes": stat.st_size,
                    "modified": stat.st_mtime,
                })
    except OSError:
        pass

    backups.sort(key=lambda x: x["modified"], reverse=True)
    return {"backups": backups}
