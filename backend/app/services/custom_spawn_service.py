import os
import uuid
import re
from datetime import datetime
from typing import List, Dict, Any

def _resolve_rathena_root() -> str:
    from app.core.config import get_rathena_root
    return get_rathena_root()

def get_spawn_index_path() -> str:
    """Retorna o caminho para npc/custom/ui_spawns.conf"""
    root = _resolve_rathena_root()
    if root:
        return f"{root}/npc/custom/ui_spawns.conf"
    return os.path.join(os.getcwd(), "ui_spawns.conf").replace("\\", "/")

def get_spawn_folder() -> str:
    """Retorna a pasta para arquivos individuais npc/custom/spawns/"""
    root = _resolve_rathena_root()
    if root:
        return f"{root}/npc/custom/spawns"
    return os.path.join(os.getcwd(), "spawns").replace("\\", "/")

def get_map_spawn_file(map_name: str) -> str:
    return f"{get_spawn_folder()}/{map_name}.txt"

def ensure_index_file():
    path = get_spawn_index_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(
                "// ============================================================\n"
                "// ui_spawns.conf — Custom Map Engine Spawns Index\n"
                "// Gerado automaticamente pelo webServerDatabaseEditor\n"
                "// ============================================================\n\n"
            )

def ensure_import_in_index(map_name: str):
    ensure_index_file()
    path = get_spawn_index_path()
    import_line = f"npc: npc/custom/spawns/{map_name}.txt\n"
    
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    if import_line not in content:
        with open(path, "a", encoding="utf-8", newline="\n") as f:
            f.write(import_line)

def remove_import_from_index(map_name: str):
    ensure_index_file()
    path = get_spawn_index_path()
    import_line = f"npc: npc/custom/spawns/{map_name}.txt"
    
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    new_lines = [l for l in lines if l.strip() != import_line]
    
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.writelines(new_lines)

def get_active_maps() -> List[str]:
    """Retorna uma lista de mapas que possuem arquivos de spawn ativos lendo o index."""
    ensure_index_file()
    path = get_spawn_index_path()
    maps = set()
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            # Supports both import: and npc: for backwards compatibility
            if line.startswith("import: ") or line.startswith("npc: "):
                match = re.search(r'spawns/([^/\.]+)\.txt', line)
                if match:
                    maps.add(match.group(1))
    return sorted(list(maps))

def get_map_spawns(map_name: str) -> List[Dict[str, Any]]:
    """Parseia o arquivo de um mapa específico e retorna os spawns em formato JSON"""
    file_path = get_map_spawn_file(map_name)
    spawns = []
    
    if not os.path.exists(file_path):
        return spawns
        
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    current_uuid = None
    
    for line in lines:
        l = line.strip()
        if l.startswith("// UUID: "):
            current_uuid = l.replace("// UUID: ", "").strip()
            continue
            
        if not l or l.startswith("//"):
            continue
            
        # Formato: mapname,x,y,rx,ry<TAB>monster<TAB>mobname<TAB>mobid,amount,delay1,delay2,event
        # prt_fild01,0,0,0,0	monster	Poring	1002,1,0,0,0
        if "\tmonster\t" in l:
            try:
                parts = l.split("\t")
                coords = parts[0].split(",")
                mapn = coords[0]
                x = int(coords[1])
                y = int(coords[2])
                rx = int(coords[3])
                ry = int(coords[4])
                
                mobname = parts[2]
                
                rest = parts[3].split(",")
                mobid = int(rest[0]) if rest[0].isdigit() else rest[0]
                amount = int(rest[1])
                delay1 = int(rest[2]) if len(rest) > 2 else 0
                delay2 = int(rest[3]) if len(rest) > 3 else 0
                event = rest[4] if len(rest) > 4 else ""
                
                spawns.append({
                    "uuid": current_uuid or str(uuid.uuid4()),
                    "map": mapn,
                    "x": x,
                    "y": y,
                    "rx": rx,
                    "ry": ry,
                    "mobname": mobname,
                    "mobid": mobid,
                    "amount": amount,
                    "delay1": delay1,
                    "delay2": delay2,
                    "event": event,
                    "raw_line": l
                })
            except Exception as e:
                print(f"[!] Erro ao dar parse no spawn {l}: {e}")
        
        current_uuid = None
        
    return spawns

def append_spawn(map_name: str, snippet: str) -> dict:
    folder = get_spawn_folder()
    os.makedirs(folder, exist_ok=True)
    
    file_path = get_map_spawn_file(map_name)
    spawn_uuid = str(uuid.uuid4())
    
    block = f"// UUID: {spawn_uuid}\n{snippet.strip()}\n"
    
    with open(file_path, "a", encoding="utf-8", newline="\n") as f:
        f.write(block)
        
    ensure_import_in_index(map_name)
    
    return {
        "success": True,
        "uuid": spawn_uuid,
        "file_path": file_path
    }

def delete_spawn(map_name: str, spawn_uuid: str) -> dict:
    file_path = get_map_spawn_file(map_name)
    if not os.path.exists(file_path):
        raise RuntimeError(f"Arquivo não encontrado: {file_path}")
        
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    new_lines = []
    skip_next = False
    deleted = False
    
    for i, line in enumerate(lines):
        if skip_next:
            skip_next = False
            continue
            
        if line.strip() == f"// UUID: {spawn_uuid}":
            skip_next = True
            deleted = True
            continue
            
        new_lines.append(line)
        
    with open(file_path, "w", encoding="utf-8", newline="\n") as f:
        f.writelines(new_lines)
        
    # Autodelete check
    if not any(not l.strip().startswith("//") and l.strip() for l in new_lines):
        os.remove(file_path)
        remove_import_from_index(map_name)
        return {"success": True, "deleted": deleted, "file_removed": True}
        
    return {"success": True, "deleted": deleted, "file_removed": False}

def update_spawn(map_name: str, spawn_uuid: str, snippet: str) -> dict:
    file_path = get_map_spawn_file(map_name)
    if not os.path.exists(file_path):
        raise RuntimeError(f"Arquivo não encontrado: {file_path}")
        
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    updated = False
    
    for i, line in enumerate(lines):
        if line.strip() == f"// UUID: {spawn_uuid}":
            if i + 1 < len(lines):
                lines[i+1] = snippet.strip() + "\n"
                updated = True
                break
                
    if not updated:
        return {"success": False, "updated": False}
        
    with open(file_path, "w", encoding="utf-8", newline="\n") as f:
        f.writelines(lines)
        
    return {"success": True, "updated": True}
