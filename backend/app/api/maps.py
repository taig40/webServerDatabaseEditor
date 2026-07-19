from fastapi import APIRouter, HTTPException
import os
from typing import List
from app.core.config import get_rathena_root

router = APIRouter()

@router.get("/list", response_model=List[str])
async def list_maps():
    """Returns a sorted list of all valid map names read from ``db/map_index.txt``.

    Searches for ``map_index.txt`` in ``db/``, then ``db/re/``, then ``db/pre-re/``
    in that order to accommodate both renewal and pre-renewal server configurations.
    Entries ending in ``.gat`` are stripped of that suffix.

    Returns:
        List[str]: Sorted, deduplicated list of map names.

    Raises:
        HTTPException: 500 if rAthena root is not configured or file read fails;
            404 if ``map_index.txt`` is not found in any of the expected locations.
    """
    rathena_root = get_rathena_root()
    if not rathena_root:
        raise HTTPException(status_code=500, detail="rAthena root não encontrado.")

    map_index_path = os.path.join(rathena_root, "db", "map_index.txt").replace("\\", "/")

    # Check renewal and pre-renewal fallback locations
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
