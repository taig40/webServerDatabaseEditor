import struct
import zlib
import os
import io
from PIL import Image
from typing import Optional

# The Korean folder name for item icons inside the GRF.
# GRF filenames are raw EUC-KR bytes; we store them decoded as latin-1
# (byte-transparent) so the codepoints == the original byte values.
# "유저인터페이스" in EUC-KR = bytes C0AF C0FA C0CE C5CD C6E4 C0CC BDBA
_KOREAN_UI_FOLDER = b'\xc0\xaf\xc0\xfa\xc0\xce\xc5\xcd\xc6\xe4\xc0\xcc\xbd\xba'.decode('latin-1').lower()
_KOREAN_ITEM_FOLDER = b'\xbe\xc6\xc0\xcc\xc5\xdb'.decode('latin-1').lower()  # 아이템
_KOREAN_MONSTER_FOLDER = b'\xb8\xf3\xbd\xba\xc5\xcd'.decode('latin-1').lower()  # 몬스터

# Maximum number of GRF files supported, mirroring the official RO client DATA.INI limit.
MAX_GRF_SLOTS = 10


class _SingleGRF:
    """
    Internal helper that represents a single loaded GRF (binary or folder).
    Priority is managed externally by GRFReader; this class only knows how to
    parse and extract from one GRF source.
    """

    def __init__(self, path: str):
        self.path = path
        self.is_folder = False
        self.files: dict = {}  # normalised_path -> (comp_size, comp_size_aligned, uncomp_size, flags, offset)
        self.loaded = False

    def load(self):
        if not os.path.exists(self.path):
            print(f"[!] GRF path not found: {self.path}")
            return

        self.is_folder = os.path.isdir(self.path)
        if self.is_folder:
            print(f"[*] GRF slot is a directory, using raw-file mode: {self.path}")
            self.loaded = True
            return

        try:
            with open(self.path, 'rb') as f:
                header = f.read(46)
                if len(header) < 46:
                    print(f"[!] GRF file too small (header): {self.path}")
                    return

                signature, key, offset, seed, files_count, version = struct.unpack('<15s 15s I I I I', header)

                if version not in (0x200, 0x300):
                    print(f"[!] Warning: Unexpected GRF version {hex(version)} in {self.path}. Trying anyway.")

                # Handle 4 GB offset overflow
                file_size = os.path.getsize(self.path)
                actual_offset = offset
                while file_size > 4294967296 and actual_offset + 46 < file_size - 100000000:
                    actual_offset += 4294967296

                f.seek(actual_offset + 46)
                if version == 0x300:
                    _val1, table_comp_size, table_uncomp_size = struct.unpack('<I I I', f.read(12))
                else:
                    table_comp_size, table_uncomp_size = struct.unpack('<I I', f.read(8))

                table_data_comp = f.read(table_comp_size)

                try:
                    table_data = zlib.decompress(table_data_comp)
                except Exception as e:
                    print(f"[!] Failed to decompress GRF file table for {self.path}: {e}")
                    return

                idx = 0
                while idx < len(table_data):
                    str_end = table_data.find(b'\x00', idx)
                    if str_end == -1:
                        break

                    try:
                        filename = table_data[idx:str_end].decode('euc-kr').lower()
                    except Exception:
                        filename = table_data[idx:str_end].decode('latin-1').lower()

                    idx = str_end + 1

                    if version == 0x300:
                        if idx + 21 > len(table_data):
                            break
                        comp_size, comp_size_aligned, uncomp_size, flags, file_offset = struct.unpack(
                            '<I I I B Q', table_data[idx:idx + 21]
                        )
                        idx += 21
                    else:
                        if idx + 17 > len(table_data):
                            break
                        comp_size, comp_size_aligned, uncomp_size, flags, file_offset = struct.unpack(
                            '<I I I B I', table_data[idx:idx + 17]
                        )
                        idx += 17

                    filename = filename.replace('\\', '/')
                    self.files[filename] = (comp_size, comp_size_aligned, uncomp_size, flags, file_offset)

            self.loaded = True
            print(f"[*] GRF Loaded: {len(self.files):,} files mapped from {os.path.basename(self.path)}")
        except Exception as e:
            print(f"[!] Failed to load GRF {self.path}: {e}")

    def extract_file(self, filename: str) -> Optional[bytes]:
        if not self.loaded:
            return None

        filename = filename.lower()

        if self.is_folder:
            if self.path.rstrip('/\\').endswith('data') and filename.startswith('data/'):
                adjusted = filename[5:]
            else:
                adjusted = filename

            full = os.path.join(self.path, adjusted).replace('\\', '/')
            if os.path.exists(full):
                with open(full, 'rb') as f:
                    return f.read()

            # Try decoding latin-1 byte representation to EUC-KR for real OS Unicode path
            # (Just in case the filename was requested in garbled encoding)
            try:
                os_adjusted = adjusted.encode('latin-1').decode('euc-kr')
                full_os = os.path.join(self.path, os_adjusted).replace('\\', '/')
                if os.path.exists(full_os):
                    with open(full_os, 'rb') as f:
                        return f.read()
            except Exception:
                pass

            return None

        if filename not in self.files:
            return None

        comp_size, comp_size_aligned, uncomp_size, flags, offset = self.files[filename]
        try:
            with open(self.path, 'rb') as f:
                f.seek(offset + 46)
                data = f.read(comp_size_aligned)
                if flags == 1:  # Standard zlib-compressed file
                    try:
                        return zlib.decompress(data)
                    except Exception:
                        return data
                return data
        except PermissionError:
            print(f"[!] Erro de Permissão: '{self.path}' está bloqueado por outro processo (ex: Client rodando).")
            return None
        except Exception as e:
            print(f"[!] Erro ao extrair do GRF {self.path}: {e}")
            return None


# ─── Public GRFReader (supports up to MAX_GRF_SLOTS GRFs with priority) ───────

class GRFReader:
    """
    Multi-GRF reader that mirrors the DATA.INI semantics of the official
    Ragnarok Online client: up to MAX_GRF_SLOTS GRFs loaded in priority order.

    Priority 0 = highest (checked first) → Priority 9 = lowest.
    The override_path is always checked before any GRF (highest possible priority).

    Usage:
        # Single GRF (backwards-compatible)
        grf_reader.load("data.grf", override_path="/path/to/override")

        # Multi-GRF (DATA.INI style)
        grf_reader.load_multi(
            [{"priority": 0, "path": "custom.grf"},
             {"priority": 1, "path": "rdata.grf"},
             {"priority": 2, "path": "data.grf"}],
            override_path="/path/to/override"
        )
    """

    def __init__(self):
        # Ordered list of _SingleGRF instances (index 0 = highest priority)
        self._grfs: list[_SingleGRF] = []
        self.override_path: str = ""

    # ── Backwards-compatible single-GRF loader ─────────────────────────────

    def load(self, grf_path: str, override_path: str = ""):
        """Load a single GRF (backwards-compatible with the old API)."""
        self.load_multi(
            [{"priority": 0, "path": grf_path}],
            override_path=override_path
        )

    # ── Multi-GRF loader ───────────────────────────────────────────────────

    def load_multi(self, grf_list: list, override_path: str = ""):
        """
        Load multiple GRF files ordered by priority.

        grf_list: list of dicts like [{"priority": 0, "path": "..."}, ...]
                  Missing priority slots are silently skipped.
        override_path: filesystem folder with highest read priority and where
                       new assets are written.
        """
        self._grfs = []
        self.override_path = override_path or ""

        # Sort by priority ascending (0 = highest priority first)
        sorted_entries = sorted(
            [e for e in grf_list if e.get("path", "").strip()],
            key=lambda e: int(e.get("priority", 9))
        )

        for entry in sorted_entries[:MAX_GRF_SLOTS]:
            path = entry["path"].strip()
            grf = _SingleGRF(path)
            grf.load()
            if grf.loaded:
                self._grfs.append(grf)
            else:
                print(f"[!] GRF slot {entry.get('priority', '?')} failed to load: {path}")

        print(f"[*] GRFReader ready: {len(self._grfs)} GRF(s) loaded.")

    # ── Properties for compatibility ────────────────────────────────────────

    @property
    def loaded(self) -> bool:
        return len(self._grfs) > 0

    @property
    def grf_path(self) -> str:
        """Primary GRF path (highest-priority GRF), for legacy access."""
        return self._grfs[0].path if self._grfs else ""

    @property
    def is_folder(self) -> bool:
        """True if the primary (highest-priority) GRF is a directory."""
        return self._grfs[0].is_folder if self._grfs else False

    @property
    def files(self) -> dict:
        """File index of the primary (highest-priority) GRF, for legacy access."""
        return self._grfs[0].files if self._grfs else {}

    def get_grf_list(self) -> list[dict]:
        """Returns the current list of loaded GRFs with their metadata."""
        result = []
        for i, grf in enumerate(self._grfs):
            result.append({
                "priority": i,
                "path": grf.path,
                "loaded": grf.loaded,
                "is_folder": grf.is_folder,
                "file_count": len(grf.files) if not grf.is_folder else None,
            })
        return result

    # ── Core extraction (priority-aware) ──────────────────────────────────

    def extract_file(self, filename: str) -> Optional[bytes]:
        """
        Search for *filename* across all loaded GRFs in priority order.
        The override_path is checked first (before any GRF).
        Returns the first hit found, or None.
        """
        if not self.loaded:
            return None

        filename_lower = filename.lower()

        # 1. Override path has the absolute highest priority (user-saved custom assets)
        if self.override_path and os.path.isdir(self.override_path):
            root = self.override_path.rstrip('/\\')
            if root.endswith('data') and filename_lower.startswith('data/'):
                adjusted = filename_lower[5:]
            else:
                adjusted = filename_lower
            full = os.path.join(root, adjusted)
            if os.path.exists(full):
                with open(full, 'rb') as f:
                    return f.read()

        # 2. Iterate GRFs in priority order (0 = highest priority)
        for grf in self._grfs:
            data = grf.extract_file(filename_lower)
            if data is not None:
                return data

        return None

    def has_file(self, filename: str) -> bool:
        """
        Checks if a file exists in the override directory or inside any loaded GRF.
        Does not read the file content, making it very fast.
        """
        if not self.loaded:
            return False

        filename_lower = filename.lower().replace('\\', '/')

        # 1. Check override path
        if self.override_path and os.path.isdir(self.override_path):
            root = self.override_path.rstrip('/\\')
            if root.endswith('data') and filename_lower.startswith('data/'):
                adjusted = filename_lower[5:]
            else:
                adjusted = filename_lower
            full = os.path.join(root, adjusted).replace('\\', '/')
            if os.path.exists(full):
                return True
            try:
                os_adjusted = adjusted.encode('latin-1').decode('euc-kr')
                full_os = os.path.join(root, os_adjusted).replace('\\', '/')
                if os.path.exists(full_os):
                    return True
            except Exception:
                pass

        # 2. Iterate GRFs
        for grf in self._grfs:
            if grf.is_folder:
                if grf.path.rstrip('/\\').endswith('data') and filename_lower.startswith('data/'):
                    adjusted = filename_lower[5:]
                else:
                    adjusted = filename_lower
                full = os.path.join(grf.path, adjusted).replace('\\', '/')
                if os.path.exists(full):
                    return True
                try:
                    os_adjusted = adjusted.encode('latin-1').decode('euc-kr')
                    full_os = os.path.join(grf.path, os_adjusted).replace('\\', '/')
                    if os.path.exists(full_os):
                        return True
                except Exception:
                    pass
            else:
                if filename_lower in grf.files:
                    return True

        return False

    # ── Image helpers (unchanged) ─────────────────────────────────────────

    def convert_bmp_to_png(self, bmp_bytes: bytes) -> Optional[bytes]:
        """Converts RO BMP sprites to PNG, replacing magenta with transparency."""
        if not bmp_bytes:
            return None
        try:
            img = Image.open(io.BytesIO(bmp_bytes)).convert("RGBA")
            pixels = [
                (255, 255, 255, 0) if p[0] == 255 and p[1] == 0 and p[2] == 255 else p
                for p in img.getdata()
            ]
            img.putdata(pixels)
            out = io.BytesIO()
            img.save(out, format='PNG')
            return out.getvalue()
        except Exception as e:
            print(f"[!] Error converting BMP to PNG: {e}")
            return None

    def generate_dummy_png(self) -> bytes:
        """Generates a small placeholder icon."""
        img = Image.new('RGBA', (24, 24), color=(50, 50, 50, 200))
        out = io.BytesIO()
        img.save(out, format='PNG')
        return out.getvalue()

    def get_item_icon(self, item_id: int) -> bytes:
        """
        Locates an item icon inside the GRF(s) and returns it as a PNG stream.
        """
        if not self.loaded:
            return self.generate_dummy_png()

        from app.services.iteminfo_parser import iteminfo_db
        from app.services.yaml_parser import yaml_db

        # 1. Get the resource name
        resource_name = None
        if iteminfo_db.loaded:
            resource_name = iteminfo_db.get_resource_name(item_id)

        # 2. Fallback to AegisName / numeric ID
        if not resource_name:
            resource_name = str(item_id)
            if item_id in yaml_db.item_index:
                filepath = yaml_db.item_index[item_id]
                data = yaml_db.db_cache.get(filepath)
                if data and 'Body' in data:
                    for item in data['Body']:
                        if item.get('Id') == item_id:
                            resource_name = item.get('Name', str(item_id))
                            break

        paths_to_try = [
            f"data/texture/유저인터페이스/item/{resource_name}.bmp".lower(),
            f"data/texture/{_KOREAN_UI_FOLDER}/item/{resource_name}.bmp".lower(),
            f"data/texture/userinterface/item/{resource_name}.bmp".lower(),
            f"data/texture/유저인터페이스/item/{item_id}.bmp".lower(),
            f"data/texture/{_KOREAN_UI_FOLDER}/item/{item_id}.bmp".lower(),
            f"data/texture/userinterface/item/{item_id}.bmp".lower(),
        ]

        for path in paths_to_try:
            bmp_data = self.extract_file(path)
            if bmp_data:
                png_data = self.convert_bmp_to_png(bmp_data)
                if png_data:
                    return png_data

        return self.generate_dummy_png()

    def get_item_collection(self, item_id: int) -> bytes:
        """
        Locates an item collection illustration inside the GRF(s) and returns it as a PNG stream.
        """
        if not self.loaded:
            return self.generate_dummy_png()

        from app.services.iteminfo_parser import iteminfo_db
        from app.services.yaml_parser import yaml_db

        resource_name = None
        if iteminfo_db.loaded:
            resource_name = iteminfo_db.get_resource_name(item_id)

        if not resource_name:
            resource_name = str(item_id)
            if item_id in yaml_db.item_index:
                filepath = yaml_db.item_index[item_id]
                data = yaml_db.db_cache.get(filepath)
                if data and 'Body' in data:
                    for item in data['Body']:
                        if item.get('Id') == item_id:
                            resource_name = item.get('Name', str(item_id))
                            break

        paths_to_try = [
            f"data/texture/유저인터페이스/collection/{resource_name}.bmp".lower(),
            f"data/texture/{_KOREAN_UI_FOLDER}/collection/{resource_name}.bmp".lower(),
            f"data/texture/userinterface/collection/{resource_name}.bmp".lower(),
            f"data/texture/유저인터페이스/collection/{item_id}.bmp".lower(),
            f"data/texture/{_KOREAN_UI_FOLDER}/collection/{item_id}.bmp".lower(),
            f"data/texture/userinterface/collection/{item_id}.bmp".lower(),
        ]

        for path in paths_to_try:
            bmp_data = self.extract_file(path)
            if bmp_data:
                png_data = self.convert_bmp_to_png(bmp_data)
                if png_data:
                    return png_data

        return self.generate_dummy_png()

    def get_icon_by_resource_name(self, resource_name: str) -> Optional[bytes]:
        """Returns PNG bytes of item icon BMP matching resource_name."""
        if not self.loaded or not resource_name:
            return None
        paths_to_try = [
            f"data/texture/유저인터페이스/item/{resource_name}.bmp".lower(),
            f"data/texture/{_KOREAN_UI_FOLDER}/item/{resource_name}.bmp".lower(),
            f"data/texture/userinterface/item/{resource_name}.bmp".lower(),
        ]
        
        for path in paths_to_try:
            bmp_data = self.extract_file(path)
            if bmp_data:
                return self.convert_bmp_to_png(bmp_data)
        return None

    def get_skill_icon(self, skill_name: str, skill_id: int = 0) -> bytes:
        """Returns PNG bytes of a skill icon from GRF."""
        if not self.loaded:
            return self.generate_dummy_png()
        paths_to_try = []
        if skill_name:
            paths_to_try.extend([
                f"data/texture/유저인터페이스/item/{skill_name}.bmp".lower(),
                f"data/texture/{_KOREAN_UI_FOLDER}/item/{skill_name}.bmp".lower(),
                f"data/texture/userinterface/item/{skill_name}.bmp".lower(),
                f"data/texture/유저인터페이스/skill/{skill_name}.bmp".lower(),
                f"data/texture/{_KOREAN_UI_FOLDER}/skill/{skill_name}.bmp".lower(),
                f"data/texture/userinterface/skill/{skill_name}.bmp".lower(),
            ])
        if skill_id > 0:
            paths_to_try.extend([
                f"data/texture/유저인터페이스/item/{skill_id}.bmp".lower(),
                f"data/texture/{_KOREAN_UI_FOLDER}/item/{skill_id}.bmp".lower(),
                f"data/texture/userinterface/item/{skill_id}.bmp".lower(),
            ])
        for path in paths_to_try:
            bmp_data = self.extract_file(path)
            if bmp_data:
                png = self.convert_bmp_to_png(bmp_data)
                if png:
                    return png
        return self.generate_dummy_png()


    def get_collection_by_resource_name(self, resource_name: str) -> Optional[bytes]:
        """Returns PNG bytes of item collection BMP matching resource_name."""
        if not self.loaded or not resource_name:
            return None
        paths_to_try = [
            f"data/texture/유저인터페이스/collection/{resource_name}.bmp".lower(),
            f"data/texture/{_KOREAN_UI_FOLDER}/collection/{resource_name}.bmp".lower(),
            f"data/texture/userinterface/collection/{resource_name}.bmp".lower(),
            f"data/sprite/{_KOREAN_ITEM_FOLDER}/{resource_name}.bmp".lower(),
            f"data/sprite/item/{resource_name}.bmp".lower(),
        ]
        for path in paths_to_try:
            bmp_data = self.extract_file(path)
            if bmp_data:
                return self.convert_bmp_to_png(bmp_data)
        return None

    def list_grf_assets(self, asset_type: str = "item_icon", query: str = "", skip: int = 0, limit: int = 60) -> dict:
        """
        Lists available resource assets from loaded GRFs matching a query.
        Returns { "total": int, "items": [{"resource_name": str, "display_name": str, "item_id": int|None}] }
        """
        if not self.loaded:
            return {"total": 0, "items": []}

        from app.services.iteminfo_parser import iteminfo_db

        # Build map of resource_name -> (item_id, display_name).
        # Prefer identifiedResourceName; fall back to unIdentifiedResourceName
        # for items that only have the unidentified resource set.
        res_map = {}
        if iteminfo_db.loaded:
            for item_id, entry in iteminfo_db.item_map.items():
                rname = entry.get("identifiedResourceName") or entry.get("unIdentifiedResourceName")
                dname = entry.get("identifiedDisplayName", "") or entry.get("unIdentifiedDisplayName", "")
                if rname:
                    res_map[rname.lower()] = (item_id, dname)

        ext = ".bmp"
        if asset_type == "item_sprite":
            prefixes = [
                f"data/sprite/아이템/".lower(),
                f"data/sprite/{_KOREAN_ITEM_FOLDER}/".lower(),
                "data/sprite/item/".lower(),
            ]
            ext = ".spr"
        elif asset_type == "item_collection":
            prefixes = [
                f"data/texture/유저인터페이스/collection/".lower(),
                f"data/texture/{_KOREAN_UI_FOLDER}/collection/".lower(),
                "data/texture/userinterface/collection/".lower(),
                f"data/sprite/아이템/".lower(),
                f"data/sprite/{_KOREAN_ITEM_FOLDER}/".lower(),
                "data/sprite/item/".lower(),
            ]
        else:
            prefixes = [
                f"data/texture/유저인터페이스/item/".lower(),
                f"data/texture/{_KOREAN_UI_FOLDER}/item/".lower(),
                "data/texture/userinterface/item/".lower(),
            ]

        found_resources = set()

        for grf in self._grfs:
            for k in grf.files.keys():
                if any(k.startswith(p) for p in prefixes) and k.endswith(ext):
                    basename = os.path.basename(k)
                    if basename.endswith(ext):
                        res_name = basename[:-len(ext)]
                        if res_name:
                            found_resources.add(res_name)

        # Also add resources from iteminfo_db
        for rname in res_map.keys():
            found_resources.add(rname)

        results = []
        q_lower = query.strip().lower()

        for res in sorted(found_resources):
            mapped = res_map.get(res.lower())
            item_id = mapped[0] if mapped else None
            display_name = mapped[1] if mapped else ""

            if q_lower:
                match = (
                    q_lower in res.lower() or
                    (display_name and q_lower in display_name.lower()) or
                    (item_id is not None and q_lower in str(item_id))
                )
                if not match:
                    continue

            results.append({
                "resource_name": res,
                "display_name": display_name,
                "item_id": item_id,
            })

        total = len(results)
        paged = results[skip:skip + limit]
        return {"total": total, "items": paged}

    # ── Asset write helpers ────────────────────────────────────────────────

    def _resolve_write_root(self) -> Optional[str]:
        """Returns the filesystem root where we can write GRF-relative paths."""
        if self.override_path and os.path.isdir(self.override_path):
            return self.override_path
        if self._grfs and self._grfs[0].is_folder:
            return self._grfs[0].path
        return None

    def _save_asset(self, grf_relative_path: str, data: bytes) -> str:
        """
        Saves *data* to <write_root>/<grf_relative_path>, creating dirs as needed.
        Returns the absolute path written, or raises RuntimeError.
        """
        root = self._resolve_write_root()
        if not root:
            raise RuntimeError(
                "No writable GRF path configured. "
                "Set GRF_OVERRIDE_PATH in your .env (Settings → GRF Override Path)."
            )

        rel = grf_relative_path.replace('\\', '/')
        root_norm = root.rstrip('/\\').replace('\\', '/')
        if root_norm.endswith('/data') and rel.startswith('data/'):
            rel = rel[5:]

        abs_path = os.path.join(root, rel).replace('\\', '/')
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, 'wb') as f:
            f.write(data)
        print(f"[*] Asset saved: {abs_path}")
        return abs_path

    def save_item_icon(self, resource_name: str, bmp_bytes: bytes) -> str:
        """Saves a BMP icon for an item under the standard RO texture path."""
        return self._save_asset(f"data/texture/유저인터페이스/item/{resource_name}.bmp", bmp_bytes)

    def save_item_collection(self, resource_name: str, bmp_bytes: bytes) -> str:
        """Saves a BMP collection sprite for an item under the standard RO sprite path."""
        return self._save_asset(f"data/texture/유저인터페이스/collection/{resource_name}.bmp", bmp_bytes)

    def save_mob_spr(self, aegis_name: str, spr_bytes: bytes) -> str:
        """
        Saves a .spr sprite file for a monster — picked up automatically by find_mob_files().
        """
        return self._save_asset(f"data/sprite/몬스터/{aegis_name}.spr", spr_bytes)

    def save_mob_act(self, aegis_name: str, act_bytes: bytes) -> str:
        """Saves a .act action file for a monster."""
        return self._save_asset(f"data/sprite/몬스터/{aegis_name}.act", act_bytes)

    def save_item_drop_spr(self, resource_name: str, spr_bytes: bytes) -> str:
        """Saves a .spr drop sprite file for an item."""
        return self._save_asset(f"data/sprite/아이템/{resource_name}.spr", spr_bytes)

    def save_item_drop_act(self, resource_name: str, act_bytes: bytes) -> str:
        """Saves a .act drop action file for an item."""
        return self._save_asset(f"data/sprite/아이템/{resource_name}.act", act_bytes)


grf_reader = GRFReader()
