import io
import struct
import logging
from typing import List, Dict, Any

logger = logging.getLogger("sprite_engine.act_parser")

class ActParser:
    """
    Parser for Ragnarok Online Action (.act) files.
    Reads animation frames, layers (sprites), events, intervals, and attachment points.
    """
    def __init__(self, data: bytes):
        self.stream = io.BytesIO(data)
        self.actions: List[List[Dict[str, Any]]] = []
        self.events: List[str] = []
        self.intervals: List[float] = []
        self.version = 0
        self.parse()

    def parse(self):
        # 1. Header parsing
        sig = self.stream.read(4)
        if len(sig) < 4 or not sig.startswith(b'AC'):
            logger.error(f"Invalid ACT signature: {sig}")
            raise ValueError(f"Invalid ACT signature: {sig}")

        version_bytes = self.stream.read(2)
        if len(version_bytes) < 2:
            logger.error("Unexpected end of file while reading ACT version")
            raise ValueError("Unexpected end of file while reading ACT version")

        # Major/Minor version e.g. 0x0201 (usually version[1] is major, version[0] is minor)
        self.version = version_bytes[1] * 256 + version_bytes[0]
        logger.info(f"Parsing ACT version {hex(self.version)}")

        try:
            num_actions = struct.unpack('<H', self.stream.read(2))[0]
            # Skip 10 reserved bytes
            self.stream.read(10)
        except struct.error as e:
            logger.error(f"Failed to unpack actions count: {e}")
            raise ValueError(f"Failed to unpack actions count: {e}")

        logger.info(f"Actions count: {num_actions}")

        # 2. Parse Actions
        for act_idx in range(num_actions):
            try:
                num_frames = struct.unpack('<I', self.stream.read(4))[0]
                frames = []
                
                for frame_idx in range(num_frames):
                    # Skip 32 reserved/range bytes (range1: 16 bytes, range2: 16 bytes)
                    self.stream.read(32)
                    
                    num_sprites = struct.unpack('<I', self.stream.read(4))[0]
                    sprites = []
                    
                    for spr_idx in range(num_sprites):
                        # Sprite coordinate decoding depends on ACT version
                        if self.version >= 0x0206:
                            x = struct.unpack('<f', self.stream.read(4))[0]
                            y = struct.unpack('<f', self.stream.read(4))[0]
                        else:
                            x = float(struct.unpack('<i', self.stream.read(4))[0])
                            y = float(struct.unpack('<i', self.stream.read(4))[0])

                        sprite_num = struct.unpack('<i', self.stream.read(4))[0]
                        mirror = struct.unpack('<i', self.stream.read(4))[0]

                        # Extended features starting from v2.0
                        color = 0xFFFFFFFF
                        scale_x = 1.0
                        scale_y = 1.0
                        rotation = 0
                        spr_type = 0
                        width = 0
                        height = 0

                        if self.version >= 0x0200:
                            color = struct.unpack('<I', self.stream.read(4))[0]
                            scale_x = struct.unpack('<f', self.stream.read(4))[0]
                            scale_y = scale_x
                            
                            if self.version >= 0x0204:
                                scale_y = struct.unpack('<f', self.stream.read(4))[0]

                            rotation = struct.unpack('<i', self.stream.read(4))[0]
                            spr_type = struct.unpack('<i', self.stream.read(4))[0]

                            if self.version >= 0x0205:
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

                    # Event ID (v2.0+)
                    event_id = -1
                    if self.version >= 0x0200:
                        event_id = struct.unpack('<i', self.stream.read(4))[0]

                    # Attachment Points (v2.3+)
                    attach_points = []
                    if self.version >= 0x0203:
                        num_attach_points = struct.unpack('<I', self.stream.read(4))[0]
                        for ap_idx in range(num_attach_points):
                            ap_data = self.stream.read(16)
                            if len(ap_data) < 16:
                                logger.warning(f"Truncated attachment point data in Act {act_idx}, Frame {frame_idx}")
                                break
                            
                            # Attachment point coordinates format matches coordinates format
                            if self.version >= 0x0206:
                                ap_x, ap_y = struct.unpack('<ff', ap_data[0:8])
                            else:
                                ap_x_int, ap_y_int = struct.unpack('<ii', ap_data[0:8])
                                ap_x, ap_y = float(ap_x_int), float(ap_y_int)
                                
                            ap_id, attr = struct.unpack('<ii', ap_data[8:16])
                            attach_points.append({
                                'x': ap_x,
                                'y': ap_y,
                                'id': ap_id,
                                'attr': attr
                            })

                    frames.append({
                        'sprites': sprites,
                        'event_id': event_id,
                        'attach_points': attach_points
                    })
                
                self.actions.append(frames)
            except Exception as e:
                logger.error(f"Failed to parse action {act_idx}: {e}")
                raise ValueError(f"Failed to parse action {act_idx}: {e}")

        # 3. Parse Events
        if self.version >= 0x0201:
            try:
                num_events = struct.unpack('<I', self.stream.read(4))[0]
                for ev_idx in range(num_events):
                    event_bytes = self.stream.read(40)
                    try:
                        name = event_bytes.decode('euc-kr').split('\x00')[0]
                    except Exception:
                        name = event_bytes.decode('latin-1').split('\x00')[0]
                    self.events.append(name)
            except Exception as e:
                logger.warning(f"Failed or skipped parsing events: {e}")

        # 4. Parse Intervals
        if self.version >= 0x0202:
            try:
                for act_idx in range(num_actions):
                    interval = struct.unpack('<f', self.stream.read(4))[0]
                    self.intervals.append(interval)
            except Exception as e:
                logger.warning(f"Failed or skipped parsing intervals: {e}")
