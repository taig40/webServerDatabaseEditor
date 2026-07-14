"""
Global runtime configuration module.

Provides a single source of truth for settings that can change at runtime
(e.g. via the Settings page) without restarting the server.

Usage in any service:
    from app.core.config import cfg
    enc = cfg.client_encoding   # e.g. "euc-kr"
"""

import os
import sys
import traceback
from pathlib import Path

def get_config_path() -> str:
    """Retorna o caminho absoluto do arquivo conf/config.conf em modo frozen (.exe) ou dev usando o AppData do usuário."""
    app_name = "rAthenaWebEditor"
    if sys.platform == "win32":
        appdata = os.getenv("APPDATA")
        if appdata:
            base_dir = os.path.join(appdata, app_name)
        else:
            base_dir = os.path.join(str(Path.home()), f".{app_name}")
    else:
        base_dir = os.path.join(str(Path.home()), f".{app_name}")
        
    conf_dir = os.path.join(base_dir, 'conf')
    try:
        os.makedirs(conf_dir, exist_ok=True)
    except Exception as e:
        try:
            # Tenta salvar o log direto na Área de Trabalho do Windows
            desktop = os.path.join(os.environ.get('USERPROFILE', 'C:\\'), 'Desktop')
            log_file = os.path.join(desktop, 'rathena_crash_log.txt')
            with open(log_file, 'w', encoding='utf-8') as f:
                f.write("CRASH DURANTE A CRIAÇÃO DA PASTA DE CONFIGURAÇÕES:\n")
                f.write(traceback.format_exc())
        except:
            pass
        raise e
    return os.path.join(conf_dir, 'config.conf')

def get_env_path() -> str:
    """Retorna o caminho de configuração (conf/config.conf) para compatibilidade de chamadas existentes."""
    return get_config_path()

if getattr(sys, 'frozen', False):
    # Se estiver rodando como .exe (PyInstaller)
    BASE_DIR = os.path.dirname(os.path.abspath(sys.executable))
    ENV_TEMPLATE_PATH = os.path.join(getattr(sys, '_MEIPASS', BASE_DIR), '.env-template')
else:
    # Se estiver rodando em desenvolvimento
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ENV_TEMPLATE_PATH = os.path.join(BASE_DIR, '.env-template')

CONFIG_PATH = get_config_path()
ENV_PATH = CONFIG_PATH

def get_rathena_root(db_base: str = None) -> str:
    """
    Deduz de forma segura a pasta raiz do rAthena a partir de SERVER_DB_BASE_PATH ou ITEM_DB_PATH,
    blindada contra erros de caminhos relativos e verificando tanto C:/rAthena/db quanto C:/rAthena.
    """
    if not db_base:
        db_base = os.environ.get("RATHENA_DB_PATH", "").strip() or os.environ.get("SERVER_DB_BASE_PATH", "").strip()
    if not db_base:
        item_db = os.environ.get("ITEM_DB_PATH", "").strip()
        if item_db and "/re/" in item_db.replace("\\", "/"):
            db_base = item_db.replace("\\", "/").split("/re/")[0]
        elif item_db and "/pre-re/" in item_db.replace("\\", "/"):
            db_base = item_db.replace("\\", "/").split("/pre-re/")[0]
    if not db_base:
        return ""
    
    clean_base = db_base.rstrip("/\\")
    if not os.path.isabs(clean_base):
        clean_base = os.path.abspath(os.path.join(BASE_DIR, clean_base))
    else:
        clean_base = os.path.abspath(clean_base)
        
    parent_dir = os.path.dirname(clean_base)
    if os.path.exists(os.path.join(parent_dir, "npc")):
        return parent_dir.replace("\\", "/")
    if os.path.exists(os.path.join(clean_base, "npc")):
        return clean_base.replace("\\", "/")
    return parent_dir.replace("\\", "/")

# Supported encodings (value, label, aliases the Python codec accepts)
ENCODING_OPTIONS = [
    {"value": "utf-8",   "label": "UTF-8 (padrão)"},
    {"value": "euc-kr",  "label": "EUC-KR / CP949 (clientes coreanos kRO)"},
    {"value": "cp1252",  "label": "Windows-1252 / CP1252 (servidores ocidentais)"},
    {"value": "latin-1", "label": "Latin-1 (transparente / ignorar erros de decodificação)"},
]


class _Config:
    """Mutable runtime config — updated by the Settings API on reload."""

    def __init__(self):
        self.reload_from_env()

    def reload_from_env(self):
        self.server_encoding: str = os.environ.get("SERVER_ENCODING", "utf-8").strip() or "utf-8"
        self.client_encoding: str = os.environ.get("CLIENT_ENCODING", "euc-kr").strip() or "euc-kr"
        
        self.achievements_lua_path: str = os.environ.get("ACHIEVEMENTS_LUA_PATH", "").strip()
        if not self.achievements_lua_path:
            iteminfo = os.environ.get("ITEMINFO_PATH", "").strip()
            if iteminfo:
                system_dir = os.path.dirname(os.path.dirname(iteminfo))
                p1 = os.path.join(system_dir, "achievements.lub").replace("\\", "/")
                if os.path.exists(p1):
                    self.achievements_lua_path = p1
                else:
                    p2 = os.path.join(system_dir, "achievement_list.lub").replace("\\", "/")
                    if os.path.exists(p2):
                        self.achievements_lua_path = p2

        self.quests_lua_path: str = os.environ.get("QUESTS_LUA_PATH", "").strip()
        if not self.quests_lua_path:
            iteminfo = os.environ.get("ITEMINFO_PATH", "").strip()
            if iteminfo:
                system_dir = os.path.dirname(os.path.dirname(iteminfo))
                filenames = (
                    "OngoingQuests.lub", "OngoingQuests.lua",
                    "OngoingQuestInfoList.lub", "OngoingQuestInfoList.lua",
                    "questid2display.lua", "questid2display.lub"
                )
                for fn in filenames:
                    p = os.path.join(system_dir, fn).replace("\\", "/")
                    if os.path.exists(p):
                        self.quests_lua_path = p
                        break
                else:
                    game_root = os.path.dirname(system_dir)
                    for fn in filenames:
                        p = os.path.join(game_root, "System", fn).replace("\\", "/")
                        if os.path.exists(p):
                            self.quests_lua_path = p
                            break

    def set_server_encoding(self, enc: str):
        self.server_encoding = enc
        os.environ["SERVER_ENCODING"] = enc

    def set_client_encoding(self, enc: str):
        self.client_encoding = enc
        os.environ["CLIENT_ENCODING"] = enc


cfg = _Config()
