from ruamel.yaml import YAML
from ruamel.yaml.scalarstring import LiteralScalarString
import os
import threading
from app.services.load_progress import progress_tracker

class YamlDatabase:
    """In-memory store for ``item_db.yml`` data, loaded recursively following YAML Import headers.

    Maintains a ``db_cache`` (filepath → parsed YAML) and an ``item_index`` (item_id → filepath)
    for O(1) lookups.  An inverted ``id_to_aegisname`` index enables fast AegisName resolution for
    the Divine Pride adapter without additional HTTP calls.

    All mutations write back to the owning YAML file via ``ruamel.yaml`` so comments and formatting
    are preserved.  Loading is performed asynchronously via ``load_db_async``.
    """

    def __init__(self):
        # RLock prevents parallel threads from corrupting the shared ruamel.yaml instance
        self.lock = threading.RLock()

        # Main parser: preserves formatting, accepts duplicate keys (last value wins)
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.allow_duplicate_keys = True
        self.yaml.indent(mapping=2, sequence=4, offset=2)

        # Strict auxiliary parser: used only to detect duplicate keys during validation
        self._yaml_strict = YAML()
        self._yaml_strict.preserve_quotes = True
        self._yaml_strict.allow_duplicate_keys = False

        # filepath → parsed YAML document
        self.db_cache = {}

        # item_id → filepath of the file containing this item
        self.item_index = {}

        self.rathena_root = ""

        # Flat list cache for fast repeated reads
        self.cached_items_list = None

        # Inverted Id → AegisName index for O(1) lookups (Divine Pride Adapter)
        self.id_to_aegisname: dict = {}

        # Async loading state flags
        self.is_loading = False
        self.loading_status = "Aguardando inicialização..."
        self.items_loaded = 0

    def load_db_async(self, main_filepath: str):
        """Starts the YAML loading process in a background daemon thread.

        No-ops if loading is already in progress.

        Args:
            main_filepath: Absolute path to the main ``item_db.yml`` entry point.
        """
        if self.is_loading:
            return
            
        self.is_loading = True
        self.items_loaded = 0
        self.loading_status = "Iniciando engine de parse YAML..."
        progress_tracker.start_loading(initial_db="item_db.yml", status=self.loading_status)
        
        thread = threading.Thread(target=self._load_db_sync, args=(main_filepath,))
        thread.daemon = True
        thread.start()

    def _load_db_sync(self, main_filepath: str):
        """Background thread target: calls ``load_db`` and rebuilds the flat item cache.

        Updates ``loading_status`` and ``is_loading`` on completion or error.

        Args:
            main_filepath: Absolute path to the main ``item_db.yml`` entry point.
        """
        try:
            self.load_db(main_filepath)
            self.rebuild_cache()
            progress_tracker.update(progress=50.0, current_db="item_db.yml", status="Banco de itens carregado na memória.")
        except Exception as e:
            print(f"[!] Erro fatal no carregamento background: {e}")
            self.loading_status = f"Erro: {e}"
            progress_tracker.update(status=f"Erro em itens: {e}")
        finally:
            self.is_loading = False
            if "Erro" not in self.loading_status:
                self.loading_status = "Carregamento Finalizado."

    def load_db(self, main_filepath: str):
        """Loads the main item_db entry point and recursively resolves Footer imports.

        Deduces the rAthena root from the filepath structure.  Always forces a load of
        ``db/import/item_db.yml`` even when not listed in the Footer imports.

        Args:
            main_filepath: Absolute path to the main ``item_db.yml`` file.
        """
        with self.lock:
            main_filepath = main_filepath.replace("\\", "/")
            if not os.path.exists(main_filepath):
                self.loading_status = f"Arquivo não encontrado: {main_filepath}"
                print(f"[!] {self.loading_status}")
                return

            # Deduce the rAthena root from the path structure
            path_parts = main_filepath.split("/")
            if 'db' in path_parts:
                db_index = path_parts.index('db')
                self.rathena_root = "/".join(path_parts[:db_index])
            else:
                from app.core.config import get_rathena_root
                self.rathena_root = get_rathena_root() or os.path.dirname(os.path.dirname(main_filepath))

            print(f"[*] rAthena Root deduzido: {self.rathena_root}")
            self._load_file(main_filepath)

            # Always load the custom override file, even if missing from Footer imports
            custom_import_path = f"{self.rathena_root}/db/import/item_db.yml".replace('\\', '/')
            if os.path.exists(custom_import_path) and custom_import_path not in self.db_cache:
                print(f"[*] Forçando carregamento do arquivo customizado: {custom_import_path}")
                self._load_file(custom_import_path)

    def _load_file(self, filepath: str):
        """Recursively loads a YAML file, indexes its items, and follows Footer imports.

        Uses the binary cache manager (``load_yaml_with_cache``) for faster repeated loads.
        No-ops if the file does not exist or is already in the cache.

        Args:
            filepath: Absolute path to the YAML file to load.
        """
        if not os.path.exists(filepath):
            print(f"[!] Aviso: Import não encontrado no disco: {filepath}")
            return

        if filepath in self.db_cache:
            return

        filename = os.path.basename(filepath)
        self.loading_status = f"Lendo arquivo: {filename}..."
        progress_tracker.update(current_db=filename, status=self.loading_status, progress=min(45.0, progress_tracker.progress + 5.0))

        try:
            from app.core.cache_manager import load_yaml_with_cache
            data = load_yaml_with_cache(filepath, self.yaml)

            self.db_cache[filepath] = data

            count = 0
            if data and 'Body' in data and isinstance(data['Body'], list):
                for item in data['Body']:
                    if isinstance(item, dict):
                        self._normalize_scripts(item)
                    if 'Id' in item:
                        self.item_index[item['Id']] = filepath
                        count += 1
                        self.items_loaded += 1

            print(f"[*] {count} itens carregados de: {filename}")

            # Follow Footer → Imports to load referenced files recursively
            if data and 'Footer' in data and 'Imports' in data['Footer']:
                for imp in data['Footer']['Imports']:
                    if 'Path' in imp:
                        import_rel_path = imp['Path'].replace('\\', '/')
                        import_abs_path = f"{self.rathena_root}/{import_rel_path}"
                        self._load_file(import_abs_path)

        except Exception as e:
            print(f"[!] Falha ao fazer parse de {filepath}: {e}")

    def rebuild_cache(self):
        """Rebuilds the flat ``cached_items_list`` and ``id_to_aegisname`` index from all cached documents.

        Annotates each item with ``_source`` (``"custom"`` or ``"rathena"``) based on whether its
        file lives under ``db/import/``.  Result is sorted by ``Id``.
        """
        all_items = []
        for filepath, data in self.db_cache.items():
            if data and 'Body' in data and isinstance(data['Body'], list):
                norm_path = filepath.replace('\\', '/')
                is_custom = '/db/import/' in norm_path
                for item in data['Body']:
                    annotated = dict(item)
                    annotated['_source'] = 'custom' if is_custom else 'rathena'
                    all_items.append(annotated)
        all_items.sort(key=lambda x: x.get('Id', 0))
        self.cached_items_list = all_items
        # Rebuild the inverted Id → AegisName index alongside the main cache
        self.id_to_aegisname = {
            item.get('Id'): item.get('AegisName')
            for item in all_items
            if item.get('Id') is not None and item.get('AegisName')
        }

    def get_aegisname_by_id(self, item_id: int) -> 'Optional[str]':
        """O(1) AegisName lookup by numeric item ID.

        Used by the Divine Pride Adapter to translate item drops without
        making additional HTTP requests.

        Args:
            item_id: Numeric rAthena item ID.

        Returns:
            str | None: The AegisName string, or ``None`` if not found.
        """
        if self.cached_items_list is None:
            self.rebuild_cache()
        return self.id_to_aegisname.get(item_id)

    def get_items(self):
        """Returns the flat list of all items, rebuilding the cache if necessary.

        Returns:
            list: All item entries from all loaded YAML files, sorted by ``Id``.
        """
        if self.cached_items_list is None:
            self.rebuild_cache()
        return self.cached_items_list

    def search_items(
        self,
        page: int = 1,
        limit: int = 50,
        search: str = "",
        source: str = "",
        skip: int = None,
        search_query: str = "",
        search_target: str = "name",
        item_type: str = ""
    ):
        """Filters and paginates the item list with multi-target search support.

        Filter priority:
        1. ``source`` filter (``"rathena"`` / ``"custom"``).
        2. ``item_type`` filter (matched against the ``Type`` field).
        3. Text search via ``search_query`` / ``search`` against ``search_target``
           (``"name"`` or ``"script"``).  Legacy ``[script]:`` prefix is also supported.

        Args:
            page: 1-based page number (ignored if ``skip`` is provided).
            limit: Maximum entries per page.
            search: Fallback search string (superseded by ``search_query``).
            source: Optional source filter (``"rathena"`` or ``"custom"``).
            skip: If provided, overrides ``page`` as the start offset.
            search_query: Primary search string.
            search_target: Search mode — ``"name"`` or ``"script"``.
            item_type: Optional ``Type`` field filter.

        Returns:
            tuple: ``(paginated_list, total_count)``.
        """
        items = self.get_items()
        filtered = items

        # 1. Source filter
        if source and source in ('rathena', 'custom'):
            filtered = [i for i in filtered if i.get('_source') == source]

        # 2. Item type filter
        if item_type and item_type.strip() and item_type.strip().lower() not in ('all', 'todos', ''):
            target_type = item_type.strip().lower()
            filtered = [i for i in filtered if str(i.get('Type', '')).lower() == target_type]

        # 3. Text search: effective_query resolved from search_query or search
        effective_query = (search_query or search).strip().lower()
        if effective_query:
            # Support legacy [script]: prefix when search_target is not explicitly set
            if effective_query.startswith('[script]'):
                search_target = "script"
                effective_query = effective_query[8:].strip()
                if effective_query.startswith(':'):
                    effective_query = effective_query[1:].strip()

            if (search_target or "").lower() == "script":
                filtered = [
                    i for i in filtered
                    if (i.get('Script') and effective_query in str(i.get('Script')).lower())
                    or (i.get('EquipScript') and effective_query in str(i.get('EquipScript')).lower())
                    or (i.get('OnEquipScript') and effective_query in str(i.get('OnEquipScript')).lower())
                    or (i.get('UnequipScript') and effective_query in str(i.get('UnequipScript')).lower())
                    or (i.get('OnUnequipScript') and effective_query in str(i.get('OnUnequipScript')).lower())
                ]
            else:  # default: "name" (ID, Name, AegisName or identifiedDisplayName)
                filtered = [
                    i for i in filtered
                    if effective_query in str(i.get('Id', ''))
                    or (i.get('Name') and effective_query in str(i.get('Name')).lower())
                    or (i.get('AegisName') and effective_query in str(i.get('AegisName')).lower())
                    or (i.get('identifiedDisplayName') and effective_query in str(i.get('identifiedDisplayName')).lower())
                ]

        total_count = len(filtered)
        if skip is not None:
            start = skip
        else:
            start = max(0, (page - 1) * limit)
        end = start + limit
        paginated = filtered[start:end]
        return paginated, total_count

    def get_item(self, item_id: int):
        if self.cached_items_list is None:
            self.rebuild_cache()
            
        if item_id not in self.item_index:
            return None
        target_filepath = self.item_index[item_id]
        data = self.db_cache[target_filepath]
        for item in data.get('Body', []):
            if item.get('Id') == item_id:
                return item
        return None

    def _wrap_scripts_for_dump(self, obj):
        """Converts multiline script strings to ``LiteralScalarString`` so ruamel.yaml uses block-style pipe (``|``).

        Traverses the object tree recursively.  Called temporarily before ``yaml.dump()`` —
        ``LiteralScalarString`` is a ``str`` subclass so in-memory objects are unaffected.

        Args:
            obj: Any Python dict or list (in-place mutation).
        """
        SCRIPT_KEYS = {'Script', 'EquipScript', 'UnEquipScript', 'OnEquipScript', 'OnUnequipScript'}
        if isinstance(obj, dict):
            for key in list(obj.keys()):
                val = obj[key]
                if key in SCRIPT_KEYS and isinstance(val, str) and val.strip():
                    # Ensure trailing newline required by YAML block scalar
                    normalized = val if val.endswith('\n') else val + '\n'
                    obj[key] = LiteralScalarString(normalized)
                else:
                    self._wrap_scripts_for_dump(val)
        elif isinstance(obj, list):
            for item in obj:
                self._wrap_scripts_for_dump(item)

    def sanitize_item_for_yaml(self, item: dict) -> dict:
        """Sanitizes item data before YAML serialization.

        Enforces rAthena's strict field rules so the map-server does not report
        warnings.  Main corrections applied:

        1. **EquipLevel** normalization: collapses ``{Min, Max}`` dicts into scalars
           when ``Max == 0`` or ``Max < Min``; removes when both are zero.
        2. **ArmorLevel** enforcement: sets to ``1`` when ``Type`` is ``Armor``;
           removes from non-armor items.
        3. **WeaponLevel** enforcement: sets to ``1`` when ``Type`` is ``Weapon``;
           removes from non-weapon items.
        4. **Zero-default cleanup**: removes numeric fields whose value matches
           the rAthena engine default (to keep YAML minimal).

        Args:
            item: Mutable item dict (modified in place and returned).

        Returns:
            dict: The sanitized item dict.
        """
        if not isinstance(item, dict):
            return item

        # 1. Correção do EquipLevel (Evitar Max < Min e { Min: X, Max: 0 })
        if "EquipLevelMin" in item or "EquipLevelMax" in item:
            min_val = item.pop("EquipLevelMin", None)
            max_val = item.pop("EquipLevelMax", None)
            if "EquipLevel" not in item and (min_val is not None or max_val is not None):
                min_int = min_val if (isinstance(min_val, int) and min_val > 0) else 0
                max_int = max_val if (isinstance(max_val, int) and max_val > 0) else 0
                if min_int > 0 and max_int == 0:
                    item["EquipLevel"] = min_int
                elif min_int > 0 and max_int > 0:
                    if min_int == max_int:
                        item["EquipLevel"] = min_int
                    elif max_int > min_int:
                        item["EquipLevel"] = {"Min": min_int, "Max": max_int}
                    else:
                        item["EquipLevel"] = min_int

        if "EquipLevel" in item:
            eq = item["EquipLevel"]
            if isinstance(eq, dict):
                min_val = eq.get("Min", 0) or 0
                max_val = eq.get("Max", 0) or 0
                if min_val > 0 and (max_val == 0 or max_val < min_val):
                    # Se Min > 0 e Max == 0 (ou ausente/menor que Min), converte o EquipLevel inteiro
                    # para um valor numérico simples (apenas o valor de Min), conforme especificação do rAthena
                    item["EquipLevel"] = min_val
                elif min_val == 0 and max_val == 0:
                    item.pop("EquipLevel", None)
                elif max_val == 0:
                    eq.pop("Max", None)
                    if not eq or eq.get("Min", 0) <= 0:
                        item.pop("EquipLevel", None)
                    elif len(eq) == 1 and "Min" in eq:
                        item["EquipLevel"] = eq["Min"]
            elif eq == 0 or eq is None:
                item.pop("EquipLevel", None)

        # 2. Correção do ArmorLevel (Obrigatório para Type: Armor)
        item_type = item.get("Type")
        if item_type == "Armor" or item_type == 4 or item_type == "IT_ARMOR":
            armor_lvl = item.get("ArmorLevel")
            if armor_lvl is None or armor_lvl == 0 or armor_lvl == "0" or armor_lvl == "":
                item["ArmorLevel"] = 1
        elif item_type is not None and item_type != "Armor" and item_type != 4:
            if item.get("ArmorLevel") in (0, 1, None):
                item.pop("ArmorLevel", None)

        # Limpeza do WeaponLevel para armas
        if item_type == "Weapon" or item_type == 5 or item_type == "IT_WEAPON":
            w_lvl = item.get("WeaponLevel")
            if w_lvl is None or w_lvl == 0 or w_lvl == "0" or w_lvl == "":
                item["WeaponLevel"] = 1
        elif item_type is not None and item_type != "Weapon" and item_type != 5:
            if item.get("WeaponLevel") in (0, None):
                item.pop("WeaponLevel", None)

        # 3. Remover campos com valor None ou 0 indesejados para manter YAML limpo
        zero_defaults_to_clean = {
            "Buy": 0,
            "Sell": 0,
            "Weight": 0,
            "Attack": 0,
            "MagicAttack": 0,
            "Defense": 0,
            "Range": 0,
            "Slots": 0,
            "View": 0,
            "SubType": 0,
            "EquipLevelMin": 0,
            "EquipLevelMax": 0,
        }
        keys_to_remove = []
        for k, v in item.items():
            if k in ("Id", "_source"):
                continue
            if v is None:
                keys_to_remove.append(k)
            elif k in zero_defaults_to_clean and v == zero_defaults_to_clean[k]:
                keys_to_remove.append(k)
            elif isinstance(v, dict) and len(v) == 0:
                keys_to_remove.append(k)
            elif isinstance(v, (list, tuple)) and len(v) == 0:
                keys_to_remove.append(k)

        for k in keys_to_remove:
            item.pop(k, None)

        return item

    def save_file(self, filepath: str):
        with self.lock:
            if filepath not in self.db_cache:
                return False
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            
            # Temporarily strip metadata keys (starting with '_') from the cached data before dumping
            removed_keys = []
            
            def strip_metadata(obj):
                if isinstance(obj, dict):
                    to_remove = [k for k in obj.keys() if isinstance(k, str) and k.startswith('_')]
                    for k in to_remove:
                        removed_keys.append((obj, k, obj[k]))
                        del obj[k]
                    for v in obj.values():
                        strip_metadata(v)
                elif isinstance(obj, list):
                    for item in obj:
                        strip_metadata(item)
                        
            data = self.db_cache[filepath]
            if isinstance(data, dict) and 'Body' in data and isinstance(data['Body'], list):
                for i, item in enumerate(data['Body']):
                    if isinstance(item, dict):
                        data['Body'][i] = self.sanitize_item_for_yaml(item)
            strip_metadata(data)
            # Converte scripts para LiteralScalarString antes do dump → pipe | no YAML
            self._wrap_scripts_for_dump(data)
            
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    self.yaml.dump(data, f)
            finally:
                # Restore the keys back to their original dictionary objects
                for obj, k, val in removed_keys:
                    obj[k] = val
                    
            return True


    def _normalize_scripts(self, data: dict):
        for sk in ['Script', 'EquipScript', 'UnEquipScript']:
            if sk in data:
                val = data[sk]
                if isinstance(val, dict):
                    data[sk] = val.get('Script', '')
                elif val is None:
                    data.pop(sk, None)
        return data

    def update_item(self, item_id: int, updated_data: dict, save_mode: str = 'import'):
        with self.lock:
            if item_id not in self.item_index:
                return None

            self._normalize_scripts(updated_data)
            target_filepath = self.item_index[item_id]
            norm_path = target_filepath.replace('\\', '/')
            import_db_path = f"{self.rathena_root}/db/import/item_db.yml".replace('\\', '/')

            # --- If the item lives in the original rAthena db AND user wants to copy to import ---
            if '/db/import/' not in norm_path and save_mode != 'overwrite':
                # Read the full current item from the original file
                original_data = self.db_cache[target_filepath]
                original_item = None
                for item in original_data.get('Body', []):
                    if item.get('Id') == item_id:
                        original_item = item
                        break
                if original_item is None:
                    return None

                # Build a plain dict copy with the updates applied
                override_item = dict(original_item)
                override_item.update(updated_data)
                override_item.pop('_source', None)
                override_item = self.sanitize_item_for_yaml(override_item)

                # Ensure the import file is loaded in cache
                if import_db_path not in self.db_cache:
                    if os.path.exists(import_db_path):
                        self._load_file(import_db_path)
                    else:
                        os.makedirs(os.path.dirname(import_db_path), exist_ok=True)
                        self.db_cache[import_db_path] = {'Header': {'Type': 'ITEM_DB', 'Version': 4}, 'Body': []}

                import_data = self.db_cache[import_db_path]
                if 'Body' not in import_data or not isinstance(import_data['Body'], list):
                    import_data['Body'] = []

                # Check if an override already exists for this ID in the import file
                existing_override = None
                for item in import_data['Body']:
                    if item.get('Id') == item_id:
                        existing_override = item
                        break

                if existing_override is not None:
                    for key, value in updated_data.items():
                        existing_override[key] = value
                    existing_override = self.sanitize_item_for_yaml(existing_override)
                    saved_item = dict(existing_override)
                else:
                    override_item = self.sanitize_item_for_yaml(override_item)
                    import_data['Body'].insert(0, override_item)
                    saved_item = override_item

                self.save_file(import_db_path)
                self.item_index[item_id] = import_db_path
                saved_item['_source'] = 'custom'
                self.rebuild_cache()
                return saved_item

            # --- Item already lives in db/import/ OR user requested overwrite in original rAthena file ---
            data = self.db_cache[target_filepath]
            for i, item in enumerate(data.get('Body', [])):
                if item.get('Id') == item_id:
                    for key, value in updated_data.items():
                        item[key] = value
                    item.pop('_source', None)
                    data['Body'][i] = self.sanitize_item_for_yaml(item)
                    self.save_file(target_filepath)
                    result = dict(data['Body'][i])
                    result['_source'] = 'custom' if '/db/import/' in norm_path else 'rathena'
                    self.rebuild_cache()
                    return result
            return None

    def _apply_item_defaults(self, item_data: dict) -> dict:
        """
        Initializes any missing item fields with default values according to the rAthena YAML specification.
        """
        item = dict(item_data)

        # Type default
        if "Type" not in item or not item["Type"]:
            item["Type"] = "Etc"

        item_type = item["Type"]

        # Type-dependent weapon/armor levels
        if item_type == "Weapon" and ("WeaponLevel" not in item or item["WeaponLevel"] is None):
            item["WeaponLevel"] = 1
        elif item_type == "Armor" and ("ArmorLevel" not in item or item["ArmorLevel"] is None):
            item["ArmorLevel"] = 1

        # Buy & Sell calculation
        if "Buy" in item and ("Sell" not in item or item["Sell"] is None):
            item["Sell"] = item["Buy"] // 2
        elif "Sell" in item and ("Buy" not in item or item["Buy"] is None):
            item["Buy"] = item["Sell"] * 2

        # Standard rAthena default values
        defaults = {
            "SubType": 0,
            "Buy": 0,
            "Sell": 0,
            "Weight": 0,
            "Attack": 0,
            "MagicAttack": 0,
            "Defense": 0,
            "Range": 0,
            "Slots": 0,
            "Jobs": {"All": True},
            "Classes": {"All": True},
            "Gender": "Both",
            "EquipLevelMin": 0,
            "EquipLevelMax": 0,
            "Refineable": False,
            "Gradable": False,
            "View": 0,
        }

        for key, val in defaults.items():
            if key not in item or item[key] is None:
                item[key] = val

        return item

    def add_custom_item(self, item_data: dict):
        with self.lock:
            import_db_path = f"{self.rathena_root}/db/import/item_db.yml".replace("\\", "/")

            if import_db_path not in self.db_cache:
                if not os.path.exists(import_db_path):
                    os.makedirs(os.path.dirname(import_db_path), exist_ok=True)
                    self.db_cache[import_db_path] = {'Header': {'Type': 'ITEM_DB', 'Version': 4}, 'Body': []}
                else:
                    self._load_file(import_db_path)

            data = self.db_cache.get(import_db_path)
            if data is None:
                data = {'Header': {'Type': 'ITEM_DB', 'Version': 4}, 'Body': []}
                self.db_cache[import_db_path] = data

            if 'Body' not in data or not isinstance(data['Body'], list):
                data['Body'] = []

            item_with_defaults = self._apply_item_defaults(item_data)
            self._normalize_scripts(item_with_defaults)
            clean_item = {k: v for k, v in item_with_defaults.items() if k != '_source'}
            clean_item = self.sanitize_item_for_yaml(clean_item)
            data['Body'].insert(0, clean_item)
            self.save_file(import_db_path)
            self.item_index[clean_item['Id']] = import_db_path

            result = dict(clean_item)
            result['_source'] = 'custom'
            self.rebuild_cache()
            return result

    def delete_item(self, item_id: int) -> bool:
        """
        Remove permanentemente um item do arquivo YAML em que reside.

        Guard de Segurança (SRP):
        - Apenas itens que vivem em db/import/ podem ser excluídos.
        - Itens do banco oficial do rAthena (db/re/ ou db/pre-re/) lançam
          PermissionError que a rota da API converte em HTTP 403.

        Retorna True em caso de sucesso, False se o item não foi encontrado.
        """
        with self.lock:
            if item_id not in self.item_index:
                return False

            filepath = self.item_index[item_id]
            norm_path = filepath.replace('\\', '/')

            if '/db/import/' not in norm_path:
                raise PermissionError(
                    f"O item {item_id} reside em '{norm_path}' que faz parte do banco "
                    "oficial do rAthena. Somente itens em db/import/ podem ser excluídos."
                )

            data = self.db_cache.get(filepath)
            if not data:
                return False

            body = data.get('Body', [])
            original_len = len(body)

            # Remove o nó cujo Id corresponde — ruamel.yaml preserva objetos de comentários nos demais
            data['Body'] = [item for item in body if item.get('Id') != item_id]

            if len(data['Body']) == original_len:
                # ID estava no índice mas não no Body — estado inconsistente, corrige silenciosamente
                del self.item_index[item_id]
                return False

            self.save_file(filepath)
            del self.item_index[item_id]
            self.cached_items_list = None   # Invalida o cache para a listagem refletir a remoção
            return True


# Singleton global
yaml_db = YamlDatabase()
