import os
import pickle
import logging

logger = logging.getLogger(__name__)

def load_yaml_with_cache(yaml_path: str, yaml_parser_instance):
    """
    Carrega o arquivo YAML com suporte a Cache Binário (Pickle).
    - Invalidação baseada no timestamp (mtime) do YAML original.
    - Preserva o objeto ruamel.yaml original e seus comentários.
    """
    CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.cache')
    os.makedirs(CACHE_DIR, exist_ok=True)
    
    # Gerar nome do arquivo de cache seguro (baseado no path absoluto para evitar colisões)
    safe_name = yaml_path.replace(':', '').replace('\\', '_').replace('/', '_')
    cache_path = os.path.join(CACHE_DIR, f"{safe_name}.pkl")
    
    try:
        yaml_mtime = os.path.getmtime(yaml_path)
    except OSError:
        # Se o arquivo original sumir ou der erro de leitura, delegamos pro parser
        logger.warning(f"[Cache] Falha ao ler mtime de {yaml_path}")
        with open(yaml_path, 'r', encoding='utf-8', errors='replace') as f:
            return yaml_parser_instance.load(f)
            
    if os.path.exists(cache_path):
        try:
            cache_mtime = os.path.getmtime(cache_path)
            if cache_mtime >= yaml_mtime:
                # CACHE HIT
                print(f"[Cache] HIT -> {os.path.basename(yaml_path)}")
                with open(cache_path, 'rb') as f:
                    return pickle.load(f)
        except Exception as e:
            logger.warning(f"[Cache] Erro ao carregar {cache_path}: {e}")
            
    # CACHE MISS
    print(f"[Cache] MISS -> Reconstruindo {os.path.basename(yaml_path)}")
    with open(yaml_path, 'r', encoding='utf-8', errors='replace') as f:
        data = yaml_parser_instance.load(f)
        
    try:
        with open(cache_path, 'wb') as f:
            pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
    except Exception as e:
        logger.warning(f"[Cache] Falha ao salvar cache para {yaml_path}: {e}")
        
    return data
