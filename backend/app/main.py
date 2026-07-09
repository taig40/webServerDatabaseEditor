import os
import shutil
import sys
from dotenv import load_dotenv

# ─── Load Environment Variables First (Highest Priority) ─────────────────────
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_template_path = os.path.join(base_dir, ".env-template")
env_path = os.path.join(base_dir, ".env")

# 1. Se é a primeira vez rodando (não existe .env), transforma o .env-template em .env
if not os.path.exists(env_path):
    if os.path.exists(env_template_path):
        shutil.copyfile(env_template_path, env_path)
        print(f"[*] Arquivo .env criado a partir de .env-template em {env_path}")
    else:
        print(f"[Erro] Arquivo .env-template não encontrado em {env_template_path}")
        sys.exit(1)

# 2. Carrega as variáveis (com override=True para garantir precedência do arquivo .env)
load_dotenv(dotenv_path=env_path, override=True)

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
from app.api import items, grf, mobs, skills, mob_skills, combos, quests, pets, client_items, settings as settings_api, achievements, randomopt, sizefix, images, constants, progression, editor
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
from app.core.config import cfg
cfg.reload_from_env()

def setup_and_validate_env():
    # 3. Lê as chaves necessárias do .env-template para validar
    required_keys = []
    if os.path.exists(env_template_path):
        with open(env_template_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key = line.split("=")[0].strip()
                    if key:
                        required_keys.append(key)
                        
    # 4. Verifica se cada variável está preenchida (diferente de vazia)
    # GRF slots, override path and legacy GRF_PATH are all optional (at least one is enough)
    optional_keys = {
        "GRF_OVERRIDE_PATH", "GRF_PATH",
        *[f"GRF_{i}" for i in range(10)],
    }
    missing_keys = []
    for key in required_keys:
        if key in optional_keys:
            continue
        val = os.environ.get(key, "").strip()
        if not val:
            if key == "SERVER_DB_BASE_PATH" and os.environ.get("ITEM_DB_PATH", "").strip():
                continue
            missing_keys.append(key)

    # Warn if no GRF is configured at all (non-fatal)
    has_any_grf = any(os.environ.get(f"GRF_{i}", "").strip() for i in range(10))
    has_legacy_grf = bool(os.environ.get("GRF_PATH", "").strip())
    if not has_any_grf and not has_legacy_grf:
        print("[!] Aviso: Nenhum arquivo GRF configurado (GRF_0..GRF_9). "
              "Sprites e ícones não serão exibidos. Configure na página de Configurações.")
            
    if missing_keys:
        print(f"\n[ERRO] Configuração incompleta no arquivo .env do Backend!")
        print(f"As seguintes variáveis estão vazias ou ausentes e precisam ser preenchidas:")
        for key in missing_keys:
            print(f"  - {key}")
        print(f"Por favor, edite o arquivo '{env_path}' ou use a página de Configurações do site.\n")
        sys.exit(1)

# Executa o setup e validação antes de subir a app
setup_and_validate_env()

app = FastAPI(
    title="webServerDatabaseEditor API",
    description="Backend for rAthena database editing and GRF reading.",
    version="1.0.0"
)

# CORS configuration for the React frontend
cors_origins_str = os.environ.get("CORS_ORIGINS", "")
if cors_origins_str:
    origins = [origin.strip() for origin in cors_origins_str.split(",") if origin.strip()]
else:
    origins = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.services.iteminfo_parser import iteminfo_db
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicializa os dados em background na subida do servidor
    db_path = os.environ.get("ITEM_DB_PATH", "")
    grf_path = os.environ.get("GRF_PATH", "")
    iteminfo_path = os.environ.get("ITEMINFO_PATH", "")
    
    yaml_db.load_db_async(db_path)
    print(f"[*] Disparado o processo de parse assíncrono do YAML a partir de '{db_path}'.")

    from app.services.npc_parser import npc_db
    import asyncio
    asyncio.create_task(npc_db.load_async())
    
    mob_db_path = os.environ.get("MOB_DB_PATH", "")
    if not mob_db_path and db_path:
        mob_db_path = db_path.replace("item_db.yml", "mob_db.yml")
    if mob_db_path:
        mob_db.load_db_async(mob_db_path)
        print(f"[*] Disparado o processo de parse assíncrono de monstros a partir de '{mob_db_path}'.")
    
    if grf_path or any(os.environ.get(f"GRF_{i}", "").strip() for i in range(MAX_GRF_SLOTS)):
        override_path = os.environ.get("GRF_OVERRIDE_PATH", "")

        # Build GRF list from GRF_0 ... GRF_9
        grf_list = []
        for i in range(MAX_GRF_SLOTS):
            slot_path = os.environ.get(f"GRF_{i}", "").strip()
            if slot_path:
                grf_list.append({"priority": i, "path": slot_path})

        # Migration: honour legacy GRF_PATH if no GRF_N slots are set
        if not grf_list and grf_path:
            grf_list.append({"priority": 0, "path": grf_path})

        grf_reader.load_multi(grf_list, override_path=override_path)
        
    if iteminfo_path:
        iteminfo_db.load_background(iteminfo_path)
        
    skill_db_path = os.environ.get("SKILL_DB_PATH", "")
    if skill_db_path:
        skill_db.load_db_async(skill_db_path)
        print(f"[*] Disparado o processo de parse assíncrono de skills a partir de '{skill_db_path}'.")

    mob_skill_db_path = os.environ.get("MOB_SKILL_DB_PATH", "")
    if mob_skill_db_path:
        mob_skill_db.load_db_async(mob_skill_db_path)
        print(f"[*] Disparado o processo de parse assíncrono de mob skills a partir de '{mob_skill_db_path}'.")

    combo_db_path = os.environ.get("COMBO_DB_PATH", "")
    if combo_db_path:
        combo_db.load_db_async(combo_db_path)
        print(f"[*] Disparado o processo de parse assíncrono de combos a partir de '{combo_db_path}'.")

    quest_db_path = os.environ.get("QUEST_DB_PATH", "")
    if quest_db_path:
        quest_db.load_db_async(quest_db_path)
        print(f"[*] Disparado o processo de parse assíncrono de quests a partir de '{quest_db_path}'.")

    pet_db_path = os.environ.get("PET_DB_PATH", "")
    if pet_db_path:
        pet_db.load_db_async(pet_db_path)
        print(f"[*] Disparado o processo de parse assíncrono de mascotes a partir de '{pet_db_path}'.")

    achievement_db_path = os.environ.get("ACHIEVEMENT_DB_PATH", "")
    if achievement_db_path:
        achievement_db.load_db_async(achievement_db_path)
        print(f"[*] Disparado o processo de parse assíncrono de conquistas a partir de '{achievement_db_path}'.")

    const_db_path = os.environ.get("CONST_DB_PATH", "")
    if const_db_path:
        const_db.load_db_async(const_db_path)
        print(f"[*] Disparado o processo de parse assíncrono de constantes a partir de '{const_db_path}'.")
        
    from app.services.randomopt_parser import randomopt_db
    randomopt_db.initialize()
    print("[*] Random Options database inicializado.")

    from app.services.sizefix_parser import sizefix_db
    sizefix_db.initialize()
    print("[*] Size Fix database inicializado.")

    from app.services.progression_parser import (
        job_stats_db, job_basepoints_db, job_exp_db, skill_tree_db, job_aspd_db, job_outfits_db
    )
    job_stats_db.load()
    job_basepoints_db.load()
    job_exp_db.load()
    skill_tree_db.load()
    job_aspd_db.load()
    job_outfits_db.load()
    print("[*] Databases de progressão (Job Stats, Basepoints, Job Exp, Skill Tree, ASPD, Outfits) carregados.")
        
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
app.include_router(sizefix.router,      prefix="/api/server/sizefix",   tags=["sizefix"])
app.include_router(progression.router,  prefix="/api/progression",      tags=["progression"])
app.include_router(editor.router,       prefix="/api/editor",           tags=["editor"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "webServerDatabaseEditor API is running"}
