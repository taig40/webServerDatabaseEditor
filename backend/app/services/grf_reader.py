import struct
import zlib
import os
import io
from PIL import Image
from typing import Optional
from app.core.config import cfg

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
                        filename = table_data[idx:str_end].decode(cfg.client_encoding).lower()
                    except Exception:
                        filename = table_data[idx:str_end].decode('latin1').lower()

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
            return None

        if filename not in self.files:
            return None

        comp_size, comp_size_aligned, uncomp_size, flags, offset = self.files[filename]
        with open(self.path, 'rb') as f:
            f.seek(offset + 46)
            data = f.read(comp_size_aligned)
            if flags == 1:  # Standard zlib-compressed file
                try:
                    return zlib.decompress(data)
                except Exception:
                    return data
            return data


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
        """Locates an item icon inside the GRF(s) and returns it as a PNG stream."""
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

        try:
            resource_ansi = resource_name.encode('euc-kr').decode('latin1')
        except Exception:
            resource_ansi = resource_name

        paths_to_try = [
            f"data/texture/유저인터페이스/item/{resource_name}.bmp".lower(),
            f"data/texture/유저인터페이스/item/{item_id}.bmp".lower(),
            f"data/texture/À¯ÀúÀÎÅÍÆäÀÌ½º/item/{resource_name}.bmp".lower(),
            f"data/texture/À¯ÀúÀÎÅÍÆäÀÌ½º/item/{item_id}.bmp".lower(),
            f"data/texture/userinterface/item/{resource_name}.bmp".lower(),
            f"data/texture/userinterface/item/{item_id}.bmp".lower(),
            f"data/texture/À¯ÀúÀÎÅÍÆäÀÌ½º/item/{resource_ansi}.bmp".lower(),
            f"data/texture/userinterface/item/{resource_ansi}.bmp".lower(),
        ]

        for path in paths_to_try:
            bmp_data = self.extract_file(path)
            if bmp_data:
                png_data = self.convert_bmp_to_png(bmp_data)
                if png_data:
                    return png_data

        return self.generate_dummy_png()

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
        return self._save_asset(f"data/sprite/아이템/{resource_name}.bmp", bmp_bytes)

    def save_mob_spr(self, aegis_name: str, spr_bytes: bytes) -> str:
        """
        Saves a .spr sprite file for a monster — picked up automatically by find_mob_files().
        """
        return self._save_asset(f"data/sprite/몬스터/{aegis_name}.spr", spr_bytes)

    def save_mob_act(self, aegis_name: str, act_bytes: bytes) -> str:
        """Saves a .act action file for a monster."""
        return self._save_asset(f"data/sprite/몬스터/{aegis_name}.act", act_bytes)


grf_reader = GRFReader()
