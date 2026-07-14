import os
import re
from typing import Dict, Optional, Tuple
from app.services.grf_reader import grf_reader

class VisualLuaHandler:
    def __init__(self, filepath: str, is_accname: bool = False):
        self.filepath = filepath
        self.is_accname = is_accname
        self.encoding_used = 'cp949'
        self.content = ""
        self.ast_dict: Dict[int, str] = {}
        self.identity_dict: Dict[str, str] = {} # For accname
        self.loaded = False
        self.encoding_error = None

    def load(self):
        if not self.filepath or not os.path.exists(self.filepath):
            self.loaded = True
            return
            
        encodings = ['cp949', 'euc-kr', 'windows-1252', 'latin-1']
        success = False
        for enc in encodings:
            try:
                with open(self.filepath, 'r', encoding=enc) as f:
                    self.content = f.read()
                    self.encoding_used = enc
                    success = True
                    break
            except UnicodeDecodeError:
                continue
                
        if not success:
            self.encoding_error = f"Impossível ler o arquivo visual {self.filepath} com encondings conhecidos."
            raise RuntimeError(self.encoding_error)
            
        self._parse_content()
        self.loaded = True
        
    def _parse_content(self):
        self.ast_dict.clear()
        self.identity_dict.clear()
        if not self.is_accname:
            # accessoryid.lua -> ACCESSORY_NAME = ID
            pattern = re.compile(r'^\s*(ACCESSORY_[A-Za-z0-9_]+)\s*=\s*(\d+)', re.MULTILINE)
            for match in pattern.finditer(self.content):
                name, val = match.groups()
                self.ast_dict[int(val)] = name
        else:
            # accname.lua -> [ACCESSORY_IDs.ACCESSORY_NAME] = "_sprite_name",
            # The regex ensures we capture [ACCESSORY_IDs.([^\]]+)]\s*=\s*"([^"]+)"
            pattern = re.compile(r'^\s*\[\s*ACCESSORY_IDs\.([A-Za-z0-9_]+)\s*\]\s*=\s*"([^"]+)"', re.MULTILINE)
            for match in pattern.finditer(self.content):
                identity, sprite_name = match.groups()
                self.identity_dict[identity] = sprite_name
                
    def upsert(self, identity: str, val: str):
        """
        If not is_accname, val is stringified view_id.
        If is_accname, val is sprite_name.
        """
        if not self.loaded:
            self.load()
            
        if not self.content and self.filepath:
            # Initialize empty file content if it doesn't exist
            if self.is_accname:
                self.content = "ACCESSORY_IDs = {\n}\n"
            else:
                self.content = ""
            
        if not self.is_accname:
            # Upsert into accessoryid.lua
            pattern = re.compile(r'^(\s*)' + re.escape(identity) + r'\s*=\s*\d+', re.MULTILINE)
            if pattern.search(self.content):
                self.content = pattern.sub(r'\g<1>' + f'{identity} = {val}', self.content)
            else:
                self.content += f"{identity} = {val}\n"
            self.ast_dict[int(val)] = identity
        else:
            # Upsert into accname.lua
            pattern = re.compile(r'^(\s*)\[\s*ACCESSORY_IDs\.' + re.escape(identity) + r'\s*\]\s*=\s*"[^"]+"', re.MULTILINE)
            if pattern.search(self.content):
                self.content = pattern.sub(r'\g<1>[ACCESSORY_IDs.' + identity + f'] = "{val}"', self.content)
            else:
                # Find the closing brace of the table
                match = re.search(r'\}\s*$', self.content)
                if match:
                    insertion_idx = match.start()
                    new_line = f"\t[ACCESSORY_IDs.{identity}] = \"{val}\",\n"
                    self.content = self.content[:insertion_idx] + new_line + self.content[insertion_idx:]
                else:
                    self.content += f"\n[ACCESSORY_IDs.{identity}] = \"{val}\",\n"
            self.identity_dict[identity] = val
            
        if self.filepath:
            os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
            # Escrita atômica temporária
            tmp_path = self.filepath + ".tmp"
            with open(tmp_path, 'w', encoding=self.encoding_used) as f:
                f.write(self.content)
            os.replace(tmp_path, self.filepath)


class VisualsDB:
    def __init__(self):
        self.accessoryid_handler: Optional[VisualLuaHandler] = None
        self.accname_handler: Optional[VisualLuaHandler] = None
        
    def get_handlers(self) -> Tuple[VisualLuaHandler, VisualLuaHandler]:
        if not self.accessoryid_handler or not self.accname_handler:
            lua_path = os.environ.get("RO_LUA_FILES_PATH", "").strip()
            
            if lua_path and os.path.exists(lua_path):
                acc_id_path = os.path.join(lua_path, "accessoryid.lua")
                if not os.path.exists(acc_id_path):
                    acc_id_path = os.path.join(lua_path, "accessoryid.lub")
                    
                acc_name_path = os.path.join(lua_path, "accname.lua")
                if not os.path.exists(acc_name_path):
                    acc_name_path = os.path.join(lua_path, "accname.lub")
            else:
                override_path = grf_reader.override_path
                sys_path = os.path.join(override_path, "System") if override_path else ""
                
                acc_id_path = os.path.join(sys_path, "accessoryid.lua")
                acc_name_path = os.path.join(sys_path, "accname.lua")
            
            self.accessoryid_handler = VisualLuaHandler(acc_id_path, is_accname=False)
            self.accname_handler = VisualLuaHandler(acc_name_path, is_accname=True)
            
            self.accessoryid_handler.load()
            self.accname_handler.load()
            
        return self.accessoryid_handler, self.accname_handler
        
    def get_visual(self, view_id: int) -> Optional[dict]:
        try:
            acc_id, acc_name = self.get_handlers()
            identity = acc_id.ast_dict.get(view_id)
            if not identity:
                return None
                
            name = acc_name.identity_dict.get(identity.replace("ACCESSORY_", ""), "")
            return {
                "view_id": view_id,
                "identity": identity,
                "name": name
            }
        except Exception:
            return None

    def get_all_accessories(self) -> list[dict]:
        """
        Cruza as tabelas de accessoryid e accname e retorna
        a lista completa de acessórios registrados.
        """
        try:
            acc_id, acc_name = self.get_handlers()
        except Exception:
            return []
            
        results = []
        for val, identity in acc_id.ast_dict.items():
            suffix = identity.replace("ACCESSORY_", "")
            sprite_name = acc_name.identity_dict.get(suffix, "")
            results.append({
                "view_id": val,
                "sprite_name": sprite_name,
                "constant": identity
            })
            
        # Ordenar por view_id crescente
        results.sort(key=lambda x: x["view_id"])
        return results
        
    def upsert_visual(self, view_id: int, identity: str, name: str) -> dict:
        acc_id, acc_name = self.get_handlers()
        acc_id.upsert(identity, str(view_id))
        
        # for accname we strip 'ACCESSORY_' if it's there
        short_identity = identity.replace("ACCESSORY_", "")
        acc_name.upsert(short_identity, name)
        
        return self.get_visual(view_id)

visuals_db = VisualsDB()
