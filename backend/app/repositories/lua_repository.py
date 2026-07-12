"""
lua_repository.py — Repositório de I/O para arquivos iteminfo.lua do Ragnarok Online.

Responsabilidade ÚNICA (SRP): ler e escrever blocos Lua no arquivo iteminfo.lua.
Toda lógica de parse e mapeamento em memória permanece em services/iteminfo_parser.py.

Encoding: sempre latin-1 (byte-transparent) para preservar os bytes EUC-KR nativos.
"""

import os
import re
from typing import Optional


# ─── Templates ────────────────────────────────────────────────────────────────

_BLOCK_TEMPLATE = """\t[{id}] = {{
\t\tunidentifiedDisplayName = "{unIdentifiedDisplayName}",
\t\tunidentifiedResourceName = "{unIdentifiedResourceName}",
\t\tunidentifiedDescriptionName = {{ {unIdentifiedDescriptionName} }},
\t\tidentifiedDisplayName = "{identifiedDisplayName}",
\t\tidentifiedResourceName = "{identifiedResourceName}",
\t\tidentifiedDescriptionName = {{ {identifiedDescriptionName} }},
\t\tslotCount = {slotCount},
\t\tClassNum = {ClassNum},
\t\tcostume = {costume},
\t}},
"""


# ─── Helpers de formatação ────────────────────────────────────────────────────

def escape_lua_string(s: str) -> str:
    """Escapa backslashes e aspas duplas para embedding em string Lua."""
    return s.replace("\\", "\\\\").replace('"', '\\"')


def format_desc_lines(lines: list[str]) -> str:
    """Converte lista de linhas de descrição para o formato inline de array Lua."""
    if not lines:
        return ""
    escaped = [f'"{escape_lua_string(ln)}"' for ln in lines]
    return "\n\t\t\t" + ",\n\t\t\t".join(escaped) + "\n\t\t"


def render_block(item_id: int, fields: dict) -> str:
    """Renderiza o bloco Lua completo para um item ID."""
    uid_desc = format_desc_lines(fields.get("unIdentifiedDescriptionName", []))
    id_desc  = format_desc_lines(fields.get("identifiedDescriptionName",   []))
    costume  = "true" if fields.get("costume", False) else "false"

    return _BLOCK_TEMPLATE.format(
        id                          = item_id,
        unIdentifiedDisplayName     = escape_lua_string(fields.get("unIdentifiedDisplayName", "")),
        unIdentifiedResourceName    = escape_lua_string(fields.get("unIdentifiedResourceName", "")),
        unIdentifiedDescriptionName = uid_desc,
        identifiedDisplayName       = escape_lua_string(fields.get("identifiedDisplayName", "")),
        identifiedResourceName      = escape_lua_string(fields.get("identifiedResourceName", "")),
        identifiedDescriptionName   = id_desc,
        slotCount                   = int(fields.get("slotCount", 0)),
        ClassNum                    = int(fields.get("ClassNum", 0)),
        costume                     = costume,
    )


# ─── I/O ─────────────────────────────────────────────────────────────────────

def find_lua_block_bounds(content: str, item_id: int) -> Optional[tuple[int, int]]:
    """
    Localiza os índices de início e fim exatos do bloco [item_id] = { … } no
    conteúdo Lua, respeitando chaves aninhadas ({}) e strings.

    Retorna (start_idx, end_idx) ou None se não encontrado.
    """
    pattern = re.compile(
        r"^\s*\[\s*" + re.escape(str(item_id)) + r"\s*\]\s*=\s*\{",
        re.MULTILINE
    )
    match = pattern.search(content)
    if not match:
        return None

    start_idx = match.start()
    idx = match.end() - 1  # índice da '{' de abertura do bloco

    depth    = 0
    in_str   = None
    escaped  = False

    while idx < len(content):
        char = content[idx]

        if in_str:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_str:
                in_str = None
        else:
            if char in ('"', "'"):
                in_str = char
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    idx += 1
                    # Inclui vírgula/ponto-e-vírgula/espaços opcionais à direita
                    while idx < len(content) and content[idx] in (" ", "\t", ",", ";"):
                        idx += 1
                    # Inclui o newline final
                    if idx < len(content) and content[idx] == "\n":
                        idx += 1
                    elif idx + 1 < len(content) and content[idx : idx + 2] == "\r\n":
                        idx += 2
                    return (start_idx, idx)

        idx += 1

    return None


def write_block(filepath: str, item_id: int, fields: dict) -> None:
    """
    Lê o arquivo Lua completo, substitui (ou insere) o bloco para item_id,
    e escreve o resultado de volta atomicamente via arquivo temporário.

    Encoding: sempre latin-1 (byte-transparent) para preservar bytes EUC-KR.

    Raises:
        RuntimeError: se o filepath não estiver configurado.
        IOError: em caso de falha de escrita.
    """
    if not filepath or not os.path.exists(filepath):
        raise RuntimeError(f"Arquivo Lua não encontrado ou não configurado: {filepath!r}")

    with open(filepath, "r", encoding="latin-1") as f:
        content = f.read()

    new_block = render_block(item_id, fields)
    bounds    = find_lua_block_bounds(content, item_id)

    if bounds:
        start_idx, end_idx = bounds
        new_content = content[:start_idx] + new_block + content[end_idx:]
    else:
        # Item não existe no arquivo: inserir antes do '}' final da tabela
        insert_point = content.rfind("\n}")
        if insert_point == -1:
            insert_point = len(content)
        new_content = (
            content[:insert_point]
            + "\n"
            + new_block
            + content[insert_point:]
        )

    # Escrita atômica: temp → rename
    tmp_path = filepath + ".tmp"
    with open(tmp_path, "w", encoding="latin-1") as f:
        f.write(new_content)
    os.replace(tmp_path, filepath)


def delete_block(filepath: str, item_id: int) -> bool:
    """
    Localiza e remove o bloco [item_id] = { … } do arquivo Lua.

    Reutiliza find_lua_block_bounds() para localizar o bloco com precisão,
    respeitando chaves aninhadas e strings escapadas.

    Após a remoção, colapsa múltiplas linhas em branco consecutivas para
    manter a legibilidade humana do arquivo.

    Encoding: sempre latin-1 (byte-transparent) para preservar bytes EUC-KR.

    Retorna:
        True  — bloco encontrado e removido com sucesso.
        False — bloco não encontrado (item_id inexistente no arquivo).

    Raises:
        RuntimeError: se o filepath não estiver configurado ou não existir.
        IOError: em caso de falha de escrita.
    """
    if not filepath or not os.path.exists(filepath):
        raise RuntimeError(f"Arquivo Lua não encontrado ou não configurado: {filepath!r}")

    with open(filepath, "r", encoding="latin-1") as f:
        content = f.read()

    bounds = find_lua_block_bounds(content, item_id)
    if not bounds:
        return False

    start_idx, end_idx = bounds

    # Excisa o bloco inteiro (incluindo o newline terminal já consumido por find_lua_block_bounds)
    new_content = content[:start_idx] + content[end_idx:]

    # Colapsa linhas em branco triplas ou mais em duplas para manter legibilidade
    new_content = re.sub(r'\n{3,}', '\n\n', new_content)

    # Escrita atômica: temp → rename
    tmp_path = filepath + ".tmp"
    with open(tmp_path, "w", encoding="latin-1") as f:
        f.write(new_content)
    os.replace(tmp_path, filepath)

    return True
