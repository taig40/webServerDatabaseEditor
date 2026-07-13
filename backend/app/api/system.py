import os
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
    dos arquivos YAML principais sob demanda, sem bloquear o event loop.
    """
    from app.services.yaml_parser import yaml_db
    from app.services.mob_parser import mob_db
    from app.services.skill_parser import skill_db
    from app.services.mob_skill_parser import mob_skill_db
    from app.services.combo_parser import combo_db
    from app.services.quest_parser import quest_db
    from app.services.pet_parser import pet_db
    from app.services.achievement_parser import achievement_db
    from app.services.const_parser import const_db
    from app.services.grf_reader import grf_reader, MAX_GRF_SLOTS
    from app.services.iteminfo_parser import iteminfo_db
    from app.services.randomopt_parser import randomopt_db
    from app.services.sizefix_parser import sizefix_db
    from app.services.progression_parser import (
        job_stats_db, job_basepoints_db, job_exp_db, skill_tree_db, job_aspd_db, job_outfits_db
    )

    db_tasks = [
        ("item_db.yml", yaml_db, os.environ.get("ITEM_DB_PATH", "")),
        ("mob_db.yml", mob_db, os.environ.get("MOB_DB_PATH", "")),
        ("skill_db.yml", skill_db, os.environ.get("SKILL_DB_PATH", "")),
        ("mob_skill_db.txt", mob_skill_db, os.environ.get("MOB_SKILL_DB_PATH", "")),
        ("item_combos.yml", combo_db, os.environ.get("COMBO_DB_PATH", "")),
        ("quest_db.yml", quest_db, os.environ.get("QUEST_DB_PATH", "")),
        ("pet_db.yml", pet_db, os.environ.get("PET_DB_PATH", "")),
        ("achievement_db.yml", achievement_db, os.environ.get("ACHIEVEMENT_DB_PATH", "")),
        ("const.yml", const_db, os.environ.get("CONST_DB_PATH", "")),
    ]

    async def event_generator():
        from app.main import APP_STATE
        if APP_STATE.get("setup_required", False):
            yield f"data: {json.dumps({'status': 'setup_required', 'progress': 100.0}, ensure_ascii=False)}\n\n"
            return

        # 1. Yield inicial imediato para confirmar abertura do stream no front-end
        initial_payload = {
            "status": "loading",
            "file": "item_db.yml",
            "progress": 0.0
        }
        yield f"data: {json.dumps(initial_payload, ensure_ascii=False)}\n\n"
        await asyncio.sleep(0.05)

        # 2. Inicializa bases rápidas secundárias e GRFs em background sem travar o stream principal
        def init_secondary():
            randomopt_db.initialize()
            sizefix_db.initialize()
            job_stats_db.load()
            job_basepoints_db.load()
            job_exp_db.load()
            skill_tree_db.load()
            job_aspd_db.load()
            job_outfits_db.load()

            grf_path = os.environ.get("GRF_PATH", "")
            if grf_path or any(os.environ.get(f"GRF_{i}", "").strip() for i in range(MAX_GRF_SLOTS)):
                override_path = os.environ.get("GRF_OVERRIDE_PATH", "")
                grf_list = []
                for i in range(MAX_GRF_SLOTS):
                    slot_path = os.environ.get(f"GRF_{i}", "").strip()
                    if slot_path:
                        grf_list.append({"priority": i, "path": slot_path})
                if not grf_list and grf_path:
                    grf_list.append({"priority": 0, "path": grf_path})
                grf_reader.load_multi(grf_list, override_path=override_path)

        asyncio.create_task(asyncio.to_thread(init_secondary))

        valid_tasks = [t for t in db_tasks if t[2]]
        total_files = max(1, len(valid_tasks))

        for idx, (filename, db_obj, filepath) in enumerate(valid_tasks, start=1):
            start_pct = round(((idx - 1) / total_files) * 100.0, 1)
            end_pct = round((idx / total_files) * 100.0, 1)

            payload = {
                "status": "loading",
                "file": filename,
                "progress": start_pct
            }
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.05)

            def load_single_db(obj=db_obj, path=filepath):
                if hasattr(obj, "load_db"):
                    obj.load_db(path)
                elif hasattr(obj, "_load"):
                    obj._load(path)
                elif hasattr(obj, "load"):
                    obj.load(path)
                if hasattr(obj, "rebuild_cache"):
                    obj.rebuild_cache()

            task = asyncio.create_task(asyncio.to_thread(load_single_db))
            mid_pct = start_pct
            while not task.done():
                await asyncio.sleep(0.15)
                if not task.done():
                    mid_pct = min(end_pct - 1.0, mid_pct + 1.5)
                    payload = {
                        "status": "loading",
                        "file": filename,
                        "progress": round(mid_pct, 1)
                    }
                    yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

            await task

            payload = {
                "status": "loading",
                "file": filename,
                "progress": end_pct
            }
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.05)

        complete_payload = {"status": "complete", "progress": 100.0}
        yield f"data: {json.dumps(complete_payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        }
    )
