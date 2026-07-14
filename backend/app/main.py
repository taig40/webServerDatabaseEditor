import os
import shutil
import sys
from dotenv import load_dotenv

from app.core.config import cfg, get_env_path, BASE_DIR, ENV_PATH, ENV_TEMPLATE_PATH

# ─── Load Environment Variables First (Highest Priority) ─────────────────────
# 1. Obter caminho unificado e absoluto do .env
unified_env_path = get_env_path()

# 2. Se é a primeira vez rodando (não existe .env), transforma o .env-template em .env (ou cria vazio em Safe Mode)
if not os.path.exists(unified_env_path):
    if os.path.exists(ENV_TEMPLATE_PATH):
        shutil.copyfile(ENV_TEMPLATE_PATH, unified_env_path)
        print(f"[*] Arquivo .env criado a partir de .env-template em {unified_env_path}")
    else:
        with open(unified_env_path, "w", encoding="utf-8") as f:
            f.write("# rAthena Web Editor - Gerado automaticamente em Safe Mode\nSERVER_DB_BASE_PATH=\n")
        print(f"[*] Arquivo .env vazio gerado para modo First-Time Setup em {unified_env_path}")

# 3. Carrega as variáveis (com override=True para garantir precedência do arquivo .env unificado)
load_dotenv(dotenv_path=get_env_path(), override=True)

# 2c. Preencher caminhos de banco de dados automaticamente a partir de SERVER_DB_BASE_PATH se preenchido
db_base_path = os.environ.get("SERVER_DB_BASE_PATH", "").strip()
if db_base_path:
    print(f"[*] Usando pasta base de DB: '{db_base_path}'")
    db_defaults = {
        "ITEM_DB_PATH": "re/item_db.yml",
        "MOB_DB_PATH": "re/mob_db.yml",
        "SKILL_DB_PATH": "re/skill_db.yml",
        "MOB_SKILL_DB_PATH": "re/mob_skill_db.txt",
        "COMBO_DB_PATH": "re/item_combos.yml",
        "QUEST_DB_PATH": "re/quest_db.yml",
        "PET_DB_PATH": "re/pet_db.yml",
        "ACHIEVEMENT_DB_PATH": "re/achievement_db.yml",
        "CONST_DB_PATH": "const.yml",
    }
    for env_key, filename in db_defaults.items():
        if not os.environ.get(env_key, "").strip():
            os.environ[env_key] = os.path.join(db_base_path, filename).replace("\\", "/")

# ─── Import Application Modules (Dependent on Env Variables) ────────────────
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import items, grf, mobs, skills, mob_skills, combos, quests, pets, client_items, settings as settings_api, achievements, randomopt, sizefix, images, constants, progression, editor, system, divinepride, map_drops, custom_spawns
from app.services.yaml_parser import yaml_db
from app.services.mob_parser import mob_db
from app.services.grf_reader import grf_reader, MAX_GRF_SLOTS
from app.services.skill_parser import skill_db
from app.services.mob_skill_parser import mob_skill_db
from app.services.combo_parser import combo_db
from app.services.quest_parser import quest_db
from app.services.pet_parser import pet_db
from app.services.achievement_parser import achievement_db
from app.services.const_parser import const_db

# ─── Live Config Sync ────────────────────────────────────────────────────────
cfg.reload_from_env()

APP_STATE = {"setup_required": False, "missing_keys": []}

def setup_and_validate_env():
    unified_env_path = get_env_path()
    env_exists = os.path.exists(unified_env_path)
    
    db_base = os.environ.get("SERVER_DB_BASE_PATH", "").strip()
    item_db = os.environ.get("ITEM_DB_PATH", "").strip()
    is_db_valid = (db_base and os.path.exists(db_base)) or (item_db and os.path.exists(item_db))

    has_any_grf = any(os.environ.get(f"GRF_{i}", "").strip() for i in range(10))
    has_legacy_grf = bool(os.environ.get("GRF_PATH", "").strip())
    if not has_any_grf and not has_legacy_grf:
        print("[!] Aviso: Nenhum arquivo GRF configurado (GRF_0..GRF_9). "
              "Sprites e ícones não serão exibidos. Configure na página de Configurações.")

    missing_keys = []
    if not db_base and not item_db:
        missing_keys.append("SERVER_DB_BASE_PATH")

    if not env_exists or missing_keys or not is_db_valid:
        print(f"\n[!] Aviso: Configuração pendente (.env existe: {env_exists}) ou pasta rAthena não configurada/ausente.")
        print(f"    Caminho unificado verificado: {unified_env_path}")
        print("    O Backend iniciará em 'Safe Mode' aguardando configuração inicial via /api/setup.\n")
        APP_STATE["setup_required"] = True
        APP_STATE["missing_keys"] = missing_keys
    else:
        print(f"[*] Configuração .env detectada e validada em {unified_env_path}")
        APP_STATE["setup_required"] = False
        APP_STATE["missing_keys"] = []

# Executa o setup e validação antes de subir a app
setup_and_validate_env()

app = FastAPI(
    title="webServerDatabaseEditor API",
    description="Backend for rAthena database editing and GRF reading.",
    version="1.0.0"
)

# CORS configuration for the React frontend
default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
cors_origins_str = os.environ.get("CORS_ORIGINS", "")
if cors_origins_str:
    custom_origins = [origin.strip() for origin in cors_origins_str.split(",") if origin.strip()]
    origins = list(set(default_origins + custom_origins))
else:
    origins = default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.services.iteminfo_parser import iteminfo_db
from contextlib import asynccontextmanager
from pydantic import BaseModel

class SetupPayload(BaseModel):
    SERVER_DB_BASE_PATH: str
    GRF_0: str = ""
    ITEMINFO_PATH: str = ""
    API_URL: str = ""
    SERVER_ENCODING: str = "utf-8"
    CLIENT_ENCODING: str = "latin1"

@asynccontextmanager
async def lifespan(app: FastAPI):
    if APP_STATE["setup_required"]:
        print("[*] Servidor FastAPI iniciando em Safe Mode (Aguardando First-Time Setup).")
        yield
        return
    print("[*] Servidor FastAPI iniciando. Carregando GRFs e ItemInfo em background...")
    import threading
    def _startup_resources():
        try:
            grf_path = os.environ.get("GRF_PATH", "").strip()
            override_path = os.environ.get("GRF_OVERRIDE_PATH", "").strip()
            grf_list = []
            for i in range(MAX_GRF_SLOTS):
                slot_path = os.environ.get(f"GRF_{i}", "").strip()
                if slot_path:
                    grf_list.append({"priority": i, "path": slot_path})
            if not grf_list and grf_path:
                grf_list.append({"priority": 0, "path": grf_path})
            if grf_list:
                grf_reader.load_multi(grf_list, override_path=override_path)
            iteminfo_db.load()
        except Exception as e:
            print(f"[!] Erro ao carregar recursos iniciais: {e}")
    threading.Thread(target=_startup_resources, daemon=True).start()
    yield

# Atualiza a app para usar o lifespan correto (FastAPI moderno)
app.router.lifespan_context = lifespan

# Register routers
app.include_router(items.router,        prefix="/api/items",        tags=["items"])
app.include_router(grf.router,          prefix="/api/grf",          tags=["grf"])
app.include_router(images.router,       prefix="/api/images",       tags=["images"])
app.include_router(mobs.router,         prefix="/api/mobs",         tags=["mobs"])
app.include_router(skills.router,       prefix="/api/skills",       tags=["skills"])
app.include_router(mob_skills.router,   prefix="/api/mob_skills",   tags=["mob_skills"])
app.include_router(combos.router,       prefix="/api/combos",       tags=["combos"])
app.include_router(quests.router,       prefix="/api/quests",       tags=["quests"])
app.include_router(pets.router,         prefix="/api/pets",         tags=["pets"])
app.include_router(client_items.router, prefix="/api/client_items", tags=["client_items"])
app.include_router(settings_api.router, prefix="/api/settings",    tags=["settings"])
app.include_router(achievements.router,  prefix="/api/achievements", tags=["achievements"])
app.include_router(constants.router,     prefix="/api/constants",    tags=["constants"])
app.include_router(randomopt.router,    prefix="/api/server/randomopt", tags=["randomopt"])
app.include_router(randomopt.router,    prefix="/api/random-options-groups", tags=["random-options-groups"])
app.include_router(sizefix.router,      prefix="/api/server/sizefix",   tags=["sizefix"])
app.include_router(progression.router,  prefix="/api/progression",      tags=["progression"])
app.include_router(editor.router,       prefix="/api/editor",           tags=["editor"])
app.include_router(system.router,       prefix="/api/system",           tags=["system"])
app.include_router(divinepride.router,  prefix="/api/divinepride",      tags=["divinepride"])
app.include_router(map_drops.router,    prefix="/api/map-drops",          tags=["map-drops"])
app.include_router(custom_spawns.router, prefix="/api/scripts/custom-spawns", tags=["custom-spawns"])

@app.get("/api/status")
def get_system_status():
    env_exists = os.path.exists(get_env_path())
    db_base = os.environ.get("SERVER_DB_BASE_PATH", "").strip()
    item_db = os.environ.get("ITEM_DB_PATH", "").strip()
    is_ready = env_exists and not APP_STATE["setup_required"] and ((db_base and os.path.exists(db_base)) or (item_db and os.path.exists(item_db)))
    return {
        "status": "ok" if is_ready else "setup_required",
        "missing_keys": APP_STATE["missing_keys"],
        "db_base_path": db_base
    }

@app.post("/api/setup")
async def post_system_setup(payload: SetupPayload):
    from fastapi import HTTPException
    from app.api.settings import _read_env, _write_env, reload_settings
    db_base = payload.SERVER_DB_BASE_PATH.strip().replace("\\", "/")
    if not os.path.exists(db_base):
        raise HTTPException(status_code=400, detail="A pasta selecionada para o rAthena não foi encontrada.")
    
    env = _read_env()
    env["SERVER_DB_BASE_PATH"] = db_base
    os.environ["SERVER_DB_BASE_PATH"] = db_base
    
    if payload.GRF_0.strip():
        grf_path = payload.GRF_0.strip().replace("\\", "/")
        env["GRF_0"] = grf_path
        os.environ["GRF_0"] = grf_path

    if payload.ITEMINFO_PATH.strip():
        i_path = payload.ITEMINFO_PATH.strip().replace("\\", "/")
        env["ITEMINFO_PATH"] = i_path
        os.environ["ITEMINFO_PATH"] = i_path

    if payload.API_URL.strip():
        api_u = payload.API_URL.strip()
        env["DIVINE_PRIDE_API_KEY"] = api_u
        os.environ["DIVINE_PRIDE_API_KEY"] = api_u

    env["SERVER_ENCODING"] = (payload.SERVER_ENCODING or "utf-8").strip()
    os.environ["SERVER_ENCODING"] = env["SERVER_ENCODING"]

    env["CLIENT_ENCODING"] = (payload.CLIENT_ENCODING or "latin1").strip()
    os.environ["CLIENT_ENCODING"] = env["CLIENT_ENCODING"]
        
    db_defaults = {
        "ITEM_DB_PATH": "re/item_db.yml",
        "MOB_DB_PATH": "re/mob_db.yml",
        "SKILL_DB_PATH": "re/skill_db.yml",
        "MOB_SKILL_DB_PATH": "re/mob_skill_db.txt",
        "COMBO_DB_PATH": "re/item_combos.yml",
        "QUEST_DB_PATH": "re/quest_db.yml",
        "PET_DB_PATH": "re/pet_db.yml",
        "ACHIEVEMENT_DB_PATH": "re/achievement_db.yml",
        "CONST_DB_PATH": "const.yml",
    }
    for env_key, filename in db_defaults.items():
        full_p = os.path.join(db_base, filename).replace("\\", "/")
        env[env_key] = full_p
        os.environ[env_key] = full_p
        
    _write_env(env)
    load_dotenv(dotenv_path=get_env_path(), override=True)
    
    await reload_settings()
    APP_STATE["setup_required"] = False
    APP_STATE["missing_keys"] = []
    return {"status": "ok", "message": "Setup concluído com sucesso."}

@app.get("/")
def read_root():
    return {"status": "ok", "message": "webServerDatabaseEditor API is running"}
