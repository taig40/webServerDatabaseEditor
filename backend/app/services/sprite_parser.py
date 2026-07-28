import struct
import io
import base64
import os
import zlib
from PIL import Image
from app.services.grf_reader import grf_reader

def decompress_rle(data: bytes) -> bytes:
    decompressed = bytearray()
    i = 0
    while i < len(data):
        byte = data[i]
        if byte == 0x00:
            if i + 1 < len(data):
                count = data[i + 1]
                decompressed.extend([0x00] * count)
                i += 2
            else:
                decompressed.append(0x00)
                i += 1
        else:
            decompressed.append(byte)
            i += 1
    return bytes(decompressed)

class LuaConstantsExtractor:
    def __init__(self, data):
        self.stream = io.BytesIO(data)
        
    def read_byte(self):
        b = self.stream.read(1)
        return b[0] if b else None
        
    def read_int(self):
        return struct.unpack('<I', self.stream.read(4))[0]
        
    def read_size_t(self):
        return struct.unpack(f'<{self.size_t_fmt}', self.stream.read(self.size_t_size))[0]
        
    def read_number(self):
        return struct.unpack('<d', self.stream.read(8))[0]
        
    def parse(self):
        sig = self.stream.read(4)
        if sig != b'\x1bLua':
            raise ValueError("Not Lua bytecode")
        version = self.read_byte()
        format_version = self.read_byte()
        endianness = self.read_byte()
        self.int_size = self.read_byte()
        self.size_t_size = self.read_byte()
        self.size_t_fmt = 'I' if self.size_t_size == 4 else 'Q'
        self.instruction_size = self.read_byte()
        self.number_size = self.read_byte()
        self.integral_flag = self.read_byte()
        
        self.all_constants = []
        try:
            self.parse_function()
        except:
            pass
        return self.all_constants
        
    def parse_function(self):
        src_len = self.read_size_t()
        src = self.stream.read(src_len)
        line_defined = self.read_int()
        last_line_defined = self.read_int()
        num_upvalues = self.read_byte()
        num_params = self.read_byte()
        is_vararg = self.read_byte()
        max_stack_size = self.read_byte()
        
        num_instructions = self.read_int()
        self.stream.read(num_instructions * 4)
        
        num_constants = self.read_int()
        for i in range(num_constants):
            t = self.read_byte()
            if t == 0:
                val = None
            elif t == 1:
                val = self.read_byte() != 0
            elif t == 3:
                val = self.read_number()
            elif t == 4:
                s_len = self.read_size_t()
                val = self.stream.read(s_len).decode('euc-kr', errors='replace').rstrip('\x00')
            else:
                val = None
            if val is not None:
                self.all_constants.append(val)
            
        num_protos = self.read_int()
        for i in range(num_protos):
            self.parse_function()
            
        num_lineinfo = self.read_int()
        self.stream.read(num_lineinfo * 4)
        num_localvars = self.read_int()
        for _ in range(num_localvars):
            name_len = self.read_size_t()
            self.stream.read(name_len)
            self.read_int()
            self.read_int()
        num_upvals = self.read_int()
        for _ in range(num_upvals):
            name_len = self.read_size_t()
            self.stream.read(name_len)

_id_to_sprite_map = None

def _load_lub_mappings():
    global _id_to_sprite_map
    if _id_to_sprite_map is not None:
        return
        
    _id_to_sprite_map = {}
    if not grf_reader.loaded:
        return
        
    try:
        npc_bytes = grf_reader.extract_file('data/luafiles514/lua files/datainfo/npcidentity.lub')
        job_bytes = grf_reader.extract_file('data/luafiles514/lua files/datainfo/jobname.lub')
        
        if npc_bytes and job_bytes:
            # Parse npc constants
            npc_extractor = LuaConstantsExtractor(npc_bytes)
            npc_consts = npc_extractor.parse()
            
            npc_map = {}
            for i in range(len(npc_consts) - 1):
                k = npc_consts[i]
                v = npc_consts[i+1]
                if isinstance(k, str) and k.startswith("JT_") and isinstance(v, (int, float)):
                    npc_map[k] = int(v)
                    
            # Parse job constants
            job_extractor = LuaConstantsExtractor(job_bytes)
            job_consts = job_extractor.parse()
            
            job_map = {}
            for i in range(len(job_consts) - 1):
                k = job_consts[i]
                v = job_consts[i+1]
                if isinstance(k, str) and k.startswith("JT_") and isinstance(v, str) and not v.startswith("JT_"):
                    job_map[k] = v
                    
            # Invert npc_map to get ID -> JT
            id_to_jt = {}
            for jt, mob_id in npc_map.items():
                id_to_jt[mob_id] = jt
                
            # Build final map
            for mob_id, jt in id_to_jt.items():
                if jt in job_map:
                    _id_to_sprite_map[mob_id] = job_map[jt]
                elif jt.startswith("JT_"):
                    _id_to_sprite_map[mob_id] = jt[3:].lower()
                else:
                    _id_to_sprite_map[mob_id] = jt.lower()
                    
            print(f"[SpriteParser] Mapeados {len(_id_to_sprite_map)} sprites de monstros com base nos arquivos LUB do kRO.")
    except Exception as e:
        print(f"[SpriteParser] Falha ao parsear mapeamento LUB: {e}")

def get_sprite_name_for_mob(mob_id: int, fallback_aegis: str = None) -> str:
    # Mapeamento estático para mobs do Biolabs (que usam nomes de classes mas possuem sprites pré-renderizados no GRF)
    BIOLABS_SPRITE_MAP = {
        'lord_knight': '4_m_md_seyren',
        'assassin_cross': '4_m_md_eremes',
        'high_wizard': '4_f_md_katrinn',
        'high_priest': '4_f_md_magaleta',
        'sniper': '4_f_md_shecil',
        'whitesmith': '4_m_md_harword',
    }

    # Sempre preferir o AegisName pois é como os sprites do kRO são salvos
    if fallback_aegis:
        aegis_lower = fallback_aegis.lower()
        if aegis_lower in BIOLABS_SPRITE_MAP:
            return BIOLABS_SPRITE_MAP[aegis_lower]
        return fallback_aegis
    
    # Fallback pro LUB só se não tiver AegisName
    _load_lub_mappings()
    if _id_to_sprite_map and mob_id in _id_to_sprite_map:
        return _id_to_sprite_map[mob_id]
        
    return None

class SprParser:
    def __init__(self, data: bytes):
        self.stream = io.BytesIO(data)
        self.indexed_frames = []  # list of dicts: {width, height, data}
        self.rgba_frames = []     # list of dicts: {width, height, data}
        self.palette = []          # list of tuples: (r, g, b, a)
        self.parse()

    def parse(self):
        # 1. Header
        sig = self.stream.read(2)
        if sig != b'SP':
            raise ValueError("Invalid SPR signature")
            
        version_bytes = self.stream.read(2)
        version = version_bytes[1] * 256 + version_bytes[0]  # major.minor e.g. 0x0201
        
        num_indexed = struct.unpack('<H', self.stream.read(2))[0]
        num_rgba = struct.unpack('<H', self.stream.read(2))[0]
        
        # 2. Read Indexed Frames Sequentially (Header + Data)
        for _ in range(num_indexed):
            w = struct.unpack('<H', self.stream.read(2))[0]
            h = struct.unpack('<H', self.stream.read(2))[0]
            if version >= 0x0201:
                comp_size = struct.unpack('<H', self.stream.read(2))[0]
                frame_data_comp = self.stream.read(comp_size)
                frame_data = decompress_rle(frame_data_comp)
            else:
                frame_data = self.stream.read(w * h)
            self.indexed_frames.append({'width': w, 'height': h, 'data': frame_data})
            
        # 3. Read RGBA Frames Sequentially (Header + Data)
        for _ in range(num_rgba):
            w = struct.unpack('<H', self.stream.read(2))[0]
            h = struct.unpack('<H', self.stream.read(2))[0]
            frame_data = self.stream.read(w * h * 4)  # ABGR format
            self.rgba_frames.append({'width': w, 'height': h, 'data': frame_data})
            
        # 4. Read Palette (always 1024 bytes at the end of frames)
        palette_data = self.stream.read(1024)
        if len(palette_data) >= 1024:
            for i in range(256):
                offset = i * 4
                r = palette_data[offset]
                g = palette_data[offset + 1]
                b = palette_data[offset + 2]
                a = 0 if i == 0 else 255  # Palette index 0 is transparent background
                self.palette.append((r, g, b, a))
        else:
            # Fallback palette (grayscale)
            for i in range(256):
                a = 0 if i == 0 else 255
                self.palette.append((i, i, i, a))

class ActParser:
    def __init__(self, data: bytes):
        self.stream = io.BytesIO(data)
        self.actions = []
        self.events = []
        self.intervals = []
        self.parse()

    def parse(self):
        sig = self.stream.read(2)
        if sig != b'AC':
            raise ValueError("Invalid ACT signature")
            
        version_bytes = self.stream.read(2)
        version = version_bytes[1] * 256 + version_bytes[0]
        
        n_actions = struct.unpack('<H', self.stream.read(2))[0]
        self.stream.read(10)  # skip 10 reserved bytes
        
        # Parse Actions
        for _ in range(n_actions):
            n_frames = struct.unpack('<I', self.stream.read(4))[0]
            frames = []
            for _ in range(n_frames):
                self.stream.read(32)  # skip range1 (16) and range2 (16)
                n_sprites = struct.unpack('<I', self.stream.read(4))[0]
                
                sprites = []
                for _ in range(n_sprites):
                    if version >= 0x0206:
                        x = int(struct.unpack('<f', self.stream.read(4))[0])
                        y = int(struct.unpack('<f', self.stream.read(4))[0])
                    else:
                        x = struct.unpack('<i', self.stream.read(4))[0]
                        y = struct.unpack('<i', self.stream.read(4))[0]
                        
                    sprite_num = struct.unpack('<i', self.stream.read(4))[0]
                    mirror = struct.unpack('<i', self.stream.read(4))[0]
                    
                    color = 0xFFFFFFFF
                    scale_x = 1.0
                    scale_y = 1.0
                    rotation = 0
                    spr_type = 0
                    width = 0
                    height = 0
                    
                    if version >= 0x0200:
                        color = struct.unpack('<I', self.stream.read(4))[0]  # RGBA color tint
                        scale_x = struct.unpack('<f', self.stream.read(4))[0]
                        scale_y = scale_x
                        if version >= 0x0204:
                            scale_y = struct.unpack('<f', self.stream.read(4))[0]
                            
                        rotation = struct.unpack('<i', self.stream.read(4))[0]
                        spr_type = struct.unpack('<i', self.stream.read(4))[0]
                        
                        if version >= 0x0205:
                            width = struct.unpack('<i', self.stream.read(4))[0]
                            height = struct.unpack('<i', self.stream.read(4))[0]
                        
                    sprites.append({
                        'x': x,
                        'y': y,
                        'sprite_num': sprite_num,
                        'mirror': mirror,
                        'color': color,
                        'scale_x': scale_x,
                        'scale_y': scale_y,
                        'rotation': rotation,
                        'spr_type': spr_type,
                        'width': width,
                        'height': height
                    })
                    
                event_id = -1
                if version >= 0x0200:
                    event_id = struct.unpack('<i', self.stream.read(4))[0]
                    
                if version >= 0x0203:
                    n_attach_points = struct.unpack('<I', self.stream.read(4))[0]
                    for _ in range(n_attach_points):
                        self.stream.read(16)  # skip reserved(4), x(4), y(4), attr(4)
                        
                frames.append({
                    'sprites': sprites,
                    'event_id': event_id
                })
            self.actions.append(frames)
            
        # Parse Events
        if version >= 0x0201:
            try:
                n_events = struct.unpack('<I', self.stream.read(4))[0]
                for _ in range(n_events):
                    event_name_bytes = self.stream.read(40)
                    try:
                        name = event_name_bytes.decode('euc-kr').split('\x00')[0]
                    except:
                        name = event_name_bytes.decode('latin1').split('\x00')[0]
                    self.events.append(name)
            except:
                pass
                
        # Parse Intervals
        if version >= 0x0202:
            try:
                for _ in range(n_actions):
                    interval = struct.unpack('<f', self.stream.read(4))[0]
                    self.intervals.append(interval)
            except:
                pass

def find_mob_files(sprite_name: str):
    name_lower = sprite_name.lower()

    korean_folder_bytes = "몬스터".encode('euc-kr')
    korean_folder_latin = korean_folder_bytes.decode('latin1')

    paths_to_try = [
        f"data/sprite/몬스터/{name_lower}",
        f"data/sprite/{korean_folder_latin}/{name_lower}",
        f"data/sprite/¸ó½ºÅÍ/{name_lower}",
        f"data/sprite/monster/{name_lower}",
        f"data/sprite/npc/{name_lower}",
        f"data/sprite/¸ó½ºÅÍ/{sprite_name}",
        f"data/sprite/homun/{name_lower}",
        f"data/sprite/homun/{name_lower}_h",
        f"data/sprite/homun/{name_lower}_h2",
        f"data/sprite/homunculus/{name_lower}",
    ]

    for path in paths_to_try:
        spr_path = f"{path}.spr"
        act_path = f"{path}.act"
        if grf_reader.extract_file(spr_path):
            return spr_path, act_path
    return None, None


def find_item_equip_sprite_files(resource_name: str):
    """Searches GRF paths for a pet accessory (EquipItem) sprite.

    Pet accessories in kRO are stored under ``data/sprite/아이템/`` using the
    item's ``identifiedResourceName`` from iteminfo.  This function tries the
    known Korean and ASCII-escaped folder variants so that both GRF packaged
    with kRO encoding and repacked GRFs are covered.

    Args:
        resource_name: The item resource name (``identifiedResourceName``),
            e.g. ``Silk_Ribbon``.

    Returns:
        tuple[str, str] | tuple[None, None]: Pair of ``(spr_path, act_path)``
            if found; ``(None, None)`` otherwise.
    """
    name_lower = resource_name.lower()

    # Korean "아이템" encoded variants used across different GRF distributions
    item_folder_variants = [
        "아이템",
        "¾ÆÀÌÅÛz",  # common mojibake variant
        "¾ÆÀÌÅÛ",
        "item",
    ]

    paths_to_try = []
    for folder in item_folder_variants:
        paths_to_try.append(f"data/sprite/{folder}/{name_lower}")
        paths_to_try.append(f"data/sprite/{folder}/{resource_name}")

    for path in paths_to_try:
        spr_path = f"{path}.spr"
        act_path = f"{path}.act"
        if grf_reader.extract_file(spr_path):
            return spr_path, act_path
    return None, None


def get_item_equip_animation_data(resource_name: str) -> dict:
    """Loads SPR + ACT files for an item equip sprite and returns spritesheet animation data.

    Uses the same pipeline as ``get_mob_animation_data`` — Action 0 (idle,
    facing south) is packed into a horizontal spritesheet and returned as a
    JSON-serialisable dict.

    Args:
        resource_name: The item resource name from iteminfo
            (e.g. ``Silk_Ribbon``).

    Returns:
        dict | None: Animation data suitable for the canvas renderer, or
            ``None`` if the sprite cannot be found or parsed.
    """
    spr_path, act_path = find_item_equip_sprite_files(resource_name)
    if not spr_path or not act_path:
        return None

    spr_bytes = grf_reader.extract_file(spr_path)
    act_bytes = grf_reader.extract_file(act_path)
    if not spr_bytes or not act_bytes:
        return None

    try:
        spr = SprParser(spr_bytes)
        act = ActParser(act_bytes)
    except Exception as e:
        print(f"[SpriteParser] Error parsing equip sprite {resource_name}: {e}")
        return None

    if not act.actions:
        return None

    action_0_frames = act.actions[0]

    used_spr_indices = set()
    for frame in action_0_frames:
        for sprite in frame['sprites']:
            if sprite['sprite_num'] >= 0:
                used_spr_indices.add((sprite['sprite_num'], sprite['spr_type']))

    pil_frames = {}
    for spr_num, spr_type in used_spr_indices:
        img = _decode_spr_frame(spr, spr_num, spr_type)
        if img is not None:
            pil_frames[(spr_num, spr_type)] = img

    if not pil_frames:
        return None

    import io, base64
    from PIL import Image

    unique_keys = list(pil_frames.keys())
    sheet_width = sum(pil_frames[k].width for k in unique_keys)
    sheet_height = max(pil_frames[k].height for k in unique_keys)

    spritesheet_img = Image.new("RGBA", (sheet_width, sheet_height))
    layout_map = {}
    current_x = 0
    for key in unique_keys:
        img = pil_frames[key]
        spritesheet_img.paste(img, (current_x, 0))
        layout_map[key] = {'x': current_x, 'y': 0, 'w': img.width, 'h': img.height}
        current_x += img.width

    buffered = io.BytesIO()
    spritesheet_img.save(buffered, format="PNG")
    spritesheet_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

    mapped_frames = []
    for frame in action_0_frames:
        patches = []
        for sprite in frame['sprites']:
            num = sprite['sprite_num']
            t = sprite['spr_type']
            if num >= 0 and (num, t) in layout_map:
                pl = layout_map[(num, t)]
                # ACT color field: stored as little-endian BGRA (B=byte0, G=byte1, R=byte2, A=byte3)
                color = sprite.get('color', 0xFFFFFFFF)
                b_ch = color & 0xFF
                g_ch = (color >> 8) & 0xFF
                r_ch = (color >> 16) & 0xFF
                a_ch = (color >> 24) & 0xFF
                patches.append({
                    'x': sprite['x'],
                    'y': sprite['y'],
                    'mirror': sprite['mirror'],
                    'scale_x': sprite['scale_x'],
                    'scale_y': sprite['scale_y'],
                    'rotation': sprite['rotation'],
                    'rgba': [r_ch, g_ch, b_ch, a_ch],
                    'spr_type': t,
                    'sheet_x': pl['x'],
                    'sheet_y': pl['y'],
                    'w': pl['w'],
                    'h': pl['h'],
                })
        mapped_frames.append({'patches': patches})

    interval_ms = 150
    if act.intervals:
        interval_ms = int(act.intervals[0] * 25)
        if interval_ms <= 0:
            interval_ms = 150

    return {
        'spritesheet': f"data:image/png;base64,{spritesheet_base64}",
        'frame_duration': interval_ms,
        'frames': mapped_frames,
    }




def _decode_spr_frame(spr: SprParser, spr_num: int, spr_type: int) -> 'Image.Image | None':
    """
    Decode a single SPR frame into a PIL RGBA Image.
    Returns None if the frame index is out of bounds.

    spr_type 0 = Indexed palette-based (Indexed8)
      - Colour key: palette[0] is ALWAYS transparent, by kRO engine spec.
      - No secondary / top-left fallback — that heuristic destroys glows.

    spr_type 1 = BGRA32 (stored as B, G, R, A bytes)
      - Native per-pixel alpha — no colour key whatsoever.
      - Any colorkey manipulation here would destroy semi-transparent effects
        such as glows, halos, and shadows.
    """
    if spr_type == 0:
        # ── Indexed palette sprite ───────────────────────────────────────────
        if spr_num >= len(spr.indexed_frames):
            return None
        frame_info = spr.indexed_frames[spr_num]
        w = frame_info['width']
        h = frame_info['height']
        raw = frame_info['data']
        total = w * h

        # palette[0] is the transparent background colour by RO spec.
        bg_color: tuple[int, int, int] = spr.palette[0][:3] if spr.palette else (0, 0, 0)

        pixels: list[tuple[int, int, int, int]] = []
        for j in range(total):
            idx = raw[j] if j < len(raw) else 0
            if idx < len(spr.palette):
                r, g, b, a = spr.palette[idx]
                # Index 0 ← transparent regardless of the RGB stored there.
                # Other indices: use the palette alpha (always 255 from SprParser).
                if idx == 0:
                    pixels.append((0, 0, 0, 0))
                else:
                    pixels.append((r, g, b, a))
            else:
                pixels.append((0, 0, 0, 0))

        img = Image.new("RGBA", (w, h))
        img.putdata(pixels)
        return img

    else:
        # ── BGRA32 sprite ────────────────────────────────────────────────────
        # The file stores bytes in B, G, R, A order (little-endian BGRA).
        #
        # Transparency rules (matches kRO client behaviour):
        #   1. Pixels where a == 0  → fully transparent (native alpha).
        #   2. Pixels where 0 < a < 255 → semi-transparent glow/halo; keep as-is.
        #   3. Pixels where a == 255 AND colour is one of the known "magic"
        #      background colours → treat as transparent (colour-key).
        #
        # Known magic background colours (in decoded RGBA):
        #   • (255, 255,   0) – yellow  — most common in kRO BGRA32 sprites
        #   • (255,   0, 255) – magenta — classic RO indexed legacy colour
        #   • (  0, 255,   0) – green   — alternate background used in some packs
        #
        # The top-left-pixel heuristic is intentionally ABSENT: it is too
        # aggressive and breaks sprites whose first pixel happens to be part of
        # the actual image (e.g. glow border pixels).
        if spr_num >= len(spr.rgba_frames):
            return None
        frame_info = spr.rgba_frames[spr_num]
        w = frame_info['width']
        h = frame_info['height']
        raw = frame_info['data']
        total = w * h

        pixels = []
        for j in range(total):
            offset = j * 4
            if offset + 3 < len(raw):
                b = raw[offset]
                g = raw[offset + 1]
                r = raw[offset + 2]
                a = raw[offset + 3]

                # Apply colour-key only for fully-opaque magic background colours.
                # Semi-transparent pixels (0 < a < 255) are kept to preserve glows.
                if a == 255 and (
                    (r == 255 and g == 255 and b == 0) or   # yellow
                    (r == 255 and g == 0   and b == 255) or  # magenta
                    (r == 0   and g == 255 and b == 0)       # green
                ):
                    pixels.append((0, 0, 0, 0))
                else:
                    pixels.append((r, g, b, a))
            else:
                pixels.append((0, 0, 0, 0))

        img = Image.new("RGBA", (w, h))
        img.putdata(pixels)
        return img



def get_mob_animation_data(sprite_name: str) -> dict:
    """
    Load SPR + ACT files for a mob sprite and return a spritesheet with frame metadata.
    Returns None if the sprite cannot be found or parsed.
    """
    spr_path, act_path = find_mob_files(sprite_name)
    if not spr_path or not act_path:
        print(f"[!] Sprite or Action files not found for mob: {sprite_name}")
        return None

    spr_bytes = grf_reader.extract_file(spr_path)
    act_bytes = grf_reader.extract_file(act_path)

    if not spr_bytes or not act_bytes:
        return None

    try:
        spr = SprParser(spr_bytes)
        act = ActParser(act_bytes)
    except Exception as e:
        print(f"[!] Error parsing SPR/ACT for {sprite_name}: {e}")
        return None

    if not act.actions:
        return None

    # Action 0 = Idle animation facing South
    action_0_frames = act.actions[0]

    # 1. Collect unique (spr_num, spr_type) pairs referenced in Action 0
    used_spr_indices = set()
    for frame in action_0_frames:
        for sprite in frame['sprites']:
            if sprite['sprite_num'] >= 0:
                used_spr_indices.add((sprite['sprite_num'], sprite['spr_type']))

    # 2. Decode each referenced SPR frame into a PIL Image
    pil_frames = {}
    for spr_num, spr_type in used_spr_indices:
        img = _decode_spr_frame(spr, spr_num, spr_type)
        if img is not None:
            pil_frames[(spr_num, spr_type)] = img

    if not pil_frames:
        return None

    # 3. Pack all unique frames into a single horizontal spritesheet
    unique_keys = list(pil_frames.keys())
    sheet_width = sum(pil_frames[k].width for k in unique_keys)
    sheet_height = max(pil_frames[k].height for k in unique_keys)

    spritesheet_img = Image.new("RGBA", (sheet_width, sheet_height))
    layout_map = {}   # (spr_num, spr_type) -> {x, y, w, h}
    current_x = 0
    for key in unique_keys:
        img = pil_frames[key]
        spritesheet_img.paste(img, (current_x, 0))
        layout_map[key] = {
            'x': current_x,
            'y': 0,
            'w': img.width,
            'h': img.height
        }
        current_x += img.width

    # Convert to base64 PNG
    buffered = io.BytesIO()
    spritesheet_img.save(buffered, format="PNG")
    spritesheet_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

    # 4. Build per-ACT-frame patch lists that reference the spritesheet
    mapped_frames = []
    for frame in action_0_frames:
        patches = []
        for sprite in frame['sprites']:
            num = sprite['sprite_num']
            t = sprite['spr_type']
            if num >= 0 and (num, t) in layout_map:
                pl = layout_map[(num, t)]
                # ACT color field: stored as little-endian BGRA (B=byte0, G=byte1, R=byte2, A=byte3)
                color = sprite.get('color', 0xFFFFFFFF)
                b_ch = color & 0xFF
                g_ch = (color >> 8) & 0xFF
                r_ch = (color >> 16) & 0xFF
                a_ch = (color >> 24) & 0xFF
                patches.append({
                    'x': sprite['x'],
                    'y': sprite['y'],
                    'mirror': sprite['mirror'],
                    'scale_x': sprite['scale_x'],
                    'scale_y': sprite['scale_y'],
                    'rotation': sprite['rotation'],
                    'rgba': [r_ch, g_ch, b_ch, a_ch],
                    'spr_type': t,
                    'sheet_x': pl['x'],
                    'sheet_y': pl['y'],
                    'w': pl['w'],
                    'h': pl['h']
                })
        mapped_frames.append({'patches': patches})

    # Frame interval: ACT stores interval in ~25ms units; default 150ms
    interval_ms = 150
    if act.intervals:
        interval_ms = int(act.intervals[0] * 25)
        if interval_ms <= 0:
            interval_ms = 150

    return {
        'spritesheet': f"data:image/png;base64,{spritesheet_base64}",
        'frame_duration': interval_ms,
        'frames': mapped_frames
    }
def get_pet_equipped_animation_data(base_mob: str, equip_resource_name: str = None) -> dict:
    spr_path, _ = find_mob_files(base_mob)
    if not spr_path:
        return None
        
    import os
    name_lower = base_mob.lower()
    
    korean_folder_bytes = "몬스터".encode('euc-kr')
    korean_folder_latin = korean_folder_bytes.decode('latin1')

    paths_to_try = [
        f"data/sprite/몬스터",
        f"data/sprite/{korean_folder_latin}",
        f"data/sprite/¸ó½ºÅÍ",
        f"data/sprite/monster",
        f"data/sprite/npc",
    ]
    
    act_path = None
    
    # 1. Try exact match using the equipment resource name
    if equip_resource_name:
        equip_res_lower = equip_resource_name.lower()
        target_name = f"{name_lower}_{equip_res_lower}.act"
        for dir_path in paths_to_try:
            test_act = f"{dir_path}/{target_name}"
            if grf_reader.extract_file(test_act):
                act_path = test_act
                break

    # 2. Fallback to searching any act file starting with base_mob_ in these directories
    if not act_path:
        for dir_path in paths_to_try:
            prefix = f"{dir_path}/{name_lower}_"
            for grf in grf_reader._grfs:
                for f in grf.files.keys():
                    if f.lower().startswith(prefix.lower()) and f.lower().endswith(".act"):
                        act_path = f
                        break
                if act_path:
                    break
            if act_path:
                break
            
    if not act_path:
        return None
        
    spr_bytes = grf_reader.extract_file(spr_path)
    act_bytes = grf_reader.extract_file(act_path)

    if not spr_bytes or not act_bytes:
        return None

    try:
        spr = SprParser(spr_bytes)
        act = ActParser(act_bytes)
    except Exception as e:
        print(f"[!] Error parsing SPR/ACT for pet {base_mob} accessory: {e}")
        return None

    if not act.actions:
        return None

    action_0_frames = act.actions[0]
    used_spr_indices = set()
    for frame in action_0_frames:
        for sprite in frame['sprites']:
            if sprite['sprite_num'] >= 0:
                used_spr_indices.add((sprite['sprite_num'], sprite['spr_type']))

    pil_frames = {}
    for spr_num, spr_type in used_spr_indices:
        img = _decode_spr_frame(spr, spr_num, spr_type)
        if img is not None:
            pil_frames[(spr_num, spr_type)] = img

    if not pil_frames:
        return None

    unique_keys = list(pil_frames.keys())
    sheet_width = sum(pil_frames[k].width for k in unique_keys)
    sheet_height = max(pil_frames[k].height for k in unique_keys)

    spritesheet_img = Image.new("RGBA", (sheet_width, sheet_height))
    layout_map = {}
    current_x = 0
    for key in unique_keys:
        img = pil_frames[key]
        spritesheet_img.paste(img, (current_x, 0))
        layout_map[key] = {
            'x': current_x,
            'y': 0,
            'w': img.width,
            'h': img.height
        }
        current_x += img.width

    buffered = io.BytesIO()
    spritesheet_img.save(buffered, format="PNG")
    spritesheet_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

    mapped_frames = []
    for frame in action_0_frames:
        patches = []
        for sprite in frame['sprites']:
            num = sprite['sprite_num']
            t = sprite['spr_type']
            if num >= 0 and (num, t) in layout_map:
                pl = layout_map[(num, t)]
                # ACT color field: stored as little-endian BGRA (B=byte0, G=byte1, R=byte2, A=byte3)
                color = sprite.get('color', 0xFFFFFFFF)
                b_ch = color & 0xFF
                g_ch = (color >> 8) & 0xFF
                r_ch = (color >> 16) & 0xFF
                a_ch = (color >> 24) & 0xFF
                patches.append({
                    'x': sprite['x'],
                    'y': sprite['y'],
                    'mirror': sprite['mirror'],
                    'scale_x': sprite['scale_x'],
                    'scale_y': sprite['scale_y'],
                    'rotation': sprite['rotation'],
                    'rgba': [r_ch, g_ch, b_ch, a_ch],
                    'spr_type': t,
                    'sheet_x': pl['x'],
                    'sheet_y': pl['y'],
                    'w': pl['w'],
                    'h': pl['h']
                })
        mapped_frames.append({'patches': patches})

    interval_ms = 150
    if act.intervals:
        interval_ms = int(act.intervals[0] * 25)
        if interval_ms <= 0:
            interval_ms = 150

    return {
        'spritesheet': f"data:image/png;base64,{spritesheet_base64}",
        'frame_duration': interval_ms,
        'frames': mapped_frames
    }
