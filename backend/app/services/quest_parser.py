"""quest_parser.py — Quest DB parser (quest_db.yml + questid2display.lua)."""

import os
import re
from typing import Optional, Any
from app.services.generic_parser import GenericYamlParser
from app.core.config import cfg

def get_quests_lua_path() -> str:
    # Check if configured in environment / config object
    path = cfg.quests_lua_path
    if path and os.path.exists(path):
        return path
        
    iteminfo = os.environ.get("ITEMINFO_PATH", "").strip()
    if iteminfo:
        system_dir = os.path.dirname(os.path.dirname(iteminfo)) # goes up to System/ or SystemEN/
        filenames = (
            "OngoingQuests.lub", "OngoingQuests.lua", 
            "OngoingQuestInfoList.lub", "OngoingQuestInfoList.lua", 
            "questid2display.lua", "questid2display.lub"
        )
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
                
        # Default fallback (create OngoingQuests.lub in system_dir)
        return os.path.join(system_dir, "OngoingQuests.lub").replace("\\", "/")
    return ""

def extract_lua_string(key: str, block: str) -> str:
    m = re.search(key + r"\s*=\s*\"([^\"]*)\"", block)
    if m: return m.group(1)
    m = re.search(key + r"\s*=\s*'([^']*)'", block)
    if m: return m.group(1)
    m = re.search(key + r"\s*=\s*\[\[([\s\S]*?)\]\]", block)
    if m: return m.group(1).strip()
    return ""

def extract_brace_content(key: str, block: str) -> str:
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

    def add_quest(self, quest_id: int, server_data: Optional[dict], client_data: Optional[dict]):
        """Creates a new quest in server database and/or client file."""
        if server_data:
            server_data["Id"] = quest_id
            self.add_entry(server_data)

        if client_data:
            lua_path = get_quests_lua_path()
            if lua_path:
                save_quest_lua(lua_path, quest_id, client_data)
                self.client_cache[quest_id] = client_data

        return {
            "Id": quest_id,
            "server": server_data,
            "client": client_data
        }


quest_db = QuestDatabase()
