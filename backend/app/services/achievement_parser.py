"""achievement_parser.py — Parser and synchronizer for achievement databases.

Unifies server execution data from ``achievement_db.yml`` with client display
and translation data from ``achievements.lub`` / ``achievements.lua``.
"""

import os
import re
from typing import Optional
from app.services.generic_parser import GenericYamlParser
from app.core.config import cfg

def get_achievements_lua_path() -> str:
    """Resolves the absolute path to the client-side ``achievements.lub`` / ``achievements.lua`` file.

    Checks the path configured in ``cfg.achievements_lua_path`` first, then
    attempts automatic discovery relative to the ``ITEMINFO_PATH`` directory structure.

    Returns:
        str: Absolute path to the achievements Lua file, or ``""`` if not found.
    """
    path = cfg.achievements_lua_path
    if path and os.path.exists(path):
        return path
    
    # Auto-guess
    iteminfo = os.environ.get("ITEMINFO_PATH", "").strip()
    if iteminfo:
        system_dir = os.path.dirname(os.path.dirname(iteminfo)) # goes up to System/ or SystemEN/
        filenames = ("achievements.lub", "achievements.lua", "achievement_list.lub", "achievement_list.lua")
        for fn in filenames:
            p = os.path.join(system_dir, fn).replace("\\", "/")
            if os.path.exists(p):
                return p
        
        # Try checking in System/ if parent was SystemEN/ or vice versa
        game_root = os.path.dirname(system_dir)
        for fn in filenames:
            p = os.path.join(game_root, "System", fn).replace("\\", "/")
            if os.path.exists(p):
                return p
                
        # Default fallback
        return os.path.join(system_dir, "achievements.lub").replace("\\", "/")
    return ""


def extract_lua_string(key: str, block: str) -> str:
    """Extracts a string value assigned to ``key`` from a Lua table block.

    Supports double-quoted, single-quoted, and long-bracket (``[[...]]``) string literals.

    Args:
        key: The Lua table field name.
        block: Raw Lua text of the table entry block.

    Returns:
        str: Extracted string without enclosing quotes, or ``""`` if missing.
    """
    m = re.search(key + r"\s*=\s*\"([^\"]*)\"", block)
    if m: return m.group(1)
    m = re.search(key + r"\s*=\s*'([^']*)'", block)
    if m: return m.group(1)
    m = re.search(key + r"\s*=\s*\[\[([\s\S]*?)\]\]", block)
    if m: return m.group(1).strip()
    return ""

def extract_brace_content(key: str, block: str) -> str:
    """Extracts the innermost block of text enclosed in balanced curly braces for ``key``.

    Args:
        key: The Lua table field name whose table payload should be extracted.
        block: Raw Lua source text.

    Returns:
        str: Text contained inside the braces, or ``""`` if not found.
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

def parse_achievements_lua(filepath: str) -> dict[int, dict]:
    """Reads ``achievements.lub`` line-by-line and extracts all achievement entries.

    Iterates through configured and fallback encodings to safely read the file.

    Args:
        filepath: Absolute path to the client achievements Lua file.

    Returns:
        dict[int, dict]: Mapping of achievement IDs to parsed field dictionaries.
    """
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

    ach_map = {}
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
                    ach_map[current_id] = parse_lua_block("".join(current_lines))
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
            ach_map[current_id] = parse_lua_block("".join(current_lines))
            current_id = None
            current_lines = []
            brace_count = 0

    return ach_map


def parse_lua_block(block: str) -> dict:
    """Parses individual achievement block fields from raw client Lua code.

    Extracts UI metadata, titles, descriptions, score values, reward definitions,
    and multi-line resource text blocks.

    Args:
        block: Raw text of a single achievement Lua table block.

    Returns:
        dict: Parsed dictionary containing all standard achievement fields.
    """
    data = {
        "UI_Type": 0,
        "group": "",
        "major": 1,
        "minor": 0,
        "title": "",
        "summary": "",
        "details": "",
        "resource": [],
        "reward_item": None,
        "reward_title": None,
        "reward_buff": None,
        "score": 0
    }

    m_ui = re.search(r"UI_Type\s*=\s*(-?\d+)", block)
    if m_ui: data["UI_Type"] = int(m_ui.group(1))

    group = extract_lua_string("group", block)
    if group: data["group"] = group

    m_major = re.search(r"major\s*=\s*(-?\d+)", block)
    if m_major: data["major"] = int(m_major.group(1))

    m_minor = re.search(r"minor\s*=\s*(-?\d+)", block)
    if m_minor: data["minor"] = int(m_minor.group(1))

    title = extract_lua_string("title", block)
    if title: data["title"] = title

    m_score = re.search(r"score\s*=\s*(-?\d+)", block)
    if m_score: data["score"] = int(m_score.group(1))

    summary = extract_lua_string("summary", block)
    if summary: data["summary"] = summary

    details = extract_lua_string("details", block)
    if details: data["details"] = details

    # Reward parsing
    rew_block = extract_brace_content("reward", block)
    if rew_block:
        m_item = re.search(r"item\s*=\s*(\d+)", rew_block)
        if m_item: data["reward_item"] = int(m_item.group(1))
        m_title_rew = re.search(r"title\s*=\s*(\d+)", rew_block)
        if m_title_rew: data["reward_title"] = int(m_title_rew.group(1))
        m_buff = re.search(r"buff\s*=\s*(\d+)", rew_block)
        if m_buff: data["reward_buff"] = int(m_buff.group(1))

    # Resource parsing
    res_block = extract_brace_content("resource", block)
    if res_block:
        texts = []
        for text in re.findall(r"text\s*=\s*\"([^\"]*)\"", res_block):
            texts.append(text)
        for text in re.findall(r"text\s*=\s*'([^']*)'", res_block):
            texts.append(text)
        for text in re.findall(r"text\s*=\s*\[\[([\s\S]*?)\]\]", res_block):
            texts.append(text.strip())
        data["resource"] = texts

    return data

    return data


def serialize_lua_block(ach_id: int, data: dict) -> str:
    """Formats a dictionary into standard Lua block notation matching the original format.

    Args:
        ach_id: Numeric achievement ID.
        data: Dictionary of achievement fields and resources.

    Returns:
        str: Formatted Lua code block for the entry.
    """
    # Resources
    resources = data.get("resource", [])
    if len(resources) == 1:
        res_str = f"{{ [1] = {{ text = \"{resources[0]}\" }} }}"
    elif len(resources) > 1:
        res_items = []
        for idx, text in enumerate(resources, 1):
            res_items.append(f"\t\t\t[{idx}] = {{ text = \"{text}\" }}")
        res_str = "{\n" + ",\n".join(res_items) + "\n\t\t}"
    else:
        res_str = "{}"

    # Rewards
    rew_parts = []
    if data.get("reward_title"):
        rew_parts.append(f"title = {data['reward_title']}")
    if data.get("reward_buff"):
        rew_parts.append(f"buff = {data['reward_buff']}")
    if data.get("reward_item"):
        rew_parts.append(f"item = {data['reward_item']}")
    rew_str = f"{{ {', '.join(rew_parts)} }}" if rew_parts else "{}"

    return f"""\t[{ach_id}] = {{
		UI_Type = {data.get('UI_Type', 0)},
		group = "{data.get('group', '').upper()}",
		major = {data.get('major', 1)},
		minor = {data.get('minor', 0)},
		title = "{data.get('title', '')}",
		content = {{
			summary = "{data.get('summary', '')}",
			details = "{data.get('details', '')}"
		}},
		resource = {res_str},
		reward = {rew_str},
		score = {data.get('score', 0)}
	}},"""


def save_achievement_lua(filepath: str, ach_id: int, data: dict):
    """Inserts or updates a single achievement block inside the client Lua file in-place.

    Preserves surrounding file formatting and comments while replacing or appending
    the specified achievement entry.

    Args:
        filepath: Absolute path to the target Lua file.
        ach_id: Numeric ID of the achievement being modified or added.
        data: Dictionary containing the updated achievement values.

    Raises:
        RuntimeError: If the target file cannot be decoded with supported encodings.
    """
    if not os.path.exists(filepath):
        return

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
        raise RuntimeError(f"Cannot read {filepath}")

    new_block = serialize_lua_block(ach_id, data)
    start_str = f"[{ach_id}] = {{"
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
            # check if there's a comma before the last bracket
            pre_last = content[:last_brace].rstrip()
            if pre_last and not pre_last.endswith(","):
                new_content = content[:last_brace] + ",\n" + new_block + "\n" + content[last_brace:]
            else:
                new_content = content[:last_brace] + "\n" + new_block + "\n" + content[last_brace:]
        else:
            new_content = content + "\n" + new_block

    with open(filepath, "w", encoding=chosen_enc, errors="replace") as f:
        f.write(new_content)


class AchievementDatabase(GenericYamlParser):
    """Unified manager and parser for server and client achievement databases.

    Inherits from ``GenericYamlParser`` to manage ``achievement_db.yml`` on the server,
    while concurrently maintaining an in-memory cache of client display data parsed
    from ``achievements.lub``.

    Attributes:
        client_cache: Mapping of achievement IDs to client-side display definitions.
        client_loaded: Flag indicating whether the client Lua cache is currently loaded.
    """

    _id_key = 'Id'
    _import_filename = 'achievement_db.yml'
    _label = 'conquistas'
    _header_type = 'ACHIEVEMENT_DB'
    _header_version = 2

    def __init__(self):
        super().__init__()
        self.client_cache: dict[int, dict] = {}
        self.client_loaded = False

    def load_client_db(self):
        """Loads and caches client Lua achievement display tables from disk."""
        lua_path = get_achievements_lua_path()
        if lua_path:
            try:
                self.client_cache = parse_achievements_lua(lua_path)
                self.client_loaded = True
                print(f"[*] {len(self.client_cache)} client achievements loaded from {lua_path}")
            except Exception as e:
                print(f"[!] Error loading client achievements: {e}")
                self.client_cache = {}
                self.client_loaded = False
        else:
            self.client_cache = {}
            self.client_loaded = False

    def get_ach_list(self) -> list[dict]:
        """Returns unified server and client lists annotated with synchronization status.

        Merges records by ID and labels each entry with one of three status markers:
        ``"divergent"``, ``"client_only"``, or ``"server_only"`` (or synchronized).

        Returns:
            list[dict]: Merged achievement entries with combined server/client data.
        """
        server_list = self.get_all()
        
        if not self.client_loaded:
            self.load_client_db()

        merged = {}

        # 1. Fill with server achievements
        for s in server_list:
            ach_id = s.get("Id")
            if ach_id is not None:
                client_data = self.client_cache.get(ach_id)
                if client_data is None:
                    client_data = {
                        "UI_Type": 0,
                        "group": "",
                        "major": 1,
                        "minor": 0,
                        "title": "",
                        "summary": "",
                        "details": "",
                        "resource": [],
                        "reward_item": None,
                        "reward_title": None,
                        "reward_buff": None,
                        "score": 0
                    }
                merged[ach_id] = {
                    "Id": ach_id,
                    "server": s,
                    "client": client_data,
                    "status": "divergent"
                }

        # 2. Add client achievements not on server
        for ach_id, c in self.client_cache.items():
            if ach_id not in merged:
                merged[ach_id] = {
                    "Id": ach_id,
                    "server": None,
                    "client": c,
                    "status": "client_only"
                }

        # 3. Determine status
        for ach_id, m in merged.items():
            s = m["server"]
            has_client = ach_id in self.client_cache
            c = m["client"]
            if s and has_client:
                s_score = s.get("Score", 0)
                c_score = c.get("score", 0)
                if s_score == c_score:
                    m["status"] = "ok"
                else:
                    m["status"] = "divergent"
            elif s:
                m["status"] = "server_only"
            else:
                m["status"] = "client_only"

        # Sort by ID
        return sorted(merged.values(), key=lambda x: x["Id"])

    def update_achievement(self, ach_id: int, server_data: Optional[dict], client_data: Optional[dict]):
        """Updates server YAML file and/or client LUA file."""
        if server_data:
            self.update_entry(ach_id, server_data)

        if client_data:
            lua_path = get_achievements_lua_path()
            if lua_path:
                save_achievement_lua(lua_path, ach_id, client_data)
                self.client_cache[ach_id] = client_data

        return {
            "Id": ach_id,
            "server": self.get_by_id(ach_id) if server_data else None,
            "client": self.client_cache.get(ach_id) if client_data else None
        }

    def add_achievement(self, ach_id: int, server_data: Optional[dict], client_data: Optional[dict]):
        """Creates a new achievement in server database and/or client file."""
        if server_data:
            server_data["Id"] = ach_id
            self.add_entry(server_data)

        if client_data:
            lua_path = get_achievements_lua_path()
            if lua_path:
                save_achievement_lua(lua_path, ach_id, client_data)
                self.client_cache[ach_id] = client_data

        return {
            "Id": ach_id,
            "server": server_data,
            "client": client_data
        }


achievement_db = AchievementDatabase()
