from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import items, grf
from app.services.yaml_parser import yaml_db
from app.services.grf_reader import grf_reader
import os
import platform
from dotenv import load_dotenv

# Carrega as variáveis definidas no arquivo .env
load_dotenv()

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
