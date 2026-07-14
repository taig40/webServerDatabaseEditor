import sys
import os
import struct

# Add the backend directory to sys.path to allow imports from app
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import cfg
from app.services.grf_reader import grf_reader
from app.services.sprite_engine.sprite_loader import load_sprite_from_grf

def main():
    print("[*] Starting sprite engine binary verification test...")
    
    # Let's inspect GRFs list
    grf_list = grf_reader.get_grf_list()
    print(f"[*] Loaded GRF list: {grf_list}")
    
    # If no GRF is loaded, let's try to load them from portable config.conf
    if not grf_reader.loaded:
        print("[!] No GRF loaded automatically. We'll search and load the configuration...")
        # Since App is configured portable, we can load configuration natively using config
        # Let's check config paths
        from app.core.config import get_config_path, load_config_file
        cfg_path = get_config_path()
        if os.path.exists(cfg_path):
            load_config_file(cfg_path)
            # Find any GRF path or rathena path in config
            grf_path = os.environ.get("GRF_PATH", "")
            if grf_path:
                grf_reader.load(grf_path)
                print(f"[*] Manually loaded primary GRF path from config: {grf_path}")
            else:
                # Also try scanning RATHENA_DB_PATH parent or DATA.INI
                db_path = os.environ.get("RATHENA_DB_PATH", "")
                if db_path:
                    # Let's see if there is a data.grf nearby
                    parent = os.path.dirname(os.path.normpath(db_path))
                    possible_grf = os.path.join(parent, "data.grf")
                    if os.path.exists(possible_grf):
                        grf_reader.load(possible_grf)
                        print(f"[*] Autodetected nearby GRF: {possible_grf}")

    if not grf_reader.loaded:
        print("[!] No GRF loaded. We'll run a mock test using synthetic data.")
        run_mock_test()
        return

    # Let's scan grf_reader.files to find any accessory spr/act pair!
    spr_file = None
    act_file = None
    
    # Look for accessory files specifically
    for filename in grf_reader.files.keys():
        if filename.endswith(".spr") and "accessory" in filename:
            act_candidate = filename[:-4] + ".act"
            if act_candidate in grf_reader.files:
                spr_file = filename
                act_file = act_candidate
                break
                
    if not spr_file:
        # Fallback to search any spr/act pair in GRF
        for filename in grf_reader.files.keys():
            if filename.endswith(".spr"):
                act_candidate = filename[:-4] + ".act"
                if act_candidate in grf_reader.files:
                    spr_file = filename
                    act_file = act_candidate
                    break

    if not spr_file:
        print("[!] No SPR/ACT pair found in GRF. Running mock test.")
        run_mock_test()
        return

    print(f"[*] Found sample SPR/ACT in GRF:\n  SPR: {spr_file}\n  ACT: {act_file}")
    
    # Test the sprite loader
    spr, act = load_sprite_from_grf(spr_file, act_file)
    
    if spr:
        images = spr.get_images()
        print(f"[+] SPR successfully parsed. Version: {hex(spr.version)}, Images Count: {len(images)}")
        if images:
            print(f"  First frame size: {images[0].size}")
    else:
        print("[-] SPR parsing failed!")
        sys.exit(1)
        
    if act:
        print(f"[+] ACT successfully parsed. Version: {hex(act.version)}, Actions Count: {len(act.actions)}")
        # Check attachment points in Action 0, Frame 0
        if act.actions and len(act.actions[0]) > 0:
            frame = act.actions[0][0]
            aps = frame.get('attach_points', [])
            print(f"  Action 0, Frame 0 Attachment Points Count: {len(aps)}")
            for idx, ap in enumerate(aps):
                print(f"    AP {idx}: ID={ap['id']}, Coord=({ap['x']}, {ap['y']}), Attr={ap['attr']}")
    else:
        print("[-] ACT parsing failed or not found!")
        sys.exit(1)

    print("[+] Sprite Engine binary verification PASSED successfully!")


def run_mock_test():
    print("[*] Running mock test with synthetic SPR and ACT bytes...")
    
    # 1. Generate valid mock SPR data:
    # 4 bytes signature b'SPRX', 2 bytes version 0x0201, 2 bytes indexed_count 1, 2 bytes rgba_count 0
    # Then width 2, height 2, comp_size 2, comp_data: decompress_rle bytes: 0x00 0x04 (4 transparent pixels)
    # Then palette 1024 bytes
    spr_header = b'SPRX' + struct.pack('<H', 0x0201) + struct.pack('<H', 1) + struct.pack('<H', 0)
    indexed_frame_header = struct.pack('<HHH', 2, 2, 2) + b'\x00\x04' # w=2, h=2, comp_size=2, RLE: 4 transparent
    palette = b'\x00' * 1024
    spr_data = spr_header + indexed_frame_header + palette

    # 2. Generate valid mock ACT data for version 0x0203 (integer-based attach points)
    act_header_v23 = b'AC\x00\x00' + struct.pack('<H', 0x0203) + struct.pack('<H', 1) + b'\x00' * 10
    act_action = struct.pack('<I', 1) # 1 frame
    act_frame = b'\x00' * 32 + struct.pack('<I', 0) # 0 sprites
    act_frame_end = struct.pack('<i', -1) # Event ID
    act_ap_count = struct.pack('<I', 2) # 2 attach points
    act_ap1_v23 = struct.pack('<iiii', 10, 20, 0, 1) # x=10, y=20, id=0, attr=1
    act_ap2_v23 = struct.pack('<iiii', 15, 25, 1, 0) # x=15, y=25, id=1, attr=0
    act_events = struct.pack('<I', 0)
    act_intervals = struct.pack('<f', 150.0)

    act_data_v23 = (act_header_v23 + act_action + act_frame + act_frame_end + 
                    act_ap_count + act_ap1_v23 + act_ap2_v23 + act_events + act_intervals)

    # 3. Generate valid mock ACT data for version 0x0206 (float-based attach points and coords)
    act_header_v26 = b'AC\x00\x00' + struct.pack('<H', 0x0206) + struct.pack('<H', 1) + b'\x00' * 10
    act_ap1_v26 = struct.pack('<ffii', 10.5, 20.5, 0, 1) # float coordinates!
    act_ap2_v26 = struct.pack('<ffii', 15.75, 25.75, 1, 0)

    act_data_v26 = (act_header_v26 + act_action + act_frame + act_frame_end + 
                    act_ap_count + act_ap1_v26 + act_ap2_v26 + act_events + act_intervals)

    from app.services.sprite_engine.spr_parser import SprParser
    from app.services.sprite_engine.act_parser import ActParser

    spr = SprParser(spr_data)
    act_v23 = ActParser(act_data_v23)
    act_v26 = ActParser(act_data_v26)

    print(f"[+] Mock SPR version: {hex(spr.version)}, Images Count: {len(spr.get_images())}")
    print(f"[+] Mock ACT v2.3 version: {hex(act_v23.version)}, Actions Count: {len(act_v23.actions)}")
    print(f"[+] Mock ACT v2.6 version: {hex(act_v26.version)}, Actions Count: {len(act_v26.actions)}")
    
    aps_v23 = act_v23.actions[0][0]['attach_points']
    aps_v26 = act_v26.actions[0][0]['attach_points']
    
    print(f"  v2.3 Attach points: {aps_v23}")
    print(f"  v2.6 Attach points: {aps_v26}")
            
    assert spr.version == 0x0201
    assert len(spr.get_images()) == 1
    
    assert act_v23.version == 0x0203
    assert len(aps_v23) == 2
    assert aps_v23[0]['x'] == 10.0 and aps_v23[0]['y'] == 20.0
    
    assert act_v26.version == 0x0206
    assert len(aps_v26) == 2
    assert aps_v26[0]['x'] == 10.5 and aps_v26[0]['y'] == 20.5
    assert aps_v26[1]['x'] == 15.75 and aps_v26[1]['y'] == 25.75
    
    print("[+] Mock test verification PASSED successfully for all versions!")


if __name__ == "__main__":
    main()
