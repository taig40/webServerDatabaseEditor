import os
import re
import threading

class ItemInfoParser:
    def __init__(self):
        self.iteminfo_path = ""
        self.resource_map = {}
        self.loaded = False
        self.loading = False
        
    def _parse_async(self, filepath: str):
        print(f"[*] Starting async Lua parse from '{filepath}'...")
        try:
            # We use euc-kr because Korean clients save Lua files with EUC-KR ANSI encoding
            with open(filepath, 'r', encoding='euc-kr', errors='replace') as f:
                current_id = None
                
                # Precompile regex for extreme performance
                re_id = re.compile(r'\[(\d+)\]\s*=\s*\{')
                re_res = re.compile(r'^identifiedResourceName\s*=\s*"([^"]+)"')
                
                for line in f:
                    line = line.strip()
                    if not line: continue
                    
                    if line.startswith('[') and '=' in line:
                        m = re_id.search(line)
                        if m:
                            current_id = int(m.group(1))
                    elif current_id is not None and line.startswith('identifiedResourceName'):
                        m = re_res.search(line)
                        if m:
                            self.resource_map[current_id] = m.group(1)
                            
            self.loaded = True
            print(f"[*] ItemInfo Loaded: {len(self.resource_map)} resources mapped.")
        except Exception as e:
            print(f"[!] Failed to parse ItemInfo: {e}")
        finally:
            self.loading = False

    def load_background(self, iteminfo_path: str):
        if not iteminfo_path or not os.path.exists(iteminfo_path):
            print(f"[!] ItemInfo file not found at {iteminfo_path}")
            return
            
        self.iteminfo_path = iteminfo_path
        self.loading = True
        
        t = threading.Thread(target=self._parse_async, args=(iteminfo_path,), daemon=True)
        t.start()
        
    def get_resource_name(self, item_id: int) -> str:
        if not self.loaded:
            return None
        return self.resource_map.get(item_id)

iteminfo_db = ItemInfoParser()
