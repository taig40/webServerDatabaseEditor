from ruamel.yaml import YAML
import os
import threading
from app.services.load_progress import progress_tracker

class MobDatabase:
    def __init__(self):
        # Configure ruamel.yaml to preserve formatting and comments
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.allow_duplicate_keys = True
        self.yaml.indent(mapping=2, sequence=4, offset=2)
        
        # Absolute path -> Parsed YAML object
        self.db_cache = {}
        
        # ID -> Absolute path of the file containing the mob
        self.mob_index = {}
        
        self.rathena_root = ""
        
        # Cache em memória para buscas instantâneas
        self.cached_mobs_list = None
        
        # Async loading state
        self.is_loading = False
        self.loading_status = "Aguardando inicialização..."
        self.mobs_loaded = 0

    def load_db_async(self, main_filepath: str):
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
        main_filepath = main_filepath.replace("\\", "/")
        if not os.path.exists(main_filepath):
            self.loading_status = f"Arquivo não encontrado: {main_filepath}"
            print(f"[!] {self.loading_status}")
            return
            
        # Deduce rAthena root path
        path_parts = main_filepath.split("/")
        if 'db' in path_parts:
            db_index = path_parts.index('db')
            self.rathena_root = "/".join(path_parts[:db_index])
        else:
            self.rathena_root = os.path.dirname(main_filepath)
            
        print(f"[*] rAthena Root deduzido para monstros: {self.rathena_root}")
        self._load_file(main_filepath)
        
        # Ensure custom mob_db is always loaded
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
            
            # Follow imports
            if data and 'Footer' in data and 'Imports' in data['Footer']:
                for imp in data['Footer']['Imports']:
                    if 'Path' in imp:
                        import_rel_path = imp['Path'].replace('\\', '/')
                        import_abs_path = f"{self.rathena_root}/{import_rel_path}"
                        self._load_file(import_abs_path)
                        
        except Exception as e:
            print(f"[!] Falha ao fazer parse de {filepath}: {e}")

    def rebuild_cache(self):
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
        if self.cached_mobs_list is None:
            self.rebuild_cache()
        return self.cached_mobs_list

    def search_mobs(self, page: int = 1, limit: int = 50, search: str = "", source: str = "", skip: int = None):
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

    def save_file(self, filepath: str):
        if filepath not in self.db_cache:
            return False
        
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
        strip_metadata(data)
        
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                self.yaml.dump(data, f)
        finally:
            # Restore the keys back to their original dictionary objects
            for obj, k, val in removed_keys:
                obj[k] = val
                
        return True


    def update_mob(self, mob_id: int, updated_data: dict, save_mode: str = 'import'):
        if mob_id not in self.mob_index:
            return None

        target_filepath = self.mob_index[mob_id]
        norm_path = target_filepath.replace('\\', '/')
        import_db_path = f"{self.rathena_root}/db/import/mob_db.yml".replace('\\', '/')

        # --- If the mob lives in the original rAthena db ---
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
                # Write directly into the original file
                for key, value in updated_data.items():
                    if value == "" or value is None:
                        original_mob.pop(key, None)
                    else:
                        original_mob[key] = value
                self.save_file(target_filepath)
                result = dict(original_mob)
                result['_source'] = 'rathena'
                return result

            # Default: 'import' mode — write override to db/import/
            override_mob = dict(original_mob)
            for key, value in updated_data.items():
                if value == "" or value is None:
                    override_mob.pop(key, None)
                else:
                    override_mob[key] = value

            # Ensure the import file is loaded in cache
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

        # --- Mob already lives in db/import/: update in place ---
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

mob_db = MobDatabase()
