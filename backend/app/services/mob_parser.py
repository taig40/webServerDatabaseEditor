from ruamel.yaml import YAML
import os
import threading

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
        
        thread = threading.Thread(target=self._load_db_sync, args=(main_filepath,))
        thread.daemon = True
        thread.start()

    def _load_db_sync(self, main_filepath: str):
        try:
            self.load_db(main_filepath)
        except Exception as e:
            print(f"[!] Erro fatal no carregamento background de monstros: {e}")
            self.loading_status = f"Erro: {e}"
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

    def get_mobs(self):
        all_mobs = []
        for filepath, data in self.db_cache.items():
            if data and 'Body' in data and isinstance(data['Body'], list):
                all_mobs.extend(data['Body'])
        return all_mobs

    def save_file(self, filepath: str):
        if filepath not in self.db_cache:
            return False
        with open(filepath, 'w', encoding='utf-8') as f:
            self.yaml.dump(self.db_cache[filepath], f)
        return True

    def update_mob(self, mob_id: int, updated_data: dict):
        if mob_id not in self.mob_index:
            return None
        target_filepath = self.mob_index[mob_id]
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
                return mob
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
        return mob_data

mob_db = MobDatabase()
