from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import items, grf
from app.services.yaml_parser import yaml_db
from app.services.grf_reader import grf_reader
import os
import shutil
import sys
from dotenv import load_dotenv

def setup_and_validate_env():
    # Base directory for the backend (where .env and .env-template are)
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
            
    # 2. Carrega as variáveis
    load_dotenv(dotenv_path=env_path)
    
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
    missing_keys = []
    for key in required_keys:
        val = os.environ.get(key, "").strip()
        if not val:
            missing_keys.append(key)
            
    if missing_keys:
        print(f"\n[ERRO] Configuração incompleta no arquivo .env do Backend!")
        print(f"As seguintes variáveis estão vazias ou ausentes e precisam ser preenchidas:")
        for key in missing_keys:
            print(f"  - {key}")
        print(f"Por favor, edite o arquivo '{env_path}' e preencha-as antes de rodar o servidor.\n")
        sys.exit(1)

# Executa o setup e validação antes de subir a app
setup_and_validate_env()

app = FastAPI(
    title="webServerDatabaseEditor API",
    description="Backend for rAthena database editing and GRF reading.",
    version="1.0.0"
)

# CORS configuration for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to the frontend URL
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
    
    if grf_path:
        grf_reader.load(grf_path)
        
    if iteminfo_path:
        iteminfo_db.load_background(iteminfo_path)
        
    yield

# Atualiza a app para usar o lifespan correto (FastAPI moderno)
app.router.lifespan_context = lifespan

# Register routers
app.include_router(items.router, prefix="/api/items", tags=["items"])
app.include_router(grf.router, prefix="/api/grf", tags=["grf"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "webServerDatabaseEditor API is running"}
