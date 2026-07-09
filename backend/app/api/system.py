import asyncio
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.services.load_progress import progress_tracker

router = APIRouter()

@router.get("/load-progress")
async def get_load_progress():
    """
    Endpoint SSE (Server-Sent Events) que transmite o progresso em tempo real (0.0% a 100.0%)
    do carregamento e parseamento das bases YAML no servidor.
    """
    async def event_generator():
        last_sent = None
        while True:
            snapshot = progress_tracker.get_snapshot()
            snapshot_str = json.dumps(snapshot, ensure_ascii=False)
            
            # Só envia se mudou ou na primeira iteração para não sobrecarregar
            if snapshot_str != last_sent:
                yield f"data: {snapshot_str}\n\n"
                last_sent = snapshot_str
            
            if not snapshot["is_loading"]:
                # Envia o evento final indicando 100% concluído e encerra o stream
                yield f"data: {snapshot_str}\n\n"
                break
                
            await asyncio.sleep(0.2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

@router.get("/status")
async def get_system_status():
    """
    Retorna o status atual como JSON simples para verificação rápida.
    """
    return progress_tracker.get_snapshot()

@router.get("/initialize-cache")
async def initialize_cache():
    """
    Endpoint SSE que monitora e envia eventos sequencialmente durante o cache
    dos arquivos YAML principais (item_db.yml, mob_db.yml, skill_db.yml).
    """
    from app.services.yaml_parser import yaml_db
    from app.services.mob_parser import mob_db
    from app.services.skill_parser import skill_db

    files_to_check = [
        ("item_db.yml", yaml_db),
        ("mob_db.yml", mob_db),
        ("skill_db.yml", skill_db),
    ]

    async def event_generator():
        for filename, db_obj in files_to_check:
            progress_val = 10.0
            while getattr(db_obj, "is_loading", False):
                payload = {
                    "status": "loading",
                    "file": filename,
                    "progress": round(progress_val, 1)
                }
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                progress_val = min(95.0, progress_val + 15.0)
                await asyncio.sleep(0.15)

            payload = {
                "status": "loading",
                "file": filename,
                "progress": 100.0
            }
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.1)

        complete_payload = {"status": "complete"}
        yield f"data: {json.dumps(complete_payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
