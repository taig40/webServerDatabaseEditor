from ruamel.yaml import YAML
import os
import threading

class YamlDatabase:
    def __init__(self):
        # Configuração do ruamel.yaml para preservar formatação e comentários originais
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.allow_duplicate_keys = True
        self.yaml.indent(mapping=2, sequence=4, offset=2)
        
        # Mapeamento de: caminho_absoluto -> objeto_yaml_parseado
        self.db_cache = {}
        
        # Índice rápido para saber em qual arquivo um item mora: ID -> caminho_absoluto
        self.item_index = {}
        
        self.rathena_root = ""
        
        # Estados para a Thread de Carregamento Assíncrono
        self.is_loading = False
        self.loading_status = "Aguardando inicialização..."
        self.items_loaded = 0

    def load_db_async(self, main_filepath: str):
        """Inicia o processo de leitura em uma Thread separada para não bloquear a API."""
        if self.is_loading:
            return
            
        self.is_loading = True
        self.items_loaded = 0
        self.loading_status = "Iniciando engine de parse YAML..."
        
        thread = threading.Thread(target=self._load_db_sync, args=(main_filepath,))
        thread.daemon = True
        thread.start()

    def _load_db_sync(self, main_filepath: str):
        """Função encapsuladora que executa na thread background."""
        try:
            self.load_db(main_filepath)
        except Exception as e:
            print(f"[!] Erro fatal no carregamento background: {e}")
            self.loading_status = f"Erro: {e}"
        finally:
            self.is_loading = False
            if "Erro" not in self.loading_status:
                self.loading_status = "Carregamento Finalizado."

    def load_db(self, main_filepath: str):
        """
        Carrega o arquivo principal e extrai o root_path para resolver os imports.
        """
        main_filepath = main_filepath.replace("\\", "/")
        if not os.path.exists(main_filepath):
            self.loading_status = f"Arquivo não encontrado: {main_filepath}"
            print(f"[!] {self.loading_status}")
            return
            
        # Deduzir a pasta raiz do rAthena
        path_parts = main_filepath.split("/")
        if 'db' in path_parts:
            db_index = path_parts.index('db')
            self.rathena_root = "/".join(path_parts[:db_index])
        else:
            self.rathena_root = os.path.dirname(main_filepath)
            
        print(f"[*] rAthena Root deduzido: {self.rathena_root}")
        self._load_file(main_filepath)
        
        # Garante que o item_db customizado sempre seja lido, 
        # mesmo se o usuário tiver esquecido de configurar o Import no Footer
        custom_import_path = f"{self.rathena_root}/db/import/item_db.yml".replace('\\', '/')
        if os.path.exists(custom_import_path) and custom_import_path not in self.db_cache:
            print(f"[*] Forçando carregamento do arquivo customizado: {custom_import_path}")
            self._load_file(custom_import_path)

    def _load_file(self, filepath: str):
        """Função recursiva que carrega um YAML, mapeia os itens e segue os imports."""
        if not os.path.exists(filepath):
            print(f"[!] Aviso: Import não encontrado no disco: {filepath}")
            return

        if filepath in self.db_cache:
            return
            
        filename = os.path.basename(filepath)
        self.loading_status = f"Lendo arquivo: {filename}..."

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = self.yaml.load(f)
                
            self.db_cache[filepath] = data
            
            # Indexar os itens no nosso item_index global
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
            
            # Seguir as ramificações de Imports
            if data and 'Footer' in data and 'Imports' in data['Footer']:
                for imp in data['Footer']['Imports']:
                    if 'Path' in imp:
                        import_rel_path = imp['Path'].replace('\\', '/')
                        import_abs_path = f"{self.rathena_root}/{import_rel_path}"
                        self._load_file(import_abs_path)
                        
        except Exception as e:
            print(f"[!] Falha ao fazer parse de {filepath}: {e}")

    def get_items(self):
        """Retorna uma lista contínua com TODOS os itens de TODOS os arquivos, anotados com _source."""
        all_items = []
        for filepath, data in self.db_cache.items():
            if data and 'Body' in data and isinstance(data['Body'], list):
                # Normalize path separators for cross-platform comparison
                norm_path = filepath.replace('\\', '/')
                is_custom = '/db/import/' in norm_path
                for item in data['Body']:
                    # We annotate in a shallow copy to avoid mutating the in-memory YAML object
                    annotated = dict(item)
                    annotated['_source'] = 'custom' if is_custom else 'rathena'
                    all_items.append(annotated)
        return all_items

    def get_item(self, item_id: int):
        if item_id not in self.item_index:
            return None
        target_filepath = self.item_index[item_id]
        data = self.db_cache[target_filepath]
        for item in data.get('Body', []):
            if item.get('Id') == item_id:
                return item
        return None

    def save_file(self, filepath: str):
        if filepath not in self.db_cache:
            return False
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            self.yaml.dump(self.db_cache[filepath], f)
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
                saved_item = dict(existing_override)
            else:
                import_data['Body'].insert(0, override_item)
                saved_item = override_item

            self.save_file(import_db_path)
            self.item_index[item_id] = import_db_path
            saved_item['_source'] = 'custom'
            return saved_item

        # --- Item already lives in db/import/ OR user requested overwrite in original rAthena file ---
        data = self.db_cache[target_filepath]
        for item in data.get('Body', []):
            if item.get('Id') == item_id:
                for key, value in updated_data.items():
                    item[key] = value
                item.pop('_source', None)
                self.save_file(target_filepath)
                result = dict(item)
                result['_source'] = 'custom' if '/db/import/' in norm_path else 'rathena'
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
        data['Body'].insert(0, clean_item)
        self.save_file(import_db_path)
        self.item_index[clean_item['Id']] = import_db_path

        result = dict(clean_item)
        result['_source'] = 'custom'
        return result


# Singleton global
yaml_db = YamlDatabase()
