"""quest_parser.py — Quest DB parser (quest_db.yml + questid2display.lua)."""

import os
import re
from typing import Optional, Any
from app.services.generic_parser import GenericYamlParser
from app.core.config import cfg

def get_quests_lua_path() -> str:
    """Resolves the absolute path to the client-side quest Lua file.

    Checks the configured path first, then attempts to auto-discover common
    filenames (``OngoingQuests.lub``, ``questid2display.lua``, etc.) relative
    to the ``ITEMINFO_PATH`` environment variable.

    Returns:
        str: Absolute path to the Lua file, or ``""`` if not found.
    """
    path = cfg.quests_lua_path
    if path and os.path.exists(path):
        return path

    iteminfo = os.environ.get("ITEMINFO_PATH", "").strip()
    if iteminfo:
        system_dir = os.path.dirname(os.path.dirname(iteminfo))
        filenames = (
            "OngoingQuests.lub", "OngoingQuests.lua",
            "OngoingQuestInfoList.lub", "OngoingQuestInfoList.lua",
            "questid2display.lua", "questid2display.lub"
        )
        for fn in filenames:
            p = os.path.join(system_dir, fn).replace("\\", "/")
            if os.path.exists(p):
                return p

        # Try the sibling System/ directory if the first search was in SystemEN/
        game_root = os.path.dirname(system_dir)
        for fn in filenames:
            p = os.path.join(game_root, "System", fn).replace("\\", "/")
            if os.path.exists(p):
                return p

        return os.path.join(system_dir, "OngoingQuests.lub").replace("\\", "/")
    return ""

def extract_lua_string(key: str, block: str) -> str:
    """Extracts a string value assigned to ``key`` in a Lua table block.

    Supports double-quoted, single-quoted, and ``[[long bracket]]`` string literals.

    Args:
        key: Lua table field name (e.g. ``"Title"``).
        block: Raw Lua source text of a table block.

    Returns:
        str: The extracted string value, or ``""`` if not found.
    """
    m = re.search(key + r"\s*=\s*\"([^\"]*)\"", block)
    if m: return m.group(1)
    m = re.search(key + r"\s*=\s*'([^']*)'", block)
    if m: return m.group(1)
    m = re.search(key + r"\s*=\s*\[\[([\s\S]*?)\]\]", block)
    if m: return m.group(1).strip()
    return ""

def extract_brace_content(key: str, block: str) -> str:
    """Extracts the content inside the outermost ``{}`` braces assigned to ``key``.

    Handles nested braces correctly by counting depth.

    Args:
        key: Lua table field name.
        block: Raw Lua source text.

    Returns:
        str: Content between the braces (exclusive), or ``""`` if not found.
    """
    pattern = re.compile(key + r"\s*=\s*\{")
    m = pattern.search(block)
    if not m: return ""
    start_idx = m.end()
    brace_count = 1
    content_chars = []
    for i in range(start_idx, len(block)):
        char = block[i]
        if char == '{': brace_count += 1
        elif char == '}': brace_count -= 1
        if brace_count == 0: break
        content_chars.append(char)
    return "".join(content_chars)

def parse_quest_lua_block(block: str) -> dict:
    """Parses a single quest Lua table block into a structured dict.

    Extracts ``Title``, ``Summary``, ``Info`` (aggregated Description lines),
    and ``QuickInfo`` entries from the Lua block text.

    Args:
        block: Raw Lua source text for one quest entry.

    Returns:
        dict: ``{"Title": str, "Summary": str, "Info": str, "QuickInfo": list}``.
    """
    data = {
        "Title": "",
        "Summary": "",
        "Info": "",
        "QuickInfo": []
    }
    
    title = extract_lua_string("Title", block) or extract_lua_string("Name", block)
    data["Title"] = title
    
    data["Summary"] = extract_lua_string("Summary", block)
    
    # Description
    desc_block = extract_brace_content("Description", block)
    if desc_block:
        lines = []
        for line in re.findall(r'"((?:[^"\\]|\\.)*)"', desc_block):
            lines.append(line.replace('\\"', '"').replace('\\\\', '\\'))
        for line in re.findall(r"'([^']*)'", desc_block):
            lines.append(line)
        data["Info"] = "\n".join(lines)
    else:
        info_str = extract_lua_string("Info", block) or extract_lua_string("Description", block)
        if info_str:
            data["Info"] = info_str
        
    # QuickInfo
    qi_block = extract_brace_content("QuickInfo", block)
    if qi_block:
        lines = []
        for line in re.findall(r'"((?:[^"\\]|\\.)*)"', qi_block):
            lines.append(line.replace('\\"', '"').replace('\\\\', '\\'))
        for line in re.findall(r"'([^']*)'", qi_block):
            lines.append(line)
        data["QuickInfo"] = lines
        
    return data

def parse_quests_lua(filepath: str) -> dict[int, dict]:
    if not os.path.exists(filepath):
        return {}

    preferred = cfg.client_encoding
    fallbacks = [e for e in ("euc-kr", "utf-8", "cp1252", "latin-1") if e != preferred]

    raw_lines = []
    for enc in [preferred] + fallbacks:
        try:
            with open(filepath, "r", encoding=enc, errors="replace") as f:
                raw_lines = f.readlines()
            break
        except Exception:
            continue
    else:
        return {}

    quest_map = {}
    re_entry = re.compile(r"\[(\d+)\]\s*=\s*\{")

    current_id = None
    current_lines = []
    brace_count = 0

    for line in raw_lines:
        if current_id is None:
            m = re_entry.search(line)
            if m:
                current_id = int(m.group(1))
                current_lines = [line[m.start():]]
                brace_count = 1
                rest = line[m.end():]
                if "--" in rest:
                    rest = rest[:rest.index("--")]
                for char in rest:
                    if char == '{': brace_count += 1
                    elif char == '}': brace_count -= 1
                if brace_count <= 0:
                    quest_map[current_id] = parse_quest_lua_block("".join(current_lines))
                    current_id = None
                    current_lines = []
                    brace_count = 0
            continue

        current_lines.append(line)
        clean = line
        if "--" in clean:
            clean = clean[:clean.index("--")]

        for char in clean:
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1

        if brace_count <= 0:
            quest_map[current_id] = parse_quest_lua_block("".join(current_lines))
            current_id = None
            current_lines = []
            brace_count = 0

    return quest_map

def serialize_quest_lua_block(quest_id: int, data: dict) -> str:
    title = data.get("Title", "")
    summary = data.get("Summary", "")
    info = data.get("Info", "")
    quick_info = data.get("QuickInfo", [])
    
    # Description (split Info by newline)
    info_lines = [ln.strip() for ln in info.split("\n")] if info else []
    if info_lines:
        desc_items = []
        for line in info_lines:
            escaped = line.replace('\\', '\\\\').replace('"', '\\"')
            desc_items.append(f'\t\t\t"{escaped}"')
        desc_str = "{\n" + ",\n".join(desc_items) + "\n\t\t}"
    else:
        desc_str = "{}"
        
    # QuickInfo
    qinfo_items = []
    for line in quick_info:
        escaped = line.replace('\\', '\\\\').replace('"', '\\"')
        qinfo_items.append(f'\t\t\t"{escaped}"')
    if qinfo_items:
        qinfo_str = "{\n" + ",\n".join(qinfo_items) + "\n\t\t}"
    else:
        qinfo_str = "{}"

    return f"""\t[{quest_id}] = {{
		Title = "{title}",
		Description = {desc_str},
		Summary = "{summary}",
		QuickInfo = {qinfo_str}
	}},"""

def save_quest_lua(filepath: str, quest_id: int, data: dict):
    preferred = cfg.client_encoding
    fallbacks = [e for e in ("euc-kr", "utf-8", "cp1252", "latin-1") if e != preferred]

    content = ""
    chosen_enc = "utf-8"
    if os.path.exists(filepath):
        for enc in [preferred] + fallbacks:
            try:
                with open(filepath, "r", encoding=enc, errors="replace") as f:
                    content = f.read()
                chosen_enc = enc
                break
            except Exception:
                continue
    else:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        content = "questid2display = {\n}\n"
        chosen_enc = preferred if preferred != "latin-1" else "euc-kr"

    new_block = serialize_quest_lua_block(quest_id, data)
    start_str = f"[{quest_id}] = {{"
    start_idx = content.find(start_str)

    if start_idx != -1:
        line_start = content.rfind("\n", 0, start_idx) + 1
        brace_count = 0
        end_idx = start_idx
        for idx in range(start_idx, len(content)):
            if content[idx] == '{':
                brace_count += 1
            elif content[idx] == '}':
                brace_count -= 1
                if brace_count == 0:
                    scan = idx + 1
                    while scan < len(content) and content[scan] in (' ', '\t', '\r', '\n'):
                        scan += 1
                    if scan < len(content) and content[scan] in (',', ';'):
                        end_idx = scan + 1
                    else:
                        end_idx = idx + 1
                    break
        new_content = content[:line_start] + new_block + "\n" + content[end_idx:]
    else:
        # Append inside table
        last_brace = content.rfind("}")
        if last_brace != -1:
            pre_last = content[:last_brace].rstrip()
            if pre_last and not pre_last.endswith(","):
                new_content = content[:last_brace] + ",\n" + new_block + "\n" + content[last_brace:]
            else:
                new_content = content[:last_brace] + "\n" + new_block + "\n" + content[last_brace:]
        else:
            new_content = content + "\n" + new_block

    with open(filepath, "w", encoding=chosen_enc, errors="replace") as f:
        f.write(new_content)


def _delete_lua_entry(filepath: str, quest_id: int) -> bool:
    """Locates and permanently removes a single quest block from the client Lua file.

    Uses the same brace-counting strategy as ``save_quest_lua`` to reliably find
    and excise the ``[quest_id] = { ... },`` block without disturbing surrounding entries.
    Falls back gracefully when the file does not exist or the entry is absent (returns ``False``).

    This is a module-level function to maintain clear separation of responsibilities
    between file I/O and the ``QuestDatabase`` class logic.

    Args:
        filepath: Absolute path to the client quest Lua/Lub file.
        quest_id: Numeric ID of the quest entry to remove.

    Returns:
        bool: ``True`` if the block was found and the file was rewritten; ``False`` otherwise.

    Raises:
        RuntimeError: If the file exists but cannot be decoded with any supported encoding.
    """
    if not os.path.exists(filepath):
        return False

    preferred = cfg.client_encoding
    fallbacks = [e for e in ("euc-kr", "utf-8", "cp1252", "latin-1") if e != preferred]

    content = ""
    chosen_enc = "utf-8"
    for enc in [preferred] + fallbacks:
        try:
            with open(filepath, "r", encoding=enc, errors="replace") as f:
                content = f.read()
            chosen_enc = enc
            break
        except Exception:
            continue
    else:
        raise RuntimeError(f"Cannot read {filepath} with any supported encoding.")

    start_str = f"[{quest_id}] = {{"
    start_idx = content.find(start_str)
    if start_idx == -1:
        return False

    line_start = content.rfind("\n", 0, start_idx) + 1
    brace_count = 0
    end_idx = start_idx
    for idx in range(start_idx, len(content)):
        if content[idx] == '{':
            brace_count += 1
        elif content[idx] == '}':
            brace_count -= 1
            if brace_count == 0:
                scan = idx + 1
                while scan < len(content) and content[scan] in (' ', '\t', '\r'):
                    scan += 1
                if scan < len(content) and content[scan] in (',', ';'):
                    end_idx = scan + 1
                else:
                    end_idx = idx + 1
                break

    # Consume the trailing newline so we don't leave a blank line
    if end_idx < len(content) and content[end_idx] == '\n':
        end_idx += 1

    new_content = content[:line_start] + content[end_idx:]

    with open(filepath, "w", encoding=chosen_enc, errors="replace") as f:
        f.write(new_content)

    return True


class QuestDatabase(GenericYamlParser):
    _id_key = 'Id'
    _import_filename = 'quest_db.yml'
    _label = 'quests'
    _header_type = 'QUEST_DB'
    _header_version = 3

    def __init__(self):
        super().__init__()
        self.client_cache: dict[int, dict] = {}
        self.client_loaded = False

    def load_client_db(self):
        """Loads client quest LUA data into memory cache."""
        lua_path = get_quests_lua_path()
        if lua_path and os.path.exists(lua_path):
            try:
                self.client_cache = parse_quests_lua(lua_path)
                self.client_loaded = True
                print(f"[*] {len(self.client_cache)} client quests loaded from {lua_path}")
            except Exception as e:
                print(f"[!] Error loading client quests: {e}")
                self.client_cache = {}
                self.client_loaded = False
        else:
            self.client_cache = {}
            self.client_loaded = False

    def get_quest_list(self) -> list[dict]:
        """Returns unified server and client lists annotated with sync status."""
        server_list = self.get_all()
        
        if not self.client_loaded:
            self.load_client_db()

        merged = {}

        # 1. Fill with server quests
        for s in server_list:
            quest_id = s.get("Id")
            if quest_id is not None:
                client_data = self.client_cache.get(quest_id)
                if client_data is None:
                    client_data = {
                        "Title": "",
                        "Summary": "",
                        "Info": "",
                        "QuickInfo": []
                    }
                merged[quest_id] = {
                    "Id": quest_id,
                    "server": s,
                    "client": client_data,
                    "status": "divergent"
                }

        # 2. Add client quests not on server
        for quest_id, c in self.client_cache.items():
            if quest_id not in merged:
                merged[quest_id] = {
                    "Id": quest_id,
                    "server": None,
                    "client": c,
                    "status": "client_only"
                }

        # 3. Determine status
        for quest_id, m in merged.items():
            s = m["server"]
            has_client = quest_id in self.client_cache
            c = m["client"]
            if s and has_client:
                s_title = s.get("Title", "")
                c_title = c.get("Title", "")
                if s_title == c_title:
                    m["status"] = "ok"
                else:
                    m["status"] = "divergent"
            elif s:
                m["status"] = "server_only"
            else:
                m["status"] = "client_only"

        # Sort by ID
        return sorted(merged.values(), key=lambda x: x["Id"])

    def get_quest(self, quest_id: int) -> Optional[dict]:
        """Returns unified server and client quest entry."""
        server_entry = self.get_by_id(quest_id)
        if not self.client_loaded:
            self.load_client_db()
        client_entry = self.client_cache.get(quest_id)
        
        if not server_entry and not client_entry:
            return None
            
        if server_entry and not client_entry:
            client_entry = {
                "Title": "",
                "Summary": "",
                "Info": "",
                "QuickInfo": []
            }
            
        return {
            "Id": quest_id,
            "server": server_entry,
            "client": client_entry
        }

    def update_quest(self, quest_id: int, server_data: Optional[dict], client_data: Optional[dict]):
        """Updates server YAML file and/or client LUA file."""
        if server_data:
            self.update_entry(quest_id, server_data)

        if client_data:
            lua_path = get_quests_lua_path()
            if lua_path:
                save_quest_lua(lua_path, quest_id, client_data)
                self.client_cache[quest_id] = client_data

        return {
            "Id": quest_id,
            "server": self.get_by_id(quest_id) if server_data else None,
            "client": self.client_cache.get(quest_id) if client_data else None
        }

    @staticmethod
    def _build_server_scaffold(quest_id: int, server_data: Optional[dict]) -> dict:
        """Merges incoming server payload with safe English defaults.

        Guarantees that mandatory rAthena YAML fields are always present, even when
        the caller provides a partial or empty ``server_data`` dict.

        Args:
            quest_id: Numeric quest ID to embed in the scaffold.
            server_data: Partial server payload from the API request, or ``None``.

        Returns:
            dict: A complete, rAthena-compatible server entry.
        """
        defaults: dict = {
            "Id": quest_id,
            "Title": "New Quest",
            "TimeLimit": 0,
            "Targets": [],
            "Drops": [],
        }
        if server_data:
            defaults.update(server_data)
        defaults["Id"] = quest_id
        return defaults

    @staticmethod
    def _build_client_scaffold(client_data: Optional[dict], server_title: str) -> dict:
        """Merges incoming client payload with safe English defaults.

        Ensures the client Lua block always contains valid, non-empty display strings
        when the caller omits them.

        Args:
            client_data: Partial client payload from the API request, or ``None``.
            server_title: The ``Title`` resolved from the server scaffold, used as the
                display title and summary fallback.

        Returns:
            dict: A complete client Lua entry dictionary.
        """
        display_name = server_title or "New Quest"
        defaults: dict = {
            "Title": display_name,
            "Summary": display_name,
            "Info": "Quest description goes here.",
            "QuickInfo": ["Complete the required objectives."],
        }
        if client_data:
            defaults.update(client_data)
        return defaults

    def add_quest(self, quest_id: int, server_data: Optional[dict], client_data: Optional[dict]):
        """Creates a new quest in the server YAML database and/or the client Lua file.

        Both payloads are merged against safe English scaffold defaults before persistence,
        ensuring no empty or None-filled YAML keys reach the rAthena map-server.

        Args:
            quest_id: Desired numeric quest ID.
            server_data: Partial or full server payload; missing fields are filled with defaults.
            client_data: Partial or full client payload; missing fields are filled with defaults.

        Returns:
            dict: ``{"Id": quest_id, "server": ..., "client": ...}`` reflecting what was persisted.
        """
        scaffold_server = self._build_server_scaffold(quest_id, server_data)
        self.add_entry(scaffold_server)

        scaffold_client = self._build_client_scaffold(client_data, scaffold_server.get("Title", ""))
        lua_path = get_quests_lua_path()
        if lua_path:
            save_quest_lua(lua_path, quest_id, scaffold_client)
            self.client_cache[quest_id] = scaffold_client

        return {
            "Id": quest_id,
            "server": scaffold_server,
            "client": scaffold_client,
        }

    def delete_quest(self, quest_id: int) -> bool:
        """Permanently removes a quest from the YAML import file and client Lua cache.

        **Security guard:** only quests residing under ``db/import/`` (source ``custom``)
        may be deleted. Quests from the official rAthena database raise
        ``PermissionError``, which the API route converts to HTTP 403.

        Args:
            quest_id: Numeric rAthena quest ID.

        Returns:
            bool: ``True`` on success, ``False`` if the quest was not found.

        Raises:
            PermissionError: If the quest belongs to the official rAthena database.
        """
        filepath = self.entry_index.get(quest_id)
        if not filepath:
            # Quest may be client-only — remove from client cache if present
            if quest_id in self.client_cache:
                del self.client_cache[quest_id]
                return True
            return False

        norm_path = filepath.replace('\\', '/')
        if '/db/import/' not in norm_path:
            raise PermissionError(
                f"Quest {quest_id} resides in '{norm_path}' which is part of the "
                "official rAthena database. Only quests in db/import/ can be deleted."
            )

        data = self.db_cache.get(filepath)
        if not data:
            return False

        body = data.get('Body', [])
        original_len = len(body)
        data['Body'] = [q for q in body if q.get('Id') != quest_id]

        if len(data['Body']) == original_len:
            del self.entry_index[quest_id]
            return False

        try:
            self.save_file(filepath)
            del self.entry_index[quest_id]
            self.client_cache.pop(quest_id, None)

            lua_path = get_quests_lua_path()
            if lua_path:
                try:
                    _delete_lua_entry(lua_path, quest_id)
                except Exception as lua_exc:
                    raise RuntimeError(
                        f"Quest {quest_id} was removed from YAML but the client Lua file "
                        f"could not be updated: {lua_exc}"
                    ) from lua_exc
        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError(
                f"Failed to delete quest {quest_id}: {exc}"
            ) from exc

        # TODO: self.cached_list is never declared as an instance attribute — dormant bug.
        # The assignment below is a no-op that silently swallows cache invalidation.
        # Fixing it requires declaring `cached_list` in __init__ and hooking it in get_quest_list().
        self.cached_list = None  # type: ignore[attr-defined]

        return True


quest_db = QuestDatabase()
