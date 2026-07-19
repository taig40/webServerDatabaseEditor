from ruamel.yaml import YAML
from ruamel.yaml.scalarstring import LiteralScalarString
import os
import threading
from app.services.load_progress import progress_tracker

class MobDatabase:
    """In-memory store for ``mob_db.yml`` data, loaded recursively following YAML Import headers.

    Maintains a ``db_cache`` (filepath → parsed YAML) and a ``mob_index`` (mob_id → filepath)
    for O(1) lookups.  All mutations write back to the owning YAML file via ``ruamel.yaml``
    so comments are preserved.

    Loading is performed asynchronously via ``load_db_async`` to avoid blocking the API.
    Use ``is_loading`` / ``loading_status`` to poll readiness.
    """

    def __init__(self):
        # RLock prevents parallel threads from corrupting the shared ruamel.yaml instance
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.allow_duplicate_keys = True
        self.yaml.indent(mapping=2, sequence=4, offset=2)

        # filepath → parsed YAML document
        self.db_cache = {}

        # mob_id → filepath of the file containing this mob
        self.mob_index = {}

        self.rathena_root = ""

        # Flat list cache for fast repeated reads
        self.cached_mobs_list = None

        # Async loading state flags
        self.is_loading = False
        self.loading_status = "Aguardando inicialização..."
        self.mobs_loaded = 0

    def load_db_async(self, main_filepath: str):
        """Starts the YAML loading process in a background daemon thread.

        No-ops if loading is already in progress.

        Args:
            main_filepath: Absolute path to the main ``mob_db.yml`` file.
        """
        if self.is_loading:
            return

        self.is_loading = True
        self.mobs_loaded = 0
        self.loading_status = "Iniciando engine de parse de monstros YAML..."
        progress_tracker.update(current_db="mob_db.yml", status=self.loading_status, progress=50.0)

        thread = threading.Thread(target=self._load_db_sync, args=(main_filepath,))
        thread.daemon = True
        thread.start()

    def _load_db_sync(self, main_filepath: str):
        """Background thread target: calls ``load_db`` and rebuilds the flat mob cache.

        Updates ``loading_status`` and ``is_loading`` on completion or error.

        Args:
            main_filepath: Absolute path to the main ``mob_db.yml`` file.
        """
        try:
            self.load_db(main_filepath)
            self.rebuild_cache()
            progress_tracker.finish_loading(status="Carregamento Finalizado.")
        except Exception as e:
            print(f"[!] Erro fatal no carregamento background de monstros: {e}")
            self.loading_status = f"Erro: {e}"
            progress_tracker.update(status=f"Erro em monstros: {e}")
        finally:
            self.is_loading = False
            if "Erro" not in self.loading_status:
                self.loading_status = "Carregamento Finalizado."

    def load_db(self, main_filepath: str):
        """Loads the main mob_db entry point and recursively resolves Footer imports.

        Deduces the rAthena root from the filepath structure.  Always forces a load of
        ``db/import/mob_db.yml`` even when not listed in the Footer imports.

        Args:
            main_filepath: Absolute path to the main ``mob_db.yml`` file.
        """
        main_filepath = main_filepath.replace("\\", "/")
        if not os.path.exists(main_filepath):
            self.loading_status = f"Arquivo não encontrado: {main_filepath}"
            print(f"[!] {self.loading_status}")
            return

        path_parts = main_filepath.split("/")
        if 'db' in path_parts:
            db_index = path_parts.index('db')
            self.rathena_root = "/".join(path_parts[:db_index])
        else:
            from app.core.config import get_rathena_root
            self.rathena_root = get_rathena_root() or os.path.dirname(os.path.dirname(main_filepath))

        print(f"[*] rAthena Root deduzido para monstros: {self.rathena_root}")
        self._load_file(main_filepath)

        # Always load the custom override file, even if missing from Footer imports
        custom_import_path = f"{self.rathena_root}/db/import/mob_db.yml".replace('\\', '/')
        if os.path.exists(custom_import_path) and custom_import_path not in self.db_cache:
            print(f"[*] Forçando carregamento do arquivo de monstros customizados: {custom_import_path}")
            self._load_file(custom_import_path)

    def _load_file(self, filepath: str):
        if not os.path.exists(filepath):
            print(f"[!] Aviso: Import de monstros não encontrado no disco: {filepath}")
            return

        if filepath in self.db_cache:
            return
            
        filename = os.path.basename(filepath)
        self.loading_status = f"Lendo arquivo de monstros: {filename}..."
        progress_tracker.update(current_db=filename, status=self.loading_status, progress=min(95.0, progress_tracker.progress + 10.0))

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = self.yaml.load(f)
                
            self.db_cache[filepath] = data
            
            count = 0
            if data and 'Body' in data and isinstance(data['Body'], list):
                for mob in data['Body']:
                    if 'Id' in mob:
                        self.mob_index[mob['Id']] = filepath
                        count += 1
                        self.mobs_loaded += 1

            print(f"[*] {count} monstros carregados de: {filename}")

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
        """Rebuilds the flat ``cached_mobs_list`` from all entries in ``db_cache``.

        Annotates each mob with ``_source`` (``"custom"`` or ``"rathena"``) based on
        whether its file lives under ``db/import/``.  Result is sorted by ``Id``.
        """
        all_mobs = []
        for filepath, data in self.db_cache.items():
            if data and 'Body' in data and isinstance(data['Body'], list):
                norm_path = filepath.replace('\\', '/')
                is_custom = '/db/import/' in norm_path
                for mob in data['Body']:
                    annotated = dict(mob)
                    annotated['_source'] = 'custom' if is_custom else 'rathena'
                    all_mobs.append(annotated)
        all_mobs.sort(key=lambda x: x.get('Id', 0))
        self.cached_mobs_list = all_mobs

    def get_mobs(self):
        """Returns the flat list of all mobs, rebuilding the cache if necessary.

        Returns:
            list: All mob entries from all loaded YAML files, sorted by ``Id``.
        """
        if self.cached_mobs_list is None:
            self.rebuild_cache()
        return self.cached_mobs_list

    def search_mobs(self, page: int = 1, limit: int = 50, search: str = "", source: str = "", skip: int = None):
        """Filters and paginates the mob list.

        Filters by ``source`` (``"rathena"`` / ``"custom"``) and by a search string
        matched against ``Id``, ``Name``, ``AegisName``, and ``JapaneseName`` (case-insensitive).

        Args:
            page: 1-based page number (ignored if ``skip`` is provided).
            limit: Maximum entries per page.
            search: Optional substring filter.
            source: Optional source filter (``"rathena"`` or ``"custom"``).
            skip: If provided, overrides ``page`` as the start offset.

        Returns:
            tuple: ``(paginated_list, total_count)``.
        """
        mobs = self.get_mobs()
        filtered = mobs

        if source and source in ('rathena', 'custom'):
            filtered = [m for m in filtered if m.get('_source') == source]

        if search:
            q = search.strip().lower()
            filtered = [
                m for m in filtered
                if q in str(m.get('Id', ''))
                or (m.get('Name') and q in str(m.get('Name')).lower())
                or (m.get('AegisName') and q in str(m.get('AegisName')).lower())
                or (m.get('JapaneseName') and q in str(m.get('JapaneseName')).lower())
            ]

        total_count = len(filtered)
        if skip is not None:
            start = skip
        else:
            start = max(0, (page - 1) * limit)
        end = start + limit
        paginated = filtered[start:end]
        return paginated, total_count

    def _wrap_scripts_for_dump(self, obj):
        """Converts multiline script strings to ``LiteralScalarString`` so ruamel.yaml
        uses the block-style pipe (``|``) notation when serializing to YAML.

        Applies recursively to all dicts and lists in the object tree.

        Args:
            obj: Any Python dict or list (in-place mutation).
        """
        SCRIPT_KEYS = {'Script', 'OnKillScript', 'CaptureScript'}
        if isinstance(obj, dict):
            for key in list(obj.keys()):
                val = obj[key]
                if key in SCRIPT_KEYS and isinstance(val, str) and val.strip():
                    normalized = val if val.endswith('\n') else val + '\n'
                    obj[key] = LiteralScalarString(normalized)
                else:
                    self._wrap_scripts_for_dump(val)
        elif isinstance(obj, list):
            for item in obj:
                self._wrap_scripts_for_dump(item)

    def save_file(self, filepath: str):
        """Serializes the cached YAML document back to disk for the given filepath.

        Temporarily strips all ``_``-prefixed metadata keys before dumping and
        restores them afterwards to keep the in-memory state intact.  Script strings
        are wrapped in ``LiteralScalarString`` to preserve the block-pipe style.

        Args:
            filepath: Absolute path to the YAML file to write.

        Returns:
            bool: ``True`` on success, ``False`` if the path is not in the cache.
        """
        if filepath not in self.db_cache:
            return False

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
        strip_metadata(data)
        self._wrap_scripts_for_dump(data)

        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                self.yaml.dump(data, f)
        finally:
            for obj, k, val in removed_keys:
                obj[k] = val

        return True


    def update_mob(self, mob_id: int, updated_data: dict, save_mode: str = 'import'):
        """Updates a mob entry in the YAML database.

        **Save modes:**
        - ``'import'`` (default): If the mob lives in the official rAthena db, writes an
          override entry to ``db/import/mob_db.yml``.  If it already has an entry there,
          merges the changes in place.
        - ``'overwrite'``: Writes directly into whatever file currently owns the mob.

        Args:
            mob_id: Numeric mob ID.
            updated_data: Dict of field values to apply.  ``None`` / empty-string values
                delete the corresponding field.
            save_mode: ``'import'`` or ``'overwrite'``.

        Returns:
            dict: The updated mob entry annotated with ``_source``, or ``None`` if not found.
        """

        target_filepath = self.mob_index[mob_id]
        norm_path = target_filepath.replace('\\', '/')
        import_db_path = f"{self.rathena_root}/db/import/mob_db.yml".replace('\\', '/')

        if '/db/import/' not in norm_path:
            original_data = self.db_cache[target_filepath]
            original_mob = None
            for mob in original_data.get('Body', []):
                if mob.get('Id') == mob_id:
                    original_mob = mob
                    break
            if original_mob is None:
                return None

            if save_mode == 'overwrite':
                for key, value in updated_data.items():
                    if value == "" or value is None:
                        original_mob.pop(key, None)
                    else:
                        original_mob[key] = value
                self.save_file(target_filepath)
                result = dict(original_mob)
                result['_source'] = 'rathena'
                return result

            # 'import' mode: write override to db/import/mob_db.yml
            override_mob = dict(original_mob)
            for key, value in updated_data.items():
                if value == "" or value is None:
                    override_mob.pop(key, None)
                else:
                    override_mob[key] = value

            # Load import file into cache if not present
            if import_db_path not in self.db_cache:
                if os.path.exists(import_db_path):
                    self._load_file(import_db_path)
                else:
                    os.makedirs(os.path.dirname(import_db_path), exist_ok=True)
                    self.db_cache[import_db_path] = {'Header': {'Type': 'MOB_DB', 'Version': 5}, 'Body': []}

            import_data = self.db_cache[import_db_path]
            if 'Body' not in import_data or not isinstance(import_data['Body'], list):
                import_data['Body'] = []

            existing_override = None
            for mob in import_data['Body']:
                if mob.get('Id') == mob_id:
                    existing_override = mob
                    break

            if existing_override is not None:
                for key, value in updated_data.items():
                    if value == "" or value is None:
                        existing_override.pop(key, None)
                    else:
                        existing_override[key] = value
                saved_mob = dict(existing_override)
            else:
                import_data['Body'].insert(0, override_mob)
                saved_mob = override_mob

            self.save_file(import_db_path)
            self.mob_index[mob_id] = import_db_path
            saved_mob['_source'] = 'custom'
            self.rebuild_cache()
            return saved_mob

        # Mob already lives in db/import/: update in place
        data = self.db_cache[target_filepath]
        for mob in data.get('Body', []):
            if mob.get('Id') == mob_id:
                for key, value in updated_data.items():
                    if value == "" or value is None:
                        if key in mob:
                            del mob[key]
                    else:
                        mob[key] = value
                self.save_file(target_filepath)
                result = dict(mob)
                result['_source'] = 'custom'
                self.rebuild_cache()
                return result
        return None


    def add_custom_mob(self, mob_data: dict):
        """Adds a new mob entry to ``db/import/mob_db.yml``.

        Creates the file with a minimal YAML header if it does not exist.

        Args:
            mob_data: Complete mob dict (must include ``Id``).

        Returns:
            dict: The added mob entry.
        """
        import_db_path = f"{self.rathena_root}/db/import/mob_db.yml".replace("\\", "/")
        
        if import_db_path not in self.db_cache:
            if not os.path.exists(import_db_path):
                os.makedirs(os.path.dirname(import_db_path), exist_ok=True)
                with open(import_db_path, 'w', encoding='utf-8') as f:
                    f.write("Header:\n  Type: MOB_DB\n  Version: 5\n\nBody:\n")
            self._load_file(import_db_path)
            
        data = self.db_cache.get(import_db_path)
        if data is None:
            data = {}
            self.db_cache[import_db_path] = data
            
        if 'Body' not in data or not isinstance(data['Body'], list):
            data['Body'] = []
            
        data['Body'].insert(0, mob_data)
        self.save_file(import_db_path)
        self.mob_index[mob_data['Id']] = import_db_path
        self.rebuild_cache()
        return mob_data

    def delete_mob(self, mob_id: int) -> bool:
        """Permanently removes a mob from the YAML file it resides in.

        **Security guard:** only mobs residing under ``db/import/`` can be deleted.
        Mobs from the official rAthena database (``db/re/`` or ``db/pre-re/``) raise
        ``PermissionError``, which the API route converts to HTTP 403.

        Args:
            mob_id: Numeric mob ID.

        Returns:
            bool: ``True`` on success, ``False`` if the mob was not found.

        Raises:
            PermissionError: If the mob belongs to the official rAthena database.
        """
        if mob_id not in self.mob_index:
            return False

        filepath = self.mob_index[mob_id]
        norm_path = filepath.replace('\\', '/')

        if '/db/import/' not in norm_path:
            raise PermissionError(
                f"O monstro {mob_id} reside em '{norm_path}' que faz parte do banco "
                "oficial do rAthena. Somente monstros em db/import/ podem ser excluídos."
            )

        data = self.db_cache.get(filepath)
        if not data:
            return False

        body = data.get('Body', [])
        original_len = len(body)

        data['Body'] = [mob for mob in body if mob.get('Id') != mob_id]

        if len(data['Body']) == original_len:
            del self.mob_index[mob_id]
            return False

        self.save_file(filepath)
        del self.mob_index[mob_id]
        self.cached_mobs_list = None  # Invalidate to reflect the removal on next read
        return True


mob_db = MobDatabase()
