import os
import re
import threading
from typing import Optional
from app.core.config import cfg

# ─── Default block template ────────────────────────────────────────────────────
# Used when generating a brand-new entry that didn't previously exist in the Lua.
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

def _escape_lua_string(s: str) -> str:
    """Escapes backslashes and double-quotes for embedding in a Lua string."""
    return s.replace("\\", "\\\\").replace('"', '\\"')

def _format_desc_lines(lines: list[str]) -> str:
    """Converts a list of description lines into the Lua array inline format."""
    if not lines:
        return ""
    escaped = [f'"{_escape_lua_string(ln)}"' for ln in lines]
    return "\n\t\t\t" + ",\n\t\t\t".join(escaped) + "\n\t\t"

def _render_block(item_id: int, fields: dict) -> str:
    """Renders the complete Lua block for one item ID."""
    uid_desc  = _format_desc_lines(fields.get("unIdentifiedDescriptionName", []))
    id_desc   = _format_desc_lines(fields.get("identifiedDescriptionName",   []))
    costume   = "true" if fields.get("costume", False) else "false"

    return _BLOCK_TEMPLATE.format(
        id                          = item_id,
        unIdentifiedDisplayName     = _escape_lua_string(fields.get("unIdentifiedDisplayName", "")),
        unIdentifiedResourceName    = _escape_lua_string(fields.get("unIdentifiedResourceName", "")),
        unIdentifiedDescriptionName = uid_desc,
        identifiedDisplayName       = _escape_lua_string(fields.get("identifiedDisplayName", "")),
        identifiedResourceName      = _escape_lua_string(fields.get("identifiedResourceName", "")),
        identifiedDescriptionName   = id_desc,
        slotCount                   = int(fields.get("slotCount", 0)),
        ClassNum                    = int(fields.get("ClassNum", 0)),
        costume                     = costume,
    )


# ─── Parser ────────────────────────────────────────────────────────────────────

class ItemInfoParser:
    """
    Parses and writes back Ragnarok Online's iteminfo.lua / itemInfo.lua.

    The internal store is a dict keyed by item ID:
        {
          501: {
            "identifiedDisplayName":     "Red Potion",
            "identifiedResourceName":    "»¡°£Æ÷¼Ç",
            "identifiedDescriptionName": ["A potion...", "..."],
            "unIdentifiedDisplayName":   "Red Potion",
            "unIdentifiedResourceName":  "»¡°£Æ÷¼Ç",
            "unIdentifiedDescriptionName": [],
            "slotCount":  0,
            "ClassNum":   0,
            "costume":    False,
          },
          ...
        }
    """

    def __init__(self):
        self.iteminfo_path: str = ""
        self.item_map: dict[int, dict] = {}   # id → full field dict
        self.loaded: bool  = False
        self.loading: bool = False
        self.encoding_error: Optional[dict] = None

    # ── Load ──────────────────────────────────────────────────────────────────

    def load_background(self, iteminfo_path: str):
        if not iteminfo_path or not os.path.exists(iteminfo_path):
            print(f"[!] ItemInfo file not found at {iteminfo_path}")
            return

        self.iteminfo_path = iteminfo_path
        self.loading = True
        t = threading.Thread(target=self._parse_async, args=(iteminfo_path,), daemon=True)
        t.start()

    def _parse_async(self, filepath: str):
        print(f"[*] Starting async Lua parse from '{filepath}'...")
        try:
            self._parse(filepath)
            self.loaded = True
            print(f"[*] ItemInfo Loaded: {len(self.item_map)} entries mapped.")
        except Exception as e:
            print(f"[!] Failed to parse ItemInfo: {e}")
        finally:
            self.loading = False

    def _parse(self, filepath: str):
        """Regex block parser for iteminfo.lua. Robust and fully compliant with identified/unidentified requirements."""
        # Strictly validate client encoding first (record error if any, but do not block loading)
        from app.core.utils import read_file_safely
        try:
            read_file_safely(filepath, cfg.client_encoding)
            self.encoding_error = None
        except Exception as e:
            from fastapi import HTTPException
            if isinstance(e, HTTPException) and isinstance(e.detail, dict) and e.detail.get("error_code") == "ENCODING_MISMATCH":
                self.encoding_error = e.detail
            else:
                self.encoding_error = {
                    "error_code": "ENCODING_MISMATCH",
                    "message": f"Erro de validação de encoding no arquivo {os.path.basename(filepath)} usando '{cfg.client_encoding}': {str(e)}",
                    "suggestion": "Vá até a aba Configurações (Settings) para ajustar o encoding."
                }

        # ALWAYS read as latin-1 (byte-transparent).
        with open(filepath, "r", encoding="latin-1") as f:
            content = f.read()

        # Step 1: Extract block boundaries using brace counting
        blocks = []
        for match in re.finditer(r'^\s*\[(\d+)\]\s*=\s*\{', content, re.MULTILINE):
            item_id = int(match.group(1))
            start_idx = match.end()
            
            brace_count = 1
            idx = start_idx
            n = len(content)
            while idx < n and brace_count > 0:
                char = content[idx]
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                idx += 1
                
            if brace_count == 0:
                block_content = content[start_idx:idx-1]
                blocks.append((item_id, block_content))

        new_map = {}

        # Compile explicit regexes with word boundary anchors as requested
        re_unidentified_display = re.compile(r'\bunidentifiedDisplayName\s*=\s*"(.*?)"')
        re_unidentified_resource = re.compile(r'\bunidentifiedResourceName\s*=\s*"(.*?)"')
        re_identified_display = re.compile(r'\bidentifiedDisplayName\s*=\s*"(.*?)"')
        re_identified_resource = re.compile(r'\bidentifiedResourceName\s*=\s*"(.*?)"')
        
        re_slot = re.compile(r'\bslotCount\s*=\s*(-?\d+)')
        re_class = re.compile(r'\bClassNum\s*=\s*(-?\d+)')
        re_costume = re.compile(r'\bcostume\s*=\s*(true|false)')
        
        # DOTALL and [\s\S]*? pattern for multiline descriptions
        re_unidentified_desc = re.compile(r'\bunidentifiedDescriptionName\s*=\s*\{([\s\S]*?)\}')
        re_identified_desc = re.compile(r'\bidentifiedDescriptionName\s*=\s*\{([\s\S]*?)\}')

        for item_id, block_content in blocks:
            fields = {}
            
            m = re_unidentified_display.search(block_content)
            if m: fields['unidentifiedDisplayName'] = m.group(1)
            
            m = re_unidentified_resource.search(block_content)
            if m: fields['unidentifiedResourceName'] = m.group(1)
            
            m = re_identified_display.search(block_content)
            if m: fields['identifiedDisplayName'] = m.group(1)
            
            m = re_identified_resource.search(block_content)
            if m: fields['identifiedResourceName'] = m.group(1)
            
            m = re_slot.search(block_content)
            if m: fields['slotCount'] = int(m.group(1))
            
            m = re_class.search(block_content)
            if m: fields['ClassNum'] = int(m.group(1))
            
            m = re_costume.search(block_content)
            if m: fields['costume'] = (m.group(1) == "true")
            
            # Array descriptions
            m = re_unidentified_desc.search(block_content)
            if m:
                desc_content = m.group(1)
                lines = re.findall(r'"((?:[^"\\]|\\.)*)"', desc_content)
                fields['unidentifiedDescriptionName'] = [ln.replace('\\"', '"').replace('\\\\', '\\') for ln in lines]
                
            m = re_identified_desc.search(block_content)
            if m:
                desc_content = m.group(1)
                lines = re.findall(r'"((?:[^"\\]|\\.)*)"', desc_content)
                fields['identifiedDescriptionName'] = [ln.replace('\\"', '"').replace('\\\\', '\\') for ln in lines]
                
            new_map[item_id] = fields

        # Normalise all keys to canonical camelCase with uppercase first letter
        normalised: dict[int, dict] = {}
        KEY_NORM = {
            "identifiedDisplayName":       "identifiedDisplayName",
            "identifiedResourceName":      "identifiedResourceName",
            "identifiedDescriptionName":   "identifiedDescriptionName",
            "unidentifiedDisplayName":     "unIdentifiedDisplayName",
            "unidentifiedResourceName":    "unIdentifiedResourceName",
            "unidentifiedDescriptionName": "unIdentifiedDescriptionName",
            "unIdentifiedDisplayName":     "unIdentifiedDisplayName",
            "unIdentifiedResourceName":    "unIdentifiedResourceName",
            "unIdentifiedDescriptionName": "unIdentifiedDescriptionName",
            "slotCount": "slotCount",
            "ClassNum":  "ClassNum",
            "costume":   "costume",
        }
        for item_id, fields in new_map.items():
            norm = {}
            for k, v in fields.items():
                canonical = KEY_NORM.get(k, k)
                norm[canonical] = v
            normalised[item_id] = norm

        self.item_map = normalised

    # ── Public read helpers ────────────────────────────────────────────────────

    def get_resource_name(self, item_id: int) -> Optional[str]:
        """Returns identifiedResourceName, falling back to unIdentifiedResourceName only if the former is null/empty."""
        if not self.loaded:
            return None
        entry = self.item_map.get(item_id)
        if not entry:
            return None
        res_name = entry.get("identifiedResourceName")
        if not res_name or str(res_name).strip() == "":
            res_name = entry.get("unIdentifiedResourceName")
        return res_name
    def get_client_item(self, item_id: int) -> Optional[dict]:
        """Returns the full field dict for item_id, or None if not found."""
        if not self.loaded:
            return None
        return self.item_map.get(item_id)

    # ── Write-back ─────────────────────────────────────────────────────────────

    def update_client_item(self, item_id: int, fields: dict) -> dict:
        """
        Rewrites the entire [item_id] = { … } block in the Lua file on disk.
        If the item doesn't exist yet, appends it before the closing brace of the table.
        Returns the updated field dict stored in memory.
        """
        if not self.iteminfo_path:
            raise RuntimeError("ItemInfo path is not configured.")

        # Merge incoming fields into current in-memory state
        current = dict(self.item_map.get(item_id, {}))
        current.update(fields)
        current.pop("_source", None)

        # Persist to disk
        self._write_block(item_id, current)

        # Update in-memory cache
        self.item_map[item_id] = current
        return current

    def _find_lua_block_bounds(self, content: str, item_id: int) -> Optional[tuple[int, int]]:
        """
        Locates the exact start and end character indices of the item_id block
        in content, respecting nested braces ({}) and strings.
        Returns (start_idx, end_idx) or None if not found.
        """
        pattern = re.compile(r"^\s*\[\s*" + re.escape(str(item_id)) + r"\s*\]\s*=\s*\{", re.MULTILINE)
        match = pattern.search(content)
        if not match:
            return None

        start_idx = match.start()
        idx = match.end() - 1  # Index of opening '{' of the block

        depth = 0
        in_str = None
        escaped = False

        while idx < len(content):
            char = content[idx]

            if in_str:
                if escaped:
                    escaped = False
                elif char == '\\':
                    escaped = True
                elif char == in_str:
                    in_str = None
            else:
                if char in ('"', "'"):
                    in_str = char
                elif char == '{':
                    depth += 1
                elif char == '}':
                    depth -= 1
                    if depth == 0:
                        idx += 1
                        # Include trailing comma, semicolon, or spaces
                        while idx < len(content) and content[idx] in (' ', '\t', ',', ';'):
                            idx += 1
                        # Include trailing newline if present
                        if idx < len(content) and content[idx] == '\n':
                            idx += 1
                        elif idx + 1 < len(content) and content[idx:idx+2] == '\r\n':
                            idx += 2
                        return (start_idx, idx)

            idx += 1

        return None

    def _write_block(self, item_id: int, fields: dict):
        """
        Reads the entire Lua file, replaces (or inserts) the block for item_id,
        and writes the result back atomically via a temp file.
        """
        # ALWAYS read/write as latin-1 (byte-transparent) to preserve raw EUC-KR bytes
        with open(self.iteminfo_path, "r", encoding="latin-1") as f:
            content = f.read()

        new_block = _render_block(item_id, fields)
        bounds = self._find_lua_block_bounds(content, item_id)

        if bounds:
            start_idx, end_idx = bounds
            new_content = content[:start_idx] + new_block + content[end_idx:]
        else:
            # Item not in file: insert before the final closing brace/end of table
            insert_point = content.rfind("\n}")
            if insert_point == -1:
                insert_point = len(content)
            new_content = (
                content[:insert_point]
                + "\n"
                + new_block
                + content[insert_point:]
            )

        # Write atomically (temp → rename) with latin-1
        tmp_path = self.iteminfo_path + ".tmp"
        with open(tmp_path, "w", encoding="latin-1") as f:
            f.write(new_content)
        os.replace(tmp_path, self.iteminfo_path)


# ─── Singleton ─────────────────────────────────────────────────────────────────
iteminfo_db = ItemInfoParser()