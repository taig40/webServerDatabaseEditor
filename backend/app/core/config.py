"""
Global runtime configuration module.

Provides a single source of truth for settings that can change at runtime
(e.g. via the Settings page) without restarting the server.

Usage in any service:
    from app.core.config import cfg
    enc = cfg.client_encoding   # e.g. "euc-kr"
"""

import os

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
                p1 = os.path.join(system_dir, "questid2display.lua").replace("\\", "/")
                if os.path.exists(p1):
                    self.quests_lua_path = p1
                else:
                    p2 = os.path.join(system_dir, "questid2display.lub").replace("\\", "/")
                    if os.path.exists(p2):
                        self.quests_lua_path = p2

    def set_server_encoding(self, enc: str):
        self.server_encoding = enc
        os.environ["SERVER_ENCODING"] = enc

    def set_client_encoding(self, enc: str):
        self.client_encoding = enc
        os.environ["CLIENT_ENCODING"] = enc


cfg = _Config()
