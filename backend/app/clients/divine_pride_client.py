"""
clients/divine_pride_client.py — Cliente HTTP para a API do Divine Pride.

Responsabilidade ÚNICA (SRP): realizar os requests HTTP para o Divine Pride
e retornar o JSON bruto. Zero lógica de negócio ou transformação.

Exceções tipadas permitem que as camadas superiores (Router) traduzam
os erros para respostas HTTP sem poluir a lógica de domínio.
"""

import json
import urllib.request
import urllib.error
import time
from typing import Literal, Optional, Dict, Any


# ─── Exceções tipadas ─────────────────────────────────────────────────────────

class DPException(Exception):
    """Classe base para erros do Divine Pride Client."""


class DPNotFoundException(DPException):
    """Recurso não encontrado no Divine Pride (HTTP 404)."""


class DPAuthException(DPException):
    """Chave de API inválida ou sem permissão (HTTP 401/403)."""


class DPRateLimitException(DPException):
    """Estouro do limite de requisições do Divine Pride (HTTP 429)."""
    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__(f"Rate limit excedido. Tente novamente em {retry_after} segundos.")


class DPNetworkException(DPException):
    """Falha de rede ou timeout ao comunicar com o Divine Pride."""


class DPHTTPException(DPException):
    """Erro HTTP genérico do Divine Pride."""
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        super().__init__(detail)


# ─── Cache Simples (Memória) ──────────────────────────────────────────────────

class SimpleCache:
    """Implementação básica de cache em memória com TTL fixo (15 minutos) para evitar requisições repetidas ao Divine Pride."""
    def __init__(self, ttl_seconds: int = 900):
        self.ttl = ttl_seconds
        self.store: Dict[str, Dict[str, Any]] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self.store:
            entry = self.store[key]
            if time.time() - entry['timestamp'] < self.ttl:
                return entry['data']
            else:
                del self.store[key]
        return None

    def set(self, key: str, data: Any):
        self.store[key] = {
            'timestamp': time.time(),
            'data': data
        }


# ─── Cliente ──────────────────────────────────────────────────────────────────

class DivinePrideClient:
    """
    Cliente HTTP para a API pública do Divine Pride.

    Uso:
        client = DivinePrideClient()
        raw = client.fetch_item(501, api_key="sua-chave", server="bRO", language="pt")
    """

    BASE_URL = "https://www.divine-pride.net/api/database"
    TIMEOUT  = 12  # segundos

    _BASE_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) rAthena-WebSDE/2.0",
        "Accept":     "application/json",
    }

    def __init__(self):
        self.cache = SimpleCache()

    # ── Helpers privados ──────────────────────────────────────────────────────

    def _build_url(self, endpoint: str, api_key: str) -> str:
        sep = "&" if "?" in endpoint else "?"
        return f"{self.BASE_URL}/{endpoint}{sep}apiKey={api_key}"

    def _get(self, endpoint: str, api_key: str, server: Optional[str] = None, language: Optional[str] = None) -> dict:
        """
        Executa um GET na URL montada e retorna o JSON parseado.
        Utiliza cache para evitar chamadas repetidas e tratar limit rate da API.
        """
        cache_key = f"{endpoint}_{server}_{language}"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return cached_data

        url = self._build_url(endpoint, api_key)
        
        headers = self._BASE_HEADERS.copy()
        if server:
            headers["x-server"] = server
        if language:
            headers["Accept-Language"] = language

        req = urllib.request.Request(url, headers=headers)

        try:
            with urllib.request.urlopen(req, timeout=self.TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self.cache.set(cache_key, data)
                return data

        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", 5))
                raise DPRateLimitException(retry_after)
            if e.code == 404:
                raise DPNotFoundException(f"Recurso não encontrado no DivinePride (404): {endpoint}")
            if e.code in (401, 403):
                raise DPAuthException("Chave de API do DivinePride inválida ou sem permissão.")
            raise DPHTTPException(e.code, f"Erro HTTP {e.code} do DivinePride.")

        except urllib.error.URLError as e:
            raise DPNetworkException(f"Falha de rede ao comunicar com DivinePride: {e.reason}")

        except Exception as e:
            raise DPNetworkException(f"Erro inesperado ao comunicar com DivinePride: {e}")

    # ── Métodos Públicos ──────────────────────────────────────────────────────

    def fetch_item(self, item_id: int, api_key: str, server: Optional[str] = None, language: Optional[str] = None) -> dict:
        """Busca um item pelo ID e retorna o JSON bruto do Divine Pride."""
        return self._get(f"Item/{item_id}", api_key, server, language)

    def fetch_monster(self, mob_id: int, api_key: str, server: Optional[str] = None, language: Optional[str] = None) -> dict:
        """Busca um monstro pelo ID e retorna o JSON bruto do Divine Pride."""
        return self._get(f"Monster/{mob_id}", api_key, server, language)

    def fetch_skill(self, skill_id: int, api_key: str, server: Optional[str] = None, language: Optional[str] = None) -> dict:
        """Busca uma skill pelo ID e retorna o JSON bruto do Divine Pride."""
        return self._get(f"Skill/{skill_id}", api_key, server, language)

    def fetch_quest(self, quest_id: int, api_key: str, server: Optional[str] = None, language: Optional[str] = None) -> dict:
        """Busca uma quest pelo ID e retorna o JSON bruto do Divine Pride."""
        return self._get(f"Quest/{quest_id}", api_key, server, language)

    def fetch_efst(self, efst_id: int, api_key: str, server: Optional[str] = None, language: Optional[str] = None) -> dict:
        """Busca um status effect (efst) pelo ID e retorna o JSON bruto."""
        return self._get(f"Efst/{efst_id}", api_key, server, language)

    def fetch_experience(self, api_key: str, server: Optional[str] = None, language: Optional[str] = None) -> dict:
        """Busca a tabela de experiência e retorna o JSON bruto do Divine Pride."""
        return self._get("Experience", api_key, server, language)


# ─── Singleton global ─────────────────────────────────────────────────────────
dp_client = DivinePrideClient()
