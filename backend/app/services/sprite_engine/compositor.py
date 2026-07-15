import io
import logging
from PIL import Image
from typing import Optional, Tuple, Dict, Any

from app.services.sprite_engine.sprite_loader import load_sprite_from_grf
from app.services.sprite_engine.spr_parser import SprParser
from app.services.sprite_engine.act_parser import ActParser

logger = logging.getLogger("sprite_engine.compositor")

# Constants for default paths in the GRF (RO Standard)
BODY_PATH_MALE = "data/sprite/인간족/몸통/남/초보자_남"
BODY_PATH_FEMALE = "data/sprite/인간족/몸통/여/초보자_여"

HEAD_PATH_MALE = "data/sprite/인간족/머리통/남/1_남"
HEAD_PATH_FEMALE = "data/sprite/인간족/머리통/여/1_여"

ACCESSORY_DIR_MALE = "data/sprite/악세사리/남"
ACCESSORY_DIR_FEMALE = "data/sprite/악세사리/여"


def get_attachment_point(act: ActParser, action_idx: int, frame_idx: int, ap_id: int) -> Optional[Tuple[float, float]]:
    """
    Retrieves the X, Y coordinates of an attachment point from the ACT parser.
    """
    if not act or not act.actions:
        return None
        
    if action_idx >= len(act.actions):
        logger.warning(f"Action index {action_idx} out of range (max {len(act.actions)})")
        return None
        
    frames = act.actions[action_idx]
    if frame_idx >= len(frames):
        logger.warning(f"Frame index {frame_idx} out of range (max {len(frames)})")
        return None
        
    frame = frames[frame_idx]
    for ap in frame.get('attach_points', []):
        if ap['id'] == ap_id:
            return (ap['x'], ap['y'])
            
    return None


def draw_frame_part(canvas: Image.Image, spr: SprParser, act: ActParser, action_idx: int, frame_idx: int, center: Tuple[float, float]):
    """
    Renders all layers/sprites of a specific part frame on the canvas relative to a center point.
    """
    if not spr or not act or not act.actions:
        return
        
    if action_idx >= len(act.actions):
        return
        
    frames = act.actions[action_idx]
    if frame_idx >= len(frames):
        return
        
    frame = frames[frame_idx]
    cx, cy = center
    
    for sprite in frame.get('sprites', []):
        spr_num = sprite['sprite_num']
        spr_type = sprite['spr_type']
        
        if spr_num < 0:
            continue
            
        # Get frame image using correct mapping helper
        src_img = spr.get_image(spr_num, spr_type)
        if not src_img:
            continue
            
        img = src_img.copy()
        
        # Determine scale and flip
        scale_x = sprite.get('scale_x', 1.0)
        scale_y = sprite.get('scale_y', 1.0)
        
        flip_x = False
        flip_y = False
        if scale_x < 0:
            flip_x = True
            scale_x = abs(scale_x)
        if scale_y < 0:
            flip_y = True
            scale_y = abs(scale_y)
            
        # Mirror flip
        if sprite.get('mirror') == 1 or flip_x:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        if flip_y:
            img = img.transpose(Image.FLIP_TOP_BOTTOM)
            
        # Resize if scale is different than 100%
        if scale_x != 1.0 or scale_y != 1.0:
            new_w = max(1, int(img.width * scale_x))
            new_h = max(1, int(img.height * scale_y))
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            
        # Rotate if angle is different than 0
        rotation = sprite.get('rotation', 0)
        if rotation != 0:
            # ACT stores rotation in clockwise degrees
            img = img.rotate(-rotation, expand=True, resample=Image.Resampling.BICUBIC)
            
        # Adjust opacity/alpha if color has transparency
        color = sprite.get('color', 0xFFFFFFFF)
        if color != 0xFFFFFFFF and color != 0:
            a_tint = (color >> 24) & 0xFF
            if a_tint < 255 and a_tint > 0:
                # Apply alpha factor
                r_ch, g_ch, b_ch, a_ch = img.split()
                a_ch = a_ch.point(lambda p: int(p * (a_tint / 255.0)))
                img.putalpha(a_ch)
                
        # Compute pasting position (ACT coords are offsets from the part center)
        x_pos = int(cx + sprite['x'] - img.width / 2)
        y_pos = int(cy + sprite['y'] - img.height / 2)
        
        # Blend using alpha compositing with mask to keep transparency intact
        canvas.paste(img, (x_pos, y_pos), mask=img)


def compose_character(accessory_name: str, is_male: bool, direction: int) -> bytes:
    """
    Composes a character's Body, Head, and Hat/Accessory sprites into a single PNG image.
    
    Parameters:
        accessory_name (str): The name of the hat accessory (e.g. 'cap', 'ribbon')
        is_male (bool): True if male, False if female.
        direction (int): Direction code (0 to 7).
        
    Returns:
        bytes: The composed PNG image bytes.
    """
    logger.info(f"Composing character. Accessory: {accessory_name}, Male: {is_male}, Direction: {direction}")
    
    # 1. Determine paths based on gender
    gender_folder = "남" if is_male else "여"
    gender_suffix = "남" if is_male else "여"
    
    body_base = BODY_PATH_MALE if is_male else BODY_PATH_FEMALE
    head_base = HEAD_PATH_MALE if is_male else HEAD_PATH_FEMALE
    acc_dir = ACCESSORY_DIR_MALE if is_male else ACCESSORY_DIR_FEMALE
    
    body_spr_path = f"{body_base}.spr"
    body_act_path = f"{body_base}.act"
    
    head_spr_path = f"{head_base}.spr"
    head_act_path = f"{head_base}.act"
    
    acc_spr, acc_act = None, None
    if accessory_name and accessory_name.strip() not in ("", "0", "None", "null"):
        # No RO standard, o acessório está em data/sprite/악세사리/남 (ou 여)
        # Algumas GRFs escrevem '악세서리' em vez de '악세사리'
        acc_spr_path1 = f"data/sprite/악세사리/{gender_folder}/{accessory_name}_{gender_suffix}.spr"
        acc_act_path1 = f"data/sprite/악세사리/{gender_folder}/{accessory_name}_{gender_suffix}.act"
        acc_spr_path2 = f"data/sprite/악세서리/{gender_folder}/{accessory_name}_{gender_suffix}.spr"
        acc_act_path2 = f"data/sprite/악세서리/{gender_folder}/{accessory_name}_{gender_suffix}.act"
        
        # 2. Extract and parse files from GRF
        logger.info(f"Loading accessory '{accessory_name}' from GRF paths...")
        acc_spr, acc_act = load_sprite_from_grf(acc_spr_path1, acc_act_path1)
        if not acc_spr or not acc_act:
            logger.info("Accessory not found in '악세사리', trying '악세서리'...")
            acc_spr, acc_act = load_sprite_from_grf(acc_spr_path2, acc_act_path2)
            if not acc_spr or not acc_act:
                logger.warning(f"Accessory files not found in GRF for '{accessory_name}' (tried both 악세사리 and 악세서리). Continuing without accessory.")
    
    # 2b. Extract and parse body and head files from GRF
    logger.info("Loading body parts from GRF...")
    body_spr, body_act = load_sprite_from_grf(body_spr_path, body_act_path)
    if not body_spr or not body_act:
        raise ValueError(f"Failed to load body sprite/act from GRF: {body_spr_path} / {body_act_path}")
    
    logger.info("Loading head parts from GRF...")
    head_spr, head_act = load_sprite_from_grf(head_spr_path, head_act_path)
    if not head_spr or not head_act:
        raise ValueError(f"Failed to load head sprite/act from GRF: {head_spr_path} / {head_act_path}")
    

            
    # 3. Setup canvas (Transparent 200x200)
    canvas = Image.new("RGBA", (200, 200), (255, 255, 255, 0))
    
    # Base center for Body
    C_body = (100.0, 120.0)
    
    # 4. Compute alignment of Head using attachment points (Neck anchor: id=0)
    C_head = C_body # RO sprites are usually relative to the same origin
    if body_act and head_act:
        ap_body_0 = get_attachment_point(body_act, direction, 0, 0)
        ap_head_0 = get_attachment_point(head_act, direction, 0, 0)
        
        if ap_body_0 and ap_head_0:
            # Formula: C_head = C_body + AP_body(0) - AP_head(0)
            C_head = (
                C_body[0] + ap_body_0[0] - ap_head_0[0],
                C_body[1] + ap_body_0[1] - ap_head_0[1]
            )
            logger.info(f"Aligned Head center at {C_head} using neck anchors.")
        else:
            logger.warning("Neck anchor (id=0) missing on body or head. Using fallback placement.")
            
    # 5. Compute alignment of Accessory using attachment points (Hat anchor: id=1)
    C_acc = C_head # default fallback center
    if head_act and acc_act:
        ap_head_1 = get_attachment_point(head_act, direction, 0, 1)
        ap_acc_1 = get_attachment_point(acc_act, direction, 0, 1)
        
        if ap_head_1 and ap_acc_1:
            # Formula: C_acc = C_head + AP_head(1) - AP_acc(1)
            C_acc = (
                C_head[0] + ap_head_1[0] - ap_acc_1[0],
                C_head[1] + ap_head_1[1] - ap_acc_1[1]
            )
            logger.info(f"Aligned Accessory center at {C_acc} using hat anchors.")
        else:
            logger.warning("Hat anchor (id=1) missing on head or accessory. Using fallback placement.")
            
    # 6. Composite sprites layer-by-layer (Z-Index order: Body -> Head -> Hat)
    logger.info("Drawing Body sprites...")
    draw_frame_part(canvas, body_spr, body_act, direction, 0, C_body)
    
    logger.info("Drawing Head sprites...")
    draw_frame_part(canvas, head_spr, head_act, direction, 0, C_head)
    
    if acc_spr and acc_act:
        logger.info("Drawing Accessory sprites...")
        draw_frame_part(canvas, acc_spr, acc_act, direction, 0, C_acc)
        
    # 7. Output image bytes
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    logger.info("Composition completed successfully.")
    return buf.getvalue()
