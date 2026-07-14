"""
Shop Parser Service — Reads rAthena NPC script files and builds an in-memory
mapping of Item ID -> List of Shop NPCs (Map, X, Y, NPC Name, Sprite ID).

Zero-Regression: Runs asynchronously/in background without blocking item_db parsing.
"""

import os
import re
import threading
from typing import Dict, List, Union, Optional


class ShopParserService:
    def __init__(self):
        self._lock = threading.Lock()
        # Mapeia tanto o id (int) quanto o aegis_name/id (str lowercase) para a lista de lojas
        self.sold_by_map: Dict[Union[int, str], List[dict]] = {}
        self.is_loaded: bool = False
        self.is_loading: bool = False

    def _resolve_rathena_root(self) -> str:
        from app.core.config import get_rathena_root
        return get_rathena_root()

    def load_async(self):
        """Dispara o carregamento em uma thread em background para não bloquear o boot/reload."""
        with self._lock:
            if self.is_loading:
                return
            self.is_loading = True
        
        def _task():
            try:
                self.load_sync()
            except Exception as e:
                print(f"[ShopParserService] Erro ao carregar shops: {e}")
            finally:
                with self._lock:
                    self.is_loading = False
        
        threading.Thread(target=_task, daemon=True).start()

    def load_sync(self):
        """Lê os arquivos .txt da pasta npc/ e constrói o índice em memória."""
        root = self._resolve_rathena_root()
        if not root or not os.path.exists(root):
            return

        npc_dir = os.path.join(root, "npc")
        if not os.path.exists(npc_dir):
            return

        new_map: Dict[Union[int, str], List[dict]] = {}
        shop_types = ("shop", "cashshop", "itemshop", "pointshop", "marketshop")

        for dirpath, _, filenames in os.walk(npc_dir):
            for fname in filenames:
                if not fname.endswith(".txt"):
                    continue
                filepath = os.path.join(dirpath, fname)
                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                        for line in f:
                            line_stripped = line.strip()
                            if not line_stripped or line_stripped.startswith("//"):
                                continue
                            if not any(f"\t{st}\t" in line_stripped or f" {st} " in line_stripped or f"\t{st} " in line_stripped or f" {st}\t" in line_stripped for st in shop_types):
                                continue

                            self._parse_shop_line(line_stripped, new_map, fname)
                except Exception:
                    continue

        with self._lock:
            self.sold_by_map = new_map
            self.is_loaded = True

        print(f"[ShopParserService] Mapeamento de lojas concluído. {len(new_map)} itens indexados.")

    def _parse_shop_line(self, line: str, target_map: Dict[Union[int, str], List[dict]], source_file: str):
        parts = re.split(r'\t+', line)
        if len(parts) < 4:
            return

        location_str = parts[0].strip()
        shop_type = parts[1].strip().lower()
        if shop_type not in ("shop", "cashshop", "itemshop", "pointshop", "marketshop"):
            return

        npc_full_name = parts[2].strip()
        npc_display_name = npc_full_name.split('#')[0].split('::')[0].strip()
        items_def = parts[3].strip()

        loc_parts = location_str.split(',')
        map_name = loc_parts[0].strip() if len(loc_parts) > 0 else "-"
        x = int(loc_parts[1]) if len(loc_parts) > 1 and loc_parts[1].strip().lstrip('-').isdigit() else 0
        y = int(loc_parts[2]) if len(loc_parts) > 2 and loc_parts[2].strip().lstrip('-').isdigit() else 0

        tokens = [t.strip() for t in items_def.split(',') if t.strip()]
        if not tokens:
            return

        sprite_id = tokens[0]
        item_tokens = tokens[1:]

        shop_items = {}
        parsed_items = []
        for token in item_tokens:
            if not token or token.startswith("//"):
                continue
            item_parts = token.split(':')
            item_id_str = item_parts[0].strip()
            if not item_id_str:
                continue

            price = int(item_parts[1].strip()) if len(item_parts) > 1 and item_parts[1].strip().lstrip('-').isdigit() else -1
            if item_id_str.isdigit():
                shop_items[int(item_id_str)] = price
            else:
                shop_items[item_id_str] = price
            parsed_items.append((item_id_str, price))

        shop_base = {
            "map": map_name,
            "x": x,
            "y": y,
            "name": npc_display_name,
            "full_name": npc_full_name,
            "sprite_id": sprite_id,
            "shop_type": shop_type,
            "all_items": shop_items,
            "file": source_file
        }

        for item_id_str, price in parsed_items:
            entry = dict(shop_base)
            entry["price"] = price

            if item_id_str.isdigit():
                item_id_int = int(item_id_str)
                if item_id_int not in target_map:
                    target_map[item_id_int] = []
                target_map[item_id_int].append(entry)

            item_id_lower = item_id_str.lower()
            if item_id_lower not in target_map:
                target_map[item_id_lower] = []
            target_map[item_id_lower].append(entry)

    def get_sold_by(self, item_id: Union[int, str]) -> List[dict]:
        if not self.is_loaded and not self.is_loading:
            self.load_sync()
        with self._lock:
            if isinstance(item_id, int):
                if item_id in self.sold_by_map:
                    return self.sold_by_map[item_id]
                return self.sold_by_map.get(str(item_id).lower(), [])
            else:
                item_str = str(item_id).lower()
                if item_str in self.sold_by_map:
                    return self.sold_by_map[item_str]
                if item_str.isdigit():
                    return self.sold_by_map.get(int(item_str), [])
                return []


shop_service = ShopParserService()
