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
from typing import Literal


# ─── Exceções tipadas ─────────────────────────────────────────────────────────

class DPException(Exception):
    """Classe base para erros do Divine Pride Client."""


class DPNotFoundException(DPException):
    """Recurso não encontrado no Divine Pride (HTTP 404)."""


class DPAuthException(DPException):
    """Chave de API inválida ou sem permissão (HTTP 401/403)."""


class DPNetworkException(DPException):
    """Falha de rede ou timeout ao comunicar com o Divine Pride."""


class DPHTTPException(DPException):
    """Erro HTTP genérico do Divine Pride."""
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        super().__init__(detail)


# ─── Cliente ──────────────────────────────────────────────────────────────────

class DivinePrideClient:
    """
    Cliente HTTP para a API pública do Divine Pride.

    Uso:
        client = DivinePrideClient()
        raw = client.fetch_item(501, api_key="sua-chave")
    """

    BASE_URL = "https://divine-pride.net/api/database"
    TIMEOUT  = 12  # segundos

    _HEADERS = {
        "User-Agent": "rAthena-WebSDE/2.0",
        "Accept":     "application/json",
    }

    # ── Helpers privados ──────────────────────────────────────────────────────

    def _build_url(self, endpoint: str, api_key: str) -> str:
        sep = "&" if "?" in endpoint else "?"
        return f"{self.BASE_URL}/{endpoint}{sep}apiKey={api_key}"

    def _get(self, endpoint: str, api_key: str) -> dict:
        """
        Executa um GET na URL montada e retorna o JSON parseado.

        Raises:
            DPNotFoundException: HTTP 404
            DPAuthException: HTTP 401 / 403
            DPHTTPException: outros erros HTTP
            DPNetworkException: timeout ou falha de conexão
        """
        url = self._build_url(endpoint, api_key)
        req = urllib.request.Request(url, headers=self._HEADERS)

        try:
            with urllib.request.urlopen(req, timeout=self.TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))

        except urllib.error.HTTPError as e:
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

    def fetch_item(self, item_id: int, api_key: str) -> dict:
        """Busca um item pelo ID e retorna o JSON bruto do Divine Pride."""
        return self._get(f"Item/{item_id}", api_key)

    def fetch_monster(self, mob_id: int, api_key: str) -> dict:
        """Busca um monstro pelo ID e retorna o JSON bruto do Divine Pride."""
        return self._get(f"Monster/{mob_id}", api_key)

    def fetch_skill(self, skill_id: int, api_key: str) -> dict:
        """Busca uma skill pelo ID e retorna o JSON bruto do Divine Pride."""
        return self._get(f"Skill/{skill_id}", api_key)

    def fetch_experience(self, api_key: str) -> dict:
        """Busca a tabela de experiência e retorna o JSON bruto do Divine Pride."""
        return self._get("Experience", api_key)


# ─── Singleton global ─────────────────────────────────────────────────────────
dp_client = DivinePrideClient()
