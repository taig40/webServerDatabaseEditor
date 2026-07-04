import struct
import zlib
import os
import io
from PIL import Image

class GRFReader:
    def __init__(self):
        self.grf_path = ""
        self.files = {} # path -> (comp_size, comp_size_aligned, uncomp_size, flags, offset)
        self.loaded = False
        self.is_folder = False

    def load(self, grf_path: str):
        self.grf_path = grf_path
        if not os.path.exists(self.grf_path):
            print(f"[!] GRF path not found at {self.grf_path}")
            return
            
        self.is_folder = os.path.isdir(self.grf_path)
        if self.is_folder:
            print(f"[*] GRF path is a directory! Using raw file mode from: {self.grf_path}")
            self.loaded = True
            return
            
        with open(self.grf_path, 'rb') as f:
            header = f.read(46)
            if len(header) < 46: return
            signature, key, offset, seed, files_count, version = struct.unpack('<15s 15s I I I I', header)
            
            if version not in (0x200, 0x300):
                print(f"[!] Warning: Unexpected GRF version (got {hex(version)}). File table might fail.")
                
            f.seek(offset + 46)
            table_comp_size, table_uncomp_size = struct.unpack('<I I', f.read(8))
            table_data_comp = f.read(table_comp_size)
            
            try:
                table_data = zlib.decompress(table_data_comp)
            except Exception as e:
                print(f"[!] Failed to decompress GRF file table: {e}")
                return
                
            # Parse file table
            idx = 0
            while idx < len(table_data):
                str_end = table_data.find(b'\x00', idx)
                if str_end == -1: break
                
                try:
                    filename = table_data[idx:str_end].decode('euc-kr').lower()
                except:
                    filename = table_data[idx:str_end].decode('latin1').lower()
                    
                idx = str_end + 1
                
                if idx + 17 > len(table_data): break
                comp_size, comp_size_aligned, uncomp_size, flags, file_offset = struct.unpack('<I I I B I', table_data[idx:idx+17])
                idx += 17
                
                filename = filename.replace('\\', '/')
                self.files[filename] = (comp_size, comp_size_aligned, uncomp_size, flags, file_offset)
                
            self.loaded = True
            print(f"[*] GRF Loaded: {len(self.files)} files mapped.")
            
            # --- DEBUG BLOCK ---
            count = 0
            for k in self.files.keys():
                if 'item' in k and k.endswith('.bmp'):
                    print("SAMPLE GRF ITEM PATH:", k)
                    count += 1
                    if count > 5: break
            # -------------------

    def extract_file(self, filename: str) -> bytes:
        if not self.loaded:
            return None
            
        filename = filename.lower()
        
        if self.is_folder:
            # Se a pasta do usuário já termina em 'data' e o caminho também começa com 'data/', evitamos duplicar 'data/data/'
            if self.grf_path.rstrip("/\\").endswith("data") and filename.startswith("data/"):
                adjusted_path = filename[5:] # remove 'data/'
            else:
                adjusted_path = filename
                
            full_path = os.path.join(self.grf_path, adjusted_path).replace("\\", "/")
            if os.path.exists(full_path):
                with open(full_path, 'rb') as f:
                    return f.read()
            return None

        if filename not in self.files:
            return None
            
        comp_size, comp_size_aligned, uncomp_size, flags, offset = self.files[filename]
        
        with open(self.grf_path, 'rb') as f:
            f.seek(offset + 46)
            data = f.read(comp_size_aligned)
            
            if flags == 1: # FILELIST_TYPE_FILE (Standard zlib compression)
                try:
                    return zlib.decompress(data)
                except:
                    return data
            else:
                # Other formats (e.g. Mixed DES encryption) would require DES decryption block 0
                # For this prototype, we'll try to fallback to raw data
                return data

    def convert_bmp_to_png(self, bmp_bytes: bytes) -> bytes:
        """Converts RO BMPs to PNG, replacing the magenta background with transparency."""
        if not bmp_bytes: return None
        try:
            img = Image.open(io.BytesIO(bmp_bytes))
            img = img.convert("RGBA")
            datas = img.getdata()
            new_data = []
            
            # rAthena/RO sprites use magenta (255, 0, 255) as transparency key
            for item in datas:
                if item[0] == 255 and item[1] == 0 and item[2] == 255:
                    new_data.append((255, 255, 255, 0))
                else:
                    new_data.append(item)
            img.putdata(new_data)
            
            out = io.BytesIO()
            img.save(out, format='PNG')
            return out.getvalue()
        except Exception as e:
            print(f"[!] Error converting BMP to PNG: {e}")
            return None

    def generate_dummy_png(self) -> bytes:
        """Generates a dummy placeholder icon."""
        img = Image.new('RGBA', (24, 24), color=(50, 50, 50, 200))
        out = io.BytesIO()
        img.save(out, format='PNG')
        return out.getvalue()

    def get_item_icon(self, item_id: int) -> bytes:
        """
        Attempts to locate an item icon inside the GRF and returns it as a PNG stream.
        """
        if not self.loaded:
            return self.generate_dummy_png()
            
        from app.services.iteminfo_parser import iteminfo_db
        from app.services.yaml_parser import yaml_db
        
        resource_name = None
        
        # 1. Tentar pegar a identifiedResourceName exata do System/iteminfo.lua
        if iteminfo_db.loaded:
            resource_name = iteminfo_db.get_resource_name(item_id)
            
        # 2. Fallback: Obter o AegisName (Name) diretamente do DB em memória
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

        # Tentar caminhos possíveis dentro da GRF.
        # Adicionamos conversões em latin1 pois no Windows a extração pode salvar como ANSI (ex: »¡°£Æ÷¼Ç.bmp)
        resource_ansi = ""
        try:
            resource_ansi = resource_name.encode('euc-kr').decode('latin1')
        except:
            resource_ansi = resource_name

        paths_to_try = [
            f"data/texture/유저인터페이스/item/{resource_name}.bmp".lower(),
            f"data/texture/유저인터페이스/item/{item_id}.bmp".lower(),
            f"data/texture/À¯ÀúÀÎÅÍÆäÀÌ½º/item/{resource_name}.bmp".lower(),
            f"data/texture/À¯ÀúÀÎÅÍÆäÀÌ½º/item/{item_id}.bmp".lower(),
            f"data/texture/userinterface/item/{resource_name}.bmp".lower(),
            f"data/texture/userinterface/item/{item_id}.bmp".lower(),
            f"data/texture/À¯ÀúÀÎÅÍÆäÀÌ½º/item/{resource_ansi}.bmp".lower(),
            f"data/texture/userinterface/item/{resource_ansi}.bmp".lower()
        ]
        
        for path in paths_to_try:
            bmp_data = self.extract_file(path)
            if bmp_data:
                png_data = self.convert_bmp_to_png(bmp_data)
                if png_data:
                    return png_data
                    
        return self.generate_dummy_png()

grf_reader = GRFReader()
