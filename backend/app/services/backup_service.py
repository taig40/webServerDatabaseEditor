"""backup_service.py — Stateless service for creating and restoring rAthena database backups.

Responsibilities:
- ``collect_server_files``: Enumerate db/ sub-directories relevant to the configured mode.
- ``collect_client_files``: Enumerate .lua/.lub files managed by the editor.
- ``create_backup``: Compress collected files into a timestamped .zip archive.
- ``restore_backup``: Extract a .zip archive to its original paths with zip-slip protection.

All functions are stateless and pure — they do not reference global parser instances.
The API layer (api/backup.py) is responsible for wiring env-vars and calling these functions.
"""

import os
import zipfile
from datetime import datetime
from pathlib import Path
from typing import List, Tuple, Literal

BackupScope = Literal["server", "client", "full"]


# ─── File Collection ──────────────────────────────────────────────────────────

def collect_server_files(db_base_path: str) -> List[Tuple[str, str]]:
    """Collects all files from the server db/ directories that should be backed up.

    Includes both db/import/ (customisations) and db/re/ or db/pre-re/ (base data).

    Args:
        db_base_path: Absolute path to the rAthena db/ folder.

    Returns:
        List of (absolute_src_path, archive_internal_path) tuples.
    """
    targets: List[Tuple[str, str]] = []

    if not db_base_path or not os.path.isdir(db_base_path):
        return targets

    import_dir = os.path.join(db_base_path, "import")
    re_dir = os.path.join(db_base_path, "re")
    prere_dir = os.path.join(db_base_path, "pre-re")

    dirs_to_backup = []
    if os.path.isdir(import_dir):
        dirs_to_backup.append(import_dir)
    if os.path.isdir(re_dir):
        dirs_to_backup.append(re_dir)
    elif os.path.isdir(prere_dir):
        dirs_to_backup.append(prere_dir)

    db_base_resolved = Path(db_base_path).resolve()

    for source_dir in dirs_to_backup:
        for root, _, files in os.walk(source_dir):
            for filename in files:
                abs_path = Path(root) / filename
                try:
                    rel_path = abs_path.relative_to(db_base_resolved)
                    targets.append((str(abs_path), str(rel_path).replace("\\", "/")))
                except ValueError:
                    continue

    return targets


def collect_client_files(
    iteminfo_path: str,
    achievements_lua_path: str,
    quests_lua_path: str,
) -> List[Tuple[str, str]]:
    """Collects .lua/.lub client files managed by the editor.

    Args:
        iteminfo_path: Absolute path to the iteminfo .lub file.
        achievements_lua_path: Absolute path to the achievements lua file.
        quests_lua_path: Absolute path to the quest list lua file.

    Returns:
        List of (absolute_src_path, archive_internal_path) tuples under ``client/``.
    """
    targets: List[Tuple[str, str]] = []
    seen: set = set()

    for file_path in [iteminfo_path, achievements_lua_path, quests_lua_path]:
        if not file_path:
            continue
        abs_path = Path(file_path).resolve()
        if str(abs_path) in seen:
            continue
        if not abs_path.is_file():
            continue
        seen.add(str(abs_path))
        targets.append((str(abs_path), f"client/{abs_path.name}"))

    return targets


# ─── Create Backup ────────────────────────────────────────────────────────────

def create_backup(
    scope: BackupScope,
    dest_dir: str,
    db_base_path: str,
    iteminfo_path: str,
    achievements_lua_path: str,
    quests_lua_path: str,
) -> str:
    """Creates a timestamped .zip backup of the requested scope.

    Args:
        scope: ``"server"``, ``"client"``, or ``"full"``.
        dest_dir: Destination folder where the .zip will be written.
        db_base_path: Absolute path to the rAthena db/ folder.
        iteminfo_path: Absolute path to the client iteminfo file.
        achievements_lua_path: Absolute path to the achievements lua file.
        quests_lua_path: Absolute path to the quest lua file.

    Returns:
        Absolute path to the created .zip file (forward slashes).

    Raises:
        ValueError: If dest_dir does not exist or no files were collected.
        OSError: If writing the zip archive fails.
    """
    dest_path = Path(dest_dir).resolve()
    if not dest_path.is_dir():
        raise ValueError(f"Destination directory does not exist: {dest_dir}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    scope_tag = {"server": "server", "client": "client", "full": "full"}[scope]
    zip_name = f"backup_{scope_tag}_{timestamp}.zip"
    zip_path = dest_path / zip_name

    files: List[Tuple[str, str]] = []
    if scope in ("server", "full"):
        files.extend(collect_server_files(db_base_path))
    if scope in ("client", "full"):
        files.extend(collect_client_files(iteminfo_path, achievements_lua_path, quests_lua_path))

    if not files:
        raise ValueError(
            f"No files found for scope '{scope}'. "
            "Verify that the paths are configured correctly in Settings."
        )

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for abs_src, arc_name in files:
            zf.write(abs_src, arc_name)

    return str(zip_path).replace("\\", "/")


# ─── Restore Backup ───────────────────────────────────────────────────────────

def restore_backup(
    zip_path: str,
    scope: BackupScope,
    db_base_path: str,
    iteminfo_path: str,
    achievements_lua_path: str,
    quests_lua_path: str,
) -> int:
    """Restores files from a .zip backup to their original locations.

    Uses zip-slip protection: any archive entry that would write outside the
    expected destination directory is silently skipped.

    Args:
        zip_path: Absolute path to the .zip archive.
        scope: ``"server"``, ``"client"``, or ``"full"``.
        db_base_path: Absolute path to the rAthena db/ folder.
        iteminfo_path: Absolute path to the client iteminfo file.
        achievements_lua_path: Absolute path to the achievements lua file.
        quests_lua_path: Absolute path to the quest lua file.

    Returns:
        Number of files successfully restored.

    Raises:
        ValueError: If zip_path does not exist or is not a valid zip.
        OSError: If extraction fails due to a filesystem error.
    """
    zip_file = Path(zip_path).resolve()
    if not zip_file.is_file():
        raise ValueError(f"Archive not found: {zip_path}")
    if not zipfile.is_zipfile(zip_file):
        raise ValueError(f"Not a valid zip archive: {zip_path}")

    restored_count = 0
    db_base_resolved = Path(db_base_path).resolve() if db_base_path else None

    # Build a lookup of client filename → absolute destination path
    client_file_map: dict = {}
    for cpath in [iteminfo_path, achievements_lua_path, quests_lua_path]:
        if cpath:
            p = Path(cpath).resolve()
            if p.is_file():
                client_file_map[p.name] = p

    with zipfile.ZipFile(zip_file, "r") as zf:
        for member in zf.infolist():
            arc_name = member.filename.replace("\\", "/")

            if arc_name.startswith("client/"):
                filename = arc_name[len("client/"):]
                dest_file = client_file_map.get(filename)
                if dest_file is None:
                    continue
            else:
                if db_base_resolved is None:
                    continue
                dest_file = db_base_resolved / arc_name
                # Zip-slip protection
                if not str(dest_file.resolve()).startswith(str(db_base_resolved)):
                    continue

            os.makedirs(dest_file.parent, exist_ok=True)
            with zf.open(member) as src, open(dest_file, "wb") as dst:
                dst.write(src.read())
            restored_count += 1

    return restored_count
