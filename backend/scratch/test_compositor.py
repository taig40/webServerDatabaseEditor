import sys
import os
import struct

# Add the backend directory to sys.path to allow imports from app
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import cfg
from app.services.grf_reader import grf_reader
from app.services.sprite_engine.compositor import compose_character, get_attachment_point

def main():
    print("[*] Starting sprite compositor verification test...")
    
    # 1. Initialize configuration and load GRFs
    from app.core.config import get_config_path, load_config_file
    cfg_path = get_config_path()
    if os.path.exists(cfg_path):
        load_config_file(cfg_path)
        grf_path = os.environ.get("GRF_PATH", "")
        if grf_path:
            grf_reader.load(grf_path)
            print(f"[*] Loaded primary GRF path: {grf_path}")
        else:
            db_path = os.environ.get("RATHENA_DB_PATH", "")
            if db_path:
                parent = os.path.dirname(os.path.normpath(db_path))
                possible_grf = os.path.join(parent, "data.grf")
                if os.path.exists(possible_grf):
                    grf_reader.load(possible_grf)
                    print(f"[*] Autodetected nearby GRF: {possible_grf}")

    if not grf_reader.loaded:
        print("[!] No GRF loaded. We'll run a mock compositor test using synthetic data.")
        run_mock_compositor_test()
        return

    # 2. Try to search the GRF directory for an accessory name
    accessory_name = "cap"
    # Find any accessory name inside the GRF to make the test realistic
    for filename in grf_reader.files.keys():
        if "악세사리" in filename or "accessory" in filename:
            if filename.endswith(".spr"):
                # E.g. data/sprite/악세사리/남/캡_남.spr -> accessory_name = "캡"
                # Strip path and suffix
                base = os.path.basename(filename)
                if base.endswith("_남.spr") or base.endswith("_여.spr"):
                    accessory_name = base[:-6] # strip '_남.spr' or '_여.spr'
                    break
                else:
                    accessory_name = base[:-4]
                    break
                    
    print(f"[*] Selected accessory for composition: '{accessory_name}'")
    
    try:
        # Test composition for male character, facing direction 0 (South)
        png_bytes = compose_character(accessory_name, is_male=True, direction=0)
        
        output_path = os.path.join(os.path.dirname(__file__), "output_character.png")
        with open(output_path, "wb") as f:
            f.write(png_bytes)
            
        print(f"[+] Character successfully composed! Image size: {len(png_bytes)} bytes")
        print(f"[+] Output image saved to: '{output_path}'")
        print("[+] Sprite Compositor verification PASSED successfully!")
    except Exception as e:
        print(f"[-] Character composition failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def run_mock_compositor_test():
    print("[*] Running mock compositor test with synthetic SPR and ACT components...")
    
    # Generate visible 2x2 SPR frame: solid red index 1
    spr_header = b'SPRX' + struct.pack('<H', 0x0201) + struct.pack('<H', 1) + struct.pack('<H', 0)
    indexed_frame_header = struct.pack('<HHH', 2, 2, 4) + b'\x01\x01\x01\x01' # w=2, h=2, comp_size=4, 4 pixels of index 1
    
    palette = bytearray(1024)
    palette[4] = 255 # R
    palette[5] = 0   # G
    palette[6] = 0   # B
    palette[7] = 255 # A
    spr_data = spr_header + indexed_frame_header + bytes(palette)

    # Generate mock ACT data helper with 1 visible sprite
    def make_mock_act_bytes(ap_id, ap_x, ap_y):
        act_header = b'AC\x00\x00' + struct.pack('<H', 0x0203) + struct.pack('<H', 1) + b'\x00' * 10
        act_action = struct.pack('<I', 1) # 1 frame
        
        act_frame_header = b'\x00' * 32
        act_sprite_count = struct.pack('<I', 1)
        # Sprite: x=0, y=0, spr_num=0, mirror=0, color=0xFFFFFFFF, scale=1.0, rotation=0, spr_type=0
        act_sprite = struct.pack('<iiiiIfii', 0, 0, 0, 0, 0xFFFFFFFF, 1.0, 0, 0)
        
        act_frame_end = struct.pack('<i', -1) # Event ID
        act_ap_count = struct.pack('<I', 1) # 1 attach point
        act_ap = struct.pack('<iiii', ap_x, ap_y, ap_id, 0)
        act_events = struct.pack('<I', 0)
        act_intervals = struct.pack('<f', 150.0)
        return act_header + act_action + act_frame_header + act_sprite_count + act_sprite + act_frame_end + act_ap_count + act_ap + act_events + act_intervals

    # Create mock body, head, and accessory ACT bytes
    body_act_bytes = make_mock_act_bytes(0, 5, -10) # Neck on body (id=0) at (5, -10)
    
    # For head we need 2 attachment points (Neck id=0 at (2, 8), Hat id=1 at (0, -12)) and 1 sprite
    head_header = b'AC\x00\x00' + struct.pack('<H', 0x0203) + struct.pack('<H', 1) + b'\x00' * 10
    head_action = struct.pack('<I', 1)
    head_frame_header = b'\x00' * 32
    head_sprite_count = struct.pack('<I', 1)
    # Sprite: x=0, y=0, spr_num=0, mirror=0, color=0xFFFFFFFF, scale=1.0, rotation=0, spr_type=0
    head_sprite = struct.pack('<iiiiIfii', 0, 0, 0, 0, 0xFFFFFFFF, 1.0, 0, 0)
    head_frame_end = struct.pack('<i', -1)
    head_ap_count = struct.pack('<I', 2)
    head_ap1 = struct.pack('<iiii', 2, 8, 0, 0) # Neck (id=0) at (2, 8)
    head_ap2 = struct.pack('<iiii', 0, -12, 1, 0) # Hat (id=1) at (0, -12)
    head_events = struct.pack('<I', 0)
    head_intervals = struct.pack('<f', 150.0)
    head_act_bytes = (head_header + head_action + head_frame_header + head_sprite_count + head_sprite + 
                      head_frame_end + head_ap_count + head_ap1 + head_ap2 + head_events + head_intervals)

    acc_act_bytes = make_mock_act_bytes(1, 0, 0) # Hat anchor on accessory (id=1) at (0, 0)

    from app.services.sprite_engine.spr_parser import SprParser
    from app.services.sprite_engine.act_parser import ActParser
    
    body_spr = SprParser(spr_data)
    body_act = ActParser(body_act_bytes)
    
    head_spr = SprParser(spr_data)
    head_act = ActParser(head_act_bytes)
    
    acc_spr = SprParser(spr_data)
    acc_act = ActParser(acc_act_bytes)

    # Validate attachment points retrieval
    ap_body_0 = get_attachment_point(body_act, 0, 0, 0)
    ap_head_0 = get_attachment_point(head_act, 0, 0, 0)
    ap_head_1 = get_attachment_point(head_act, 0, 0, 1)
    ap_acc_1 = get_attachment_point(acc_act, 0, 0, 1)

    print(f"[+] AP Body (id=0): {ap_body_0}")
    print(f"[+] AP Head (id=0): {ap_head_0}")
    print(f"[+] AP Head (id=1): {ap_head_1}")
    print(f"[+] AP Acc (id=1): {ap_acc_1}")

    assert ap_body_0 == (5.0, -10.0)
    assert ap_head_0 == (2.0, 8.0)
    assert ap_head_1 == (0.0, -12.0)
    assert ap_acc_1 == (0.0, 0.0)

    # Perform offset math verification
    C_body = (100.0, 120.0)
    
    # C_head = C_body + AP_body(0) - AP_head(0)
    C_head = (
        C_body[0] + ap_body_0[0] - ap_head_0[0],
        C_body[1] + ap_body_0[1] - ap_head_0[1]
    )
    # C_acc = C_head + AP_head(1) - AP_acc(1)
    C_acc = (
        C_head[0] + ap_head_1[0] - ap_acc_1[0],
        C_head[1] + ap_head_1[1] - ap_acc_1[1]
    )

    print(f"[+] Calculated Head center: {C_head} (Expected: (103.0, 102.0))")
    print(f"[+] Calculated Acc center: {C_acc} (Expected: (103.0, 90.0))")

    assert C_head == (103.0, 102.0)
    assert C_acc == (103.0, 90.0)

    # Render parts to PIL canvas
    from PIL import Image
    from app.services.sprite_engine.compositor import draw_frame_part
    canvas = Image.new("RGBA", (200, 200), (255, 255, 255, 0))
    
    draw_frame_part(canvas, body_spr, body_act, 0, 0, C_body)
    draw_frame_part(canvas, head_spr, head_act, 0, 0, C_head)
    draw_frame_part(canvas, acc_spr, acc_act, 0, 0, C_acc)
    
    # Save output png to disk
    output_path = os.path.join(os.path.dirname(__file__), "output_character_mock.png")
    canvas.save(output_path, format="PNG")
    print(f"[+] Saved mock composed character image to: '{output_path}'")
    
    # Assert composed character has visible pixels
    non_transparent = 0
    for pixel in canvas.getdata():
        if pixel[3] > 0:
            non_transparent += 1
    print(f"[+] Mock Composed Image non-transparent pixels: {non_transparent}")
    assert non_transparent > 0, "Error: Composed mock image is completely transparent!"
    
    print("[+] Mock compositor test PASSED successfully!")


if __name__ == "__main__":
    main()
