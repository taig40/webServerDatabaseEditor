import os
from datetime import datetime
from typing import List


def _resolve_rathena_root() -> str:
    """
    Tenta descobrir a raiz do rAthena a partir das variáveis de ambiente.
    SERVER_DB_BASE_PATH = .../rathena/db  →  root = .../rathena
    """
    db_base = os.environ.get("SERVER_DB_BASE_PATH", "").strip()
    if not db_base:
        item_db = os.environ.get("ITEM_DB_PATH", "").strip()
        if item_db and "/re/" in item_db.replace("\\", "/"):
            db_base = item_db.replace("\\", "/").split("/re/")[0]
    if db_base:
        return os.path.dirname(db_base.rstrip("/\\")).replace("\\", "/")
    return ""


def get_spawn_file_path() -> str:
    """
    Retorna o caminho absoluto para npc/custom/ui_spawns.txt.
    """
    root = _resolve_rathena_root()
    if root:
        return f"{root}/npc/custom/ui_spawns.txt"
    # Fallback: pasta atual do processo
    return os.path.join(os.getcwd(), "ui_spawns.txt").replace("\\", "/")


def ensure_spawn_file() -> str:
    """
    Garante que o arquivo e a pasta existam. Retorna o caminho.
    Cria um cabeçalho padrão se o arquivo for novo.
    """
    path = get_spawn_file_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(
                "// ============================================================\n"
                "// ui_spawns.txt — Custom Map Engine Spawns\n"
                "// Gerado automaticamente pelo webServerDatabaseEditor\n"
                "// NÃO edite manualmente — use a interface do Map Engine\n"
                "// ============================================================\n\n"
            )
    return path


def read_spawns() -> dict:
    """
    Lê o arquivo de spawns linha a linha.
    Retorna { lines: [...], file_path: str }
    """
    path = ensure_spawn_file()
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    return {
        "lines": [l.rstrip("\n") for l in lines],
        "file_path": path,
    }


def append_spawn(snippet: str) -> dict:
    """
    Faz append do snippet ao final do arquivo de spawns.
    Garante separação limpa com newline.
    """
    path = ensure_spawn_file()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    block = (
        f"\n// --- Map Engine Inject [{timestamp}] ---\n"
        f"{snippet.rstrip()}\n"
    )

    with open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(block)

    return {
        "success": True,
        "file_path": path,
        "injected": block,
    }
