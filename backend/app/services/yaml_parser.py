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
        """Retorna uma lista contínua com TODOS os itens de TODOS os arquivos."""
        all_items = []
        for filepath, data in self.db_cache.items():
            if data and 'Body' in data and isinstance(data['Body'], list):
                all_items.extend(data['Body'])
        return all_items

    def save_file(self, filepath: str):
        if filepath not in self.db_cache:
            return False
        with open(filepath, 'w', encoding='utf-8') as f:
            self.yaml.dump(self.db_cache[filepath], f)
        return True

    def update_item(self, item_id: int, updated_data: dict):
        if item_id not in self.item_index:
            return None
        target_filepath = self.item_index[item_id]
        data = self.db_cache[target_filepath]
        for item in data.get('Body', []):
            if item.get('Id') == item_id:
                for key, value in updated_data.items():
                    item[key] = value
                self.save_file(target_filepath)
                return item
        return None

    def add_custom_item(self, item_data: dict):
        import_db_path = f"{self.rathena_root}/db/import/item_db.yml".replace("\\", "/")
        
        if import_db_path not in self.db_cache:
            if not os.path.exists(import_db_path):
                raise FileNotFoundError(f"Arquivo de importação não encontrado: {import_db_path}")
            self._load_file(import_db_path)
            
        data = self.db_cache.get(import_db_path)
        if data is None:
            data = {}
            self.db_cache[import_db_path] = data
            
        if 'Body' not in data or not isinstance(data['Body'], list):
            data['Body'] = []
            
        # Adicionar o item no topo da lista custom
        data['Body'].insert(0, item_data)
        self.save_file(import_db_path)
        self.item_index[item_data['Id']] = import_db_path
        return item_data

# Singleton global
yaml_db = YamlDatabase()
