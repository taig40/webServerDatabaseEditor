from fastapi import APIRouter, HTTPException
import os
from typing import List
from app.core.config import get_rathena_root

router = APIRouter()

@router.get("/list", response_model=List[str])
async def list_maps():
    """
    Retorna uma lista ordenada com os nomes de todos os mapas válidos lidos do db/map_index.txt.
    """
    rathena_root = get_rathena_root()
    if not rathena_root:
        raise HTTPException(status_code=500, detail="rAthena root não encontrado.")
    
    map_index_path = os.path.join(rathena_root, "db", "map_index.txt").replace("\\", "/")
    
    # Dependendo da estrutura (re/pre-re) e de modificações custom, às vezes pode estar em db/re/map_index.txt
    if not os.path.exists(map_index_path):
        map_index_path = os.path.join(rathena_root, "db", "re", "map_index.txt").replace("\\", "/")
        if not os.path.exists(map_index_path):
            map_index_path = os.path.join(rathena_root, "db", "pre-re", "map_index.txt").replace("\\", "/")
            if not os.path.exists(map_index_path):
                raise HTTPException(status_code=404, detail="map_index.txt não encontrado.")
                
    maps = set()
    try:
        with open(map_index_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("//"):
                    continue
                # Formato: "prontera.gat 1" ou "prontera 1"
                parts = line.split()
                if not parts:
                    continue
                map_name = parts[0]
                if map_name.endswith(".gat"):
                    map_name = map_name[:-4]
                maps.add(map_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler map_index.txt: {str(e)}")
        
    return sorted(list(maps))
