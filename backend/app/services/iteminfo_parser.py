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
        """Line-by-line parser for iteminfo.lua. Fast and memory-efficient."""
        # Try the configured client encoding first, then common fallbacks
        preferred = cfg.client_encoding
        fallbacks = [e for e in ("euc-kr", "utf-8", "cp1252", "latin-1") if e != preferred]
        for enc in [preferred] + fallbacks:
            try:
                with open(filepath, "r", encoding=enc, errors="replace") as f:
                    raw_lines = f.readlines()
                break
            except Exception:
                continue
        else:
            raise RuntimeError(f"Cannot open {filepath} with any known encoding")

        re_entry    = re.compile(r"^\s*\[(\d+)\]\s*=\s*\{")
        re_str_field = re.compile(r"^\s*(\w+)\s*=\s*\"(.*)\"\s*,?\s*$")
        re_int_field = re.compile(r"^\s*(\w+)\s*=\s*(-?\d+)\s*,?\s*$")
        re_bool_field= re.compile(r"^\s*(\w+)\s*=\s*(true|false)\s*,?\s*$")
        re_desc_open = re.compile(r"^\s*(\w+)\s*=\s*\{")
        re_desc_line = re.compile(r'^\s*"(.*?)"\s*,?\s*$')
        re_desc_close= re.compile(r"^\s*\},?\s*$")

        current_id: Optional[int] = None
        current_field: dict = {}
        in_desc: Optional[str] = None   # field name while inside { ... }
        current_desc: list[str] = []

        new_map: dict[int, dict] = {}

        FIELD_NAMES = {
            "identifiedDisplayName",   "identifiedResourceName",   "identifiedDescriptionName",
            "unidentifiedDisplayName",  "unidentifiedResourceName",  "unidentifiedDescriptionName",
            "slotCount", "ClassNum", "costume",
        }

        def flush():
            nonlocal current_id, current_field, in_desc, current_desc
            if current_id is not None:
                new_map[current_id] = current_field
            current_id    = None
            current_field = {}
            in_desc       = None
            current_desc  = []

        for line in raw_lines:
            stripped = line.strip()

            # ── New entry ─────────────────────────────────────────────────────
            m = re_entry.match(line)
            if m:
                flush()
                current_id    = int(m.group(1))
                current_field = {}
                continue

            if current_id is None:
                continue

            # ── Inside a description array ─────────────────────────────────
            if in_desc is not None:
                mc = re_desc_close.match(line)
                if mc:
                    # Normalise the key to camelCase with uppercase first letter
                    current_field[in_desc] = current_desc
                    in_desc      = None
                    current_desc = []
                    continue
                md = re_desc_line.match(line)
                if md:
                    current_desc.append(md.group(1))
                continue

            # ── End of entry ───────────────────────────────────────────────
            if stripped in ("};", "},", "}"):
                flush()
                continue

            # ── Description array opening ─────────────────────────────────
            mo = re_desc_open.match(line)
            if mo:
                fname = mo.group(1)
                if fname in FIELD_NAMES:
                    in_desc      = fname
                    current_desc = []
                continue

            # ── String fields ─────────────────────────────────────────────
            ms = re_str_field.match(line)
            if ms:
                fname, fval = ms.group(1), ms.group(2)
                if fname in FIELD_NAMES:
                    current_field[fname] = fval
                continue

            # ── Integer fields ────────────────────────────────────────────
            mi = re_int_field.match(line)
            if mi:
                fname, fval = mi.group(1), mi.group(2)
                if fname in FIELD_NAMES:
                    current_field[fname] = int(fval)
                continue

            # ── Boolean fields ─────────────────────────────────────────────
            mb = re_bool_field.match(line)
            if mb:
                fname, fval = mb.group(1), mb.group(2)
                if fname in FIELD_NAMES:
                    current_field[fname] = (fval == "true")
                continue

        flush()  # handle file ending without a closing brace

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
        """Backward-compat: returns identifiedResourceName for the GRF icon resolver."""
        if not self.loaded:
            return None
        entry = self.item_map.get(item_id)
        return entry.get("identifiedResourceName") if entry else None

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

    def _write_block(self, item_id: int, fields: dict):
        """
        Reads the entire Lua file, replaces (or inserts) the block for item_id,
        and writes the result back atomically via a temp file.
        """
        preferred = cfg.client_encoding
        fallbacks = [e for e in ("euc-kr", "utf-8", "cp1252", "latin-1") if e != preferred]
        for enc in [preferred] + fallbacks:
            try:
                with open(self.iteminfo_path, "r", encoding=enc, errors="replace") as f:
                    content = f.read()
                chosen_enc = enc
                break
            except Exception:
                continue
        else:
            raise RuntimeError(f"Cannot read {self.iteminfo_path}")

        new_block = _render_block(item_id, fields)

        # Build a regex that matches the entire [id] = { … }, block
        # We match from [id] = { up to (and including) the closing },
        # using DOTALL so . also matches newlines.
        pattern = re.compile(
            r"\[\s*" + re.escape(str(item_id)) + r"\s*\]\s*=\s*\{.*?\},",
            re.DOTALL,
        )

        if pattern.search(content):
            new_content = pattern.sub(new_block.rstrip("\n"), content, count=1)
        else:
            # Item not in file: insert before the final closing brace/end of table
            # Find the last `}` that closes the tbl variable (e.g. `tbl = { … }`)
            insert_point = content.rfind("\n}")
            if insert_point == -1:
                insert_point = len(content)
            new_content = (
                content[:insert_point]
                + "\n"
                + new_block
                + content[insert_point:]
            )

        # Write atomically (temp → rename)
        tmp_path = self.iteminfo_path + ".tmp"
        with open(tmp_path, "w", encoding=chosen_enc, errors="replace") as f:
            f.write(new_content)
        os.replace(tmp_path, self.iteminfo_path)


# ─── Singleton ─────────────────────────────────────────────────────────────────
iteminfo_db = ItemInfoParser()
