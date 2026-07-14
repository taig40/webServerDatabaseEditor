import os
from datetime import datetime
from typing import List


def _resolve_rathena_root() -> str:
    from app.core.config import get_rathena_root
    return get_rathena_root()


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


def delete_spawn(line_index: int) -> dict:
    """
    Remove a linha (ou bloco de comentário + spawn) pelo índice de linha real no arquivo.

    Estratégia:
    - Lê todas as linhas do arquivo.
    - Identifica a linha de spawn no índice fornecido (0-based sobre a lista retornada
      por read_spawns(), que já remove os '\\n' finais).
    - Se a linha imediatamente anterior for um comentário de injeção ("// ---"), remove-a também
      para não deixar cabeçalhos de bloco órfãos.
    - Reescreve o arquivo atomicamente via arquivo temporário.

    Args:
        line_index: Índice base-0 da linha de spawn na lista retornada por read_spawns().

    Returns:
        dict com { success, file_path, deleted_line }.

    Raises:
        IndexError: se line_index estiver fora dos limites.
        RuntimeError: se o arquivo não existir.
    """
    path = ensure_spawn_file()

    with open(path, "r", encoding="utf-8") as f:
        raw_lines = f.readlines()   # preserva os '\n' originais para reescrita fiel

    # Monta uma lista paralela sem o '\n' final para expor ao chamador (igual a read_spawns)
    stripped = [l.rstrip("\n") for l in raw_lines]

    if line_index < 0 or line_index >= len(stripped):
        raise IndexError(f"Índice {line_index} fora dos limites (arquivo tem {len(stripped)} linhas).")

    deleted_line = stripped[line_index]

    # Conjunto de índices a remover (começamos com o spawn em si)
    indices_to_remove: set[int] = {line_index}

    # Se a linha anterior for um cabeçalho de bloco gerado pela engine, remove junto
    if line_index > 0 and stripped[line_index - 1].startswith("// --- Map Engine Inject"):
        indices_to_remove.add(line_index - 1)

    # Filtra as linhas removendo os índices marcados
    new_raw_lines = [l for i, l in enumerate(raw_lines) if i not in indices_to_remove]

    # Reescreve atomicamente
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8", newline="\n") as f:
        f.writelines(new_raw_lines)
    os.replace(tmp_path, path)

    return {
        "success": True,
        "file_path": path,
        "deleted_line": deleted_line,
    }
