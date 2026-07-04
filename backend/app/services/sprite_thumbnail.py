import io
import base64
from app.services.sprite_parser import get_sprite_name_for_mob, SprParser, ActParser
from app.services.grf_reader import grf_reader
from PIL import Image

def get_first_frame_png(mob_id: int, fallback_aegis: str = None) -> bytes:
    sprite_name = get_sprite_name_for_mob(mob_id, fallback_aegis)
    if not sprite_name:
        return None
        
    sprite_name = sprite_name.lower()
    # Define potential sprite folder prefixes to try
    from app.services.grf_reader import _KOREAN_MONSTER_FOLDER
    _KOREAN_DISCARDED_MONSTER_FOLDER = b'\xc6\xe4\xb1\xe2\xb8\xf3\xbd\xba\xc5\xcd'.decode('latin-1')

    folders_to_try = [
        f"data/sprite/{_KOREAN_MONSTER_FOLDER}",
        f"data/sprite/{_KOREAN_DISCARDED_MONSTER_FOLDER}",
        "data/sprite/monster",
        "data/sprite/npc",
    ]

    spr_bytes = None
    act_bytes = None

    for folder in folders_to_try:
        spr_p = f"{folder}/{sprite_name}.spr"
        act_p = f"{folder}/{sprite_name}.act"
        spr_bytes = grf_reader.extract_file(spr_p)
        if spr_bytes:
            act_bytes = grf_reader.extract_file(act_p)
            break

    if not spr_bytes or not act_bytes:
        return None
        
    spr = SprParser(spr_bytes)
    act = ActParser(act_bytes)
    
    # Render only action 0, frame 0
    if len(act.actions) > 0 and len(act.actions[0]) > 0:
        frame = act.actions[0][0]
        # Calculate bounding box
        min_x, min_y, max_x, max_y = 0, 0, 0, 0
        for sprite in frame['sprites']:
            num = sprite['sprite_num']
            t = sprite['spr_type']
            img = None
            if t == 0 and num < len(spr.indexed_frames):
                img = spr.indexed_frames[num]
            elif t == 1 and num < len(spr.rgba_frames):
                img = spr.rgba_frames[num]
            if not img: continue
            
            x1 = sprite['x'] - img['width'] // 2
            y1 = sprite['y'] - img['height'] // 2
            x2 = x1 + img['width']
            y2 = y1 + img['height']
            
            if x1 < min_x: min_x = x1
            if y1 < min_y: min_y = y1
            if x2 > max_x: max_x = x2
            if y2 > max_y: max_y = y2
            
        width = max_x - min_x
        height = max_y - min_y
        
        if width <= 0 or height <= 0:
            width, height = 50, 50
            
        out_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        
        for sprite in frame['sprites']:
            num = sprite['sprite_num']
            t = sprite['spr_type']
            img_dict = None
            if t == 0 and num < len(spr.indexed_frames):
                img_dict = spr.indexed_frames[num]
            elif t == 1 and num < len(spr.rgba_frames):
                img_dict = spr.rgba_frames[num]
            if not img_dict: continue
            
            if t == 0:
                pil_img = Image.new("RGBA", (img_dict['width'], img_dict['height']))
                pixels = []
                for b in img_dict['data']:
                    if b == 0:
                        pixels.append((0, 0, 0, 0))
                    else:
                        pixels.append(spr.palette[b])
                pil_img.putdata(pixels)
            else:
                pil_img = Image.frombytes("RGBA", (img_dict['width'], img_dict['height']), img_dict['data'])
            
            if sprite.get('mirror', 0):
                pil_img = pil_img.transpose(Image.FLIP_LEFT_RIGHT)
                
            x_pos = sprite['x'] - min_x - img_dict['width'] // 2
            y_pos = sprite['y'] - min_y - img_dict['height'] // 2
            out_img.paste(pil_img, (x_pos, y_pos), pil_img)
            
        buffered = io.BytesIO()
        out_img.save(buffered, format="PNG")
        return buffered.getvalue()
    return None
