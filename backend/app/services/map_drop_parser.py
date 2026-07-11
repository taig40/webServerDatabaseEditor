import os
from io import StringIO
from ruamel.yaml import YAML
from typing import Any, Dict, List, Optional


class MapDropParser:
    """
    Parser para map_drops.yml do rAthena.

    Estrutura do arquivo:
      Header: { Type: MAP_DROP_DB, Version: 2 }
      Body:
        - Map: <nome_do_mapa>
          GlobalDrops:            # opcional
            - Index: <int>
              Item: <AegisName>
              Rate: <int>  # n/100000
              RandomOptionGroup: <str>  # opcional
          SpecificDrops:          # opcional
            - Monster: <AegisName>
              Drops:
                - Index: <int>
                  Item: <AegisName>
                  Rate: <int>
                  RandomOptionGroup: <str>  # opcional
    """

    def __init__(self):
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.indent(mapping=2, sequence=4, offset=2)

        self.file_path: str = ""
        self._raw_yaml = None

    # ─── Path Resolution ──────────────────────────────────────────────────────

    def _resolve_path(self) -> str:
        """Resolve o caminho do map_drops.yml a partir das variáveis de ambiente."""
        db_base = os.environ.get("SERVER_DB_BASE_PATH", "").strip()
        if not db_base:
            item_db = os.environ.get("ITEM_DB_PATH", "").strip()
            if item_db and "/re/" in item_db.replace("\\", "/"):
                db_base = item_db.replace("\\", "/").split("/re/")[0]
        if db_base:
            return os.path.join(db_base, "re", "map_drops.yml").replace("\\", "/")
        return ""

    def _resolve_rathena_root(self) -> str:
        """Resolve a raiz do rAthena para localizar npc/custom."""
        db_base = os.environ.get("SERVER_DB_BASE_PATH", "").strip()
        if not db_base:
            item_db = os.environ.get("ITEM_DB_PATH", "").strip()
            if item_db and "/re/" in item_db.replace("\\", "/"):
                db_base = item_db.replace("\\", "/").split("/re/")[0]
        if db_base:
            # db_base = .../rathena/db  →  root = .../rathena
            return os.path.dirname(db_base.rstrip("/")).replace("\\", "/")
        return ""

    # ─── Load ─────────────────────────────────────────────────────────────────

    def load(self) -> Dict[str, Any]:
        """Carrega e retorna o conteúdo de map_drops.yml como dict serializável."""
        self.file_path = self._resolve_path()
        if not self.file_path or not os.path.exists(self.file_path):
            return {"maps": [], "file_path": self.file_path or ""}

        with open(self.file_path, "r", encoding="utf-8") as f:
            self._raw_yaml = self.yaml.load(f)

        maps = []
        body = self._raw_yaml.get("Body", []) or []
        for entry in body:
            if not isinstance(entry, dict) or "Map" not in entry:
                continue
            map_entry: Dict[str, Any] = {"Map": entry["Map"]}

            # GlobalDrops
            gd = entry.get("GlobalDrops", []) or []
            map_entry["GlobalDrops"] = [
                {
                    "Index": d.get("Index", i),
                    "Item": d.get("Item", ""),
                    "Rate": d.get("Rate", 0),
                    "RandomOptionGroup": d.get("RandomOptionGroup", None),
                }
                for i, d in enumerate(gd)
                if isinstance(d, dict)
            ]

            # SpecificDrops
            sd = entry.get("SpecificDrops", []) or []
            map_entry["SpecificDrops"] = []
            for mob_entry in sd:
                if not isinstance(mob_entry, dict):
                    continue
                drops = mob_entry.get("Drops", []) or []
                map_entry["SpecificDrops"].append({
                    "Monster": mob_entry.get("Monster", ""),
                    "Drops": [
                        {
                            "Index": d.get("Index", i),
                            "Item": d.get("Item", ""),
                            "Rate": d.get("Rate", 0),
                            "RandomOptionGroup": d.get("RandomOptionGroup", None),
                        }
                        for i, d in enumerate(drops)
                        if isinstance(d, dict)
                    ],
                })

            maps.append(map_entry)

        return {"maps": maps, "file_path": self.file_path}

    # ─── Save ─────────────────────────────────────────────────────────────────

    def save(self, maps: List[Dict[str, Any]]) -> bool:
        """
        Recebe a lista de mapas do front-end e sobrescreve map_drops.yml,
        mantendo o Header original e preservando comentários do cabeçalho.
        """
        self.file_path = self._resolve_path()
        if not self.file_path:
            raise FileNotFoundError("Caminho de map_drops.yml não pôde ser resolvido.")

        # Garante que o diretório existe
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)

        # Recria a estrutura YAML
        body = []
        for m in maps:
            entry: Dict[str, Any] = {"Map": m["Map"]}

            gd = m.get("GlobalDrops", [])
            if gd:
                entry["GlobalDrops"] = []
                for i, d in enumerate(gd):
                    drop: Dict[str, Any] = {
                        "Index": d.get("Index", i),
                        "Item": d["Item"],
                        "Rate": d["Rate"],
                    }
                    if d.get("RandomOptionGroup"):
                        drop["RandomOptionGroup"] = d["RandomOptionGroup"]
                    entry["GlobalDrops"].append(drop)

            sd = m.get("SpecificDrops", [])
            if sd:
                entry["SpecificDrops"] = []
                for mob_entry in sd:
                    drops = mob_entry.get("Drops", [])
                    mob_block: Dict[str, Any] = {
                        "Monster": mob_entry["Monster"],
                        "Drops": [],
                    }
                    for i, d in enumerate(drops):
                        drop = {
                            "Index": d.get("Index", i),
                            "Item": d["Item"],
                            "Rate": d["Rate"],
                        }
                        if d.get("RandomOptionGroup"):
                            drop["RandomOptionGroup"] = d["RandomOptionGroup"]
                        mob_block["Drops"].append(drop)
                    entry["SpecificDrops"].append(mob_block)

            body.append(entry)

        # Monta documento final
        doc: Dict[str, Any] = {
            "Header": {"Type": "MAP_DROP_DB", "Version": 2},
            "Body": body,
        }

        out = StringIO()
        self.yaml.dump(doc, out)

        with open(self.file_path, "w", encoding="utf-8", newline="\n") as f:
            # Escreve cabeçalho de comentário padrão rAthena
            f.write(
                "# This file is part of the webServerDatabaseEditor output.\n"
                "# Format: rAthena Map Drop Database\n\n"
            )
            f.write(out.getvalue())

        return True

    # ─── Raw YAML Preview ────────────────────────────────────────────────────

    def to_yaml_preview(self, maps: List[Dict[str, Any]]) -> str:
        """Retorna uma representação YAML do payload para o painel Raw Code."""
        body = []
        for m in maps:
            entry: Dict[str, Any] = {"Map": m.get("Map", "")}
            gd = m.get("GlobalDrops", [])
            if gd:
                entry["GlobalDrops"] = [
                    {k: v for k, v in d.items() if v is not None and k != "RandomOptionGroup" or v}
                    for d in gd
                ]
            sd = m.get("SpecificDrops", [])
            if sd:
                entry["SpecificDrops"] = [
                    {
                        "Monster": s["Monster"],
                        "Drops": [
                            {k: v for k, v in d.items() if v is not None and k != "RandomOptionGroup" or v}
                            for d in s.get("Drops", [])
                        ],
                    }
                    for s in sd
                ]
            body.append(entry)
        out = StringIO()
        self.yaml.dump({"Body": body}, out)
        return out.getvalue()


# Singleton
map_drop_db = MapDropParser()
