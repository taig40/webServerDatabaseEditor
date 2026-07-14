import io
import struct
import logging
from PIL import Image
from typing import List, Tuple

logger = logging.getLogger("sprite_engine.spr_parser")

def decompress_rle(data: bytes) -> bytes:
    """
    Decompresses RLE-encoded pixel data from a Ragnarok SPR file.
    RLE rules:
    - A 0x00 byte represents transparent pixels and is followed by a count byte.
    - Any other byte represents a color palette index and is copied directly.
    """
    decompressed = bytearray()
    i = 0
    data_len = len(data)
    while i < data_len:
        byte = data[i]
        if byte == 0x00:
            if i + 1 < data_len:
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


class SprParser:
    """
    Parser for Ragnarok Online Sprite (.spr) files.
    Extracts indexed (palette-based) and RGBA frames as PIL Image objects.
    """
    def __init__(self, data: bytes):
        self.stream = io.BytesIO(data)
        self.indexed_frames = []
        self.rgba_frames = []
        self.palette = []
        self.images: List[Image.Image] = []
        self.version = 0
        self.parse()

    def parse(self):
        # 1. Header parsing
        sig = self.stream.read(4)
        if len(sig) < 4 or not sig.startswith(b'SP'):
            logger.error(f"Invalid SPR signature: {sig}")
            raise ValueError(f"Invalid SPR signature: {sig}")

        version_bytes = self.stream.read(2)
        if len(version_bytes) < 2:
            logger.error("Unexpected end of file while reading SPR version")
            raise ValueError("Unexpected end of file while reading SPR version")

        # Major/Minor version e.g. 0x0201 (usually version[1] is major, version[0] is minor)
        self.version = version_bytes[1] * 256 + version_bytes[0]
        logger.info(f"Parsing SPR version {hex(self.version)}")

        try:
            num_indexed = struct.unpack('<H', self.stream.read(2))[0]
            num_rgba = struct.unpack('<H', self.stream.read(2))[0]
        except struct.error as e:
            logger.error(f"Failed to unpack frame counts: {e}")
            raise ValueError(f"Failed to unpack frame counts: {e}")

        logger.info(f"Frames count: Indexed={num_indexed}, RGBA={num_rgba}")

        # 2. Parse Indexed Frames
        for idx in range(num_indexed):
            try:
                w = struct.unpack('<H', self.stream.read(2))[0]
                h = struct.unpack('<H', self.stream.read(2))[0]
                
                if self.version >= 0x0201:
                    comp_size = struct.unpack('<H', self.stream.read(2))[0]
                    comp_data = self.stream.read(comp_size)
                    frame_data = decompress_rle(comp_data)
                else:
                    frame_data = self.stream.read(w * h)
                
                self.indexed_frames.append({
                    'width': w,
                    'height': h,
                    'data': frame_data
                })
            except Exception as e:
                logger.error(f"Failed to parse indexed frame {idx}: {e}")
                raise ValueError(f"Failed to parse indexed frame {idx}: {e}")

        # 3. Parse RGBA Frames
        for idx in range(num_rgba):
            try:
                w = struct.unpack('<H', self.stream.read(2))[0]
                h = struct.unpack('<H', self.stream.read(2))[0]
                frame_data = self.stream.read(w * h * 4)  # ABGR format
                
                self.rgba_frames.append({
                    'width': w,
                    'height': h,
                    'data': frame_data
                })
            except Exception as e:
                logger.error(f"Failed to parse RGBA frame {idx}: {e}")
                raise ValueError(f"Failed to parse RGBA frame {idx}: {e}")

        # 4. Parse Palette (located at the end of the file)
        palette_data = self.stream.read(1024)
        if len(palette_data) >= 1024:
            for i in range(256):
                offset = i * 4
                r = palette_data[offset]
                g = palette_data[offset + 1]
                b = palette_data[offset + 2]
                
                # Index 0 is transparent. Magic color #FF00FF (magenta) is also transparent.
                a = 255
                if i == 0 or (r == 255 and g == 0 and b == 255):
                    a = 0
                
                self.palette.append((r, g, b, a))
        else:
            logger.warning("SPR file palette missing or truncated. Falling back to grayscale palette.")
            # Fallback palette (grayscale)
            for i in range(256):
                a = 0 if i == 0 else 255
                self.palette.append((i, i, i, a))

        # 5. Build final list of PIL Image objects
        self.decode_images()

    def decode_images(self):
        """Converts indexed and RGBA raw frames into PIL Image objects."""
        # Convert indexed frames
        for frame in self.indexed_frames:
            w = frame['width']
            h = frame['height']
            raw_data = frame['data']
            pixels = []
            
            total_pixels = w * h
            for i in range(total_pixels):
                pal_idx = raw_data[i] if i < len(raw_data) else 0
                if pal_idx < len(self.palette):
                    pixels.append(self.palette[pal_idx])
                else:
                    pixels.append((0, 0, 0, 0))
            
            img = Image.new("RGBA", (w, h))
            img.putdata(pixels)
            self.images.append(img)

        # Convert RGBA frames
        for frame in self.rgba_frames:
            w = frame['width']
            h = frame['height']
            raw_data = frame['data']
            pixels = []
            
            total_pixels = w * h
            for i in range(total_pixels):
                offset = i * 4
                if offset + 3 < len(raw_data):
                    # Stored in BGRA format
                    b = raw_data[offset]
                    g = raw_data[offset + 1]
                    r = raw_data[offset + 2]
                    a = raw_data[offset + 3]
                    pixels.append((r, g, b, a))
                else:
                    pixels.append((0, 0, 0, 0))
            
            img = Image.new("RGBA", (w, h))
            img.putdata(pixels)
            self.images.append(img)

    def get_images(self) -> List[Image.Image]:
        """Returns the decoded frames as a list of PIL Image objects."""
        return self.images

    def get_image(self, spr_num: int, spr_type: int) -> Optional[Image.Image]:
        """
        Safely retrieves a PIL Image frame by its type-specific index.
        spr_type 0 = Indexed palette-based sprite
        spr_type 1 = RGBA sprite
        """
        if spr_type == 0:
            if 0 <= spr_num < len(self.indexed_frames):
                return self.images[spr_num]
        else:
            if 0 <= spr_num < len(self.rgba_frames):
                indexed_count = len(self.indexed_frames)
                if indexed_count + spr_num < len(self.images):
                    return self.images[indexed_count + spr_num]
        return None
