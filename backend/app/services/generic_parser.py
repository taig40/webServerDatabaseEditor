"""
generic_parser.py — Base class for all rAthena YAML database parsers.

Implements the shared pattern:
  - Async threaded loading
  - Recursive import-following
  - db/import/ custom file detection
  - _source annotation ('rathena' | 'custom')
  - Safe save: original rAthena files are NEVER overwritten;
    edits are redirected to db/import/<filename>.yml
"""

from ruamel.yaml import YAML
import os
import threading


class GenericYamlParser:
    """
    Base class for rAthena YAML databases (skill_db, quest_db, pet_db, combo_db …).
    Sub-classes only need to override `_id_key` and optionally `_import_filename`.
    """

    # Key used to identify each entry (e.g. 'Id', 'Mob', 'Index')
    _id_key: str = 'Id'

    # Filename used inside db/import/ when writing custom overrides
    _import_filename: str = ''   # must be set by sub-class (e.g. 'skill_db.yml')

    # Human-readable label for loading messages
    _label: str = 'entradas'

    def __init__(self):
        # Lock de reentrância para garantir concorrência segura nos parsers genéricos
        self.lock = threading.RLock()

        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.allow_duplicate_keys = True
        self.yaml.indent(mapping=2, sequence=4, offset=2)

        self.db_cache: dict = {}      # filepath -> parsed YAML object
        self.entry_index: dict = {}   # id_value  -> filepath

        self.rathena_root: str = ''

        self.is_loading: bool = False
        self.loading_status: str = 'Aguardando inicialização...'
        self.entries_loaded: int = 0

    # ─── Loading ────────────────────────────────────────────────────────────

    def load_db_async(self, main_filepath: str):
        if self.is_loading:
            return
        self.is_loading = True
        self.entries_loaded = 0
        self.loading_status = f'Iniciando leitura de {self._import_filename}...'
        t = threading.Thread(target=self._load_sync, args=(main_filepath,), daemon=True)
        t.start()

    def _load_sync(self, main_filepath: str):
        try:
            self.load_db(main_filepath)
        except Exception as e:
            print(f'[!] Erro fatal ao carregar {self._import_filename}: {e}')
            self.loading_status = f'Erro: {e}'
        finally:
            self.is_loading = False
            if 'Erro' not in self.loading_status:
                self.loading_status = 'Carregamento Finalizado.'

    def load_db(self, main_filepath: str):
        with self.lock:
            main_filepath = main_filepath.replace('\\', '/')
            if not os.path.exists(main_filepath):
                self.loading_status = f'Arquivo não encontrado: {main_filepath}'
                print(f'[!] {self.loading_status}')
                return

            path_parts = main_filepath.split('/')
            if 'db' in path_parts:
                self.rathena_root = '/'.join(path_parts[:path_parts.index('db')])
            else:
                from app.core.config import get_rathena_root
                self.rathena_root = get_rathena_root() or os.path.dirname(os.path.dirname(main_filepath))

            print(f'[*] rAthena root ({self._import_filename}): {self.rathena_root}')
            self._load_file(main_filepath)

            # Always force-load the custom import file even if it's not in Footer.Imports
            import_path = f'{self.rathena_root}/db/import/{self._import_filename}'.replace('\\', '/')
            if os.path.exists(import_path) and import_path not in self.db_cache:
                print(f'[*] Forçando carregamento customizado: {import_path}')
                self._load_file(import_path)

    def _load_file(self, filepath: str):
        if not os.path.exists(filepath):
            print(f'[!] Import não encontrado: {filepath}')
            return
        if filepath in self.db_cache:
            return

        self.loading_status = f'Lendo {os.path.basename(filepath)}...'
        try:
            from app.core.cache_manager import load_yaml_with_cache
            data = load_yaml_with_cache(filepath, self.yaml)
            self.db_cache[filepath] = data

            count = 0
            if data and 'Body' in data and isinstance(data['Body'], list):
                for entry in data['Body']:
                    key = entry.get(self._id_key)
                    if key is not None:
                        self.entry_index[key] = filepath
                        count += 1
                        self.entries_loaded += 1

            print(f'[*] {count} {self._label} carregados de: {os.path.basename(filepath)}')

            if data and 'Footer' in data and 'Imports' in data['Footer']:
                for imp in data['Footer']['Imports']:
                    if 'Path' in imp:
                        rel = imp['Path'].replace('\\', '/')
                        abs_path = f'{self.rathena_root}/{rel}'
                        self._load_file(abs_path)
        except Exception as e:
            print(f'[!] Falha ao parsear {filepath}: {e}')

    # ─── Read ────────────────────────────────────────────────────────────────

    def get_all(self) -> list:
        """Return all entries annotated with _source."""
        result = []
        for filepath, data in self.db_cache.items():
            if not (data and 'Body' in data and isinstance(data['Body'], list)):
                continue
            norm = filepath.replace('\\', '/')
            is_custom = '/db/import/' in norm
            for entry in data['Body']:
                annotated = dict(entry)
                annotated['_source'] = 'custom' if is_custom else 'rathena'
                result.append(annotated)
        return result

    def get_by_id(self, id_value):
        filepath = self.entry_index.get(id_value)
        if not filepath:
            return None
        for entry in self.db_cache[filepath].get('Body', []):
            if entry.get(self._id_key) == id_value:
                return entry
        return None

    # ─── Write ───────────────────────────────────────────────────────────────

    def save_file(self, filepath: str) -> bool:
        with self.lock:
            if filepath not in self.db_cache:
                return False
            
            # Temporarily strip metadata keys (starting with '_') from the cached data before dumping
            removed_keys = []
            
            def process_data(obj):
                if isinstance(obj, dict):
                    to_remove = [k for k in obj.keys() if isinstance(k, str) and k.startswith('_')]
                    for k in to_remove:
                        removed_keys.append((obj, k, obj[k]))
                        del obj[k]
                    for k, v in obj.items():
                        if isinstance(v, str) and ('\n' in v or '\r' in v):
                            from ruamel.yaml.scalarstring import LiteralScalarString
                            normalized = v.replace('\r\n', '\n').replace('\r', '\n')
                            obj[k] = LiteralScalarString(normalized)
                        else:
                            process_data(v)
                elif isinstance(obj, list):
                    for i, item in enumerate(obj):
                        if isinstance(item, str) and ('\n' in item or '\r' in item):
                            from ruamel.yaml.scalarstring import LiteralScalarString
                            normalized = item.replace('\r\n', '\n').replace('\r', '\n')
                            obj[i] = LiteralScalarString(normalized)
                        else:
                            process_data(item)
                        
            data = self.db_cache[filepath]
            process_data(data)
            
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    self.yaml.dump(data, f)
            finally:
                # Restore the keys back to their original dictionary objects
                for obj, k, val in removed_keys:
                    obj[k] = val
                    
            return True


    def _get_import_path(self) -> str:
        return f'{self.rathena_root}/db/import/{self._import_filename}'.replace('\\', '/')

    def _ensure_import_loaded(self):
        """Load (or create) the db/import/ file in the cache."""
        import_path = self._get_import_path()
        if import_path not in self.db_cache:
            if os.path.exists(import_path):
                self._load_file(import_path)
            else:
                # Create an empty but valid YAML structure
                os.makedirs(os.path.dirname(import_path), exist_ok=True)
                self.db_cache[import_path] = {
                    'Header': {'Type': self._header_type, 'Version': self._header_version},
                    'Body': []
                }
        return import_path

    # These must be overridden if the sub-class uses _ensure_import_loaded()
    _header_type: str = 'UNKNOWN_DB'
    _header_version: int = 1

    def update_entry(self, id_value, updated_data: dict):
        """
        Update an existing entry.
        - If entry is from rAthena original: write full override to db/import/
        - If already in db/import/: update in-place
        """
        with self.lock:
            filepath = self.entry_index.get(id_value)
            if not filepath:
                return None

            norm = filepath.replace('\\', '/')

            if '/db/import/' not in norm:
                # Read full original entry
                original = None
                for entry in self.db_cache[filepath].get('Body', []):
                    if entry.get(self._id_key) == id_value:
                        original = entry
                        break
                if original is None:
                    return None

                override = dict(original)
                override.update(updated_data)

                import_path = self._ensure_import_loaded()
                import_data = self.db_cache[import_path]
                if 'Body' not in import_data or not isinstance(import_data['Body'], list):
                    import_data['Body'] = []

                existing = next((e for e in import_data['Body'] if e.get(self._id_key) == id_value), None)
                if existing is not None:
                    existing.update(updated_data)
                    saved = dict(existing)
                else:
                    import_data['Body'].insert(0, override)
                    saved = override

                self.save_file(import_path)
                self.entry_index[id_value] = import_path
                saved['_source'] = 'custom'
                return saved

            # Already in import — update in place
            for entry in self.db_cache[filepath].get('Body', []):
                if entry.get(self._id_key) == id_value:
                    entry.update(updated_data)
                    self.save_file(filepath)
                    result = dict(entry)
                    result['_source'] = 'custom'
                    return result
            return None

    def add_entry(self, entry_data: dict):
        """Add a new entry to db/import/."""
        with self.lock:
            import_path = self._ensure_import_loaded()
            data = self.db_cache[import_path]
            if 'Body' not in data or not isinstance(data['Body'], list):
                data['Body'] = []
            data['Body'].insert(0, entry_data)
            self.save_file(import_path)
            id_value = entry_data.get(self._id_key)
            if id_value is not None:
                self.entry_index[id_value] = import_path
            return entry_data
