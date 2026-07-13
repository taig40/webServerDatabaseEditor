"""
Script de diagnostico: valida todos os itens do item_db.yml contra o ItemDBModel.

Uso:
    cd backend
    .\\venv\\Scripts\\python.exe diagnose_item_schema.py

Output: lista dos primeiros erros de validacao com campo problematico e valor real.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
sys.stdout.reconfigure(encoding='utf-8')  # garante UTF-8 no terminal Windows

from ruamel.yaml import YAML
from pydantic import ValidationError
from app.models.item import ItemDBModel
from collections import defaultdict

# ── Configuracoes ──────────────────────────────────────────────────────────────
ITEM_DB_PATH = r"C:\Users\taiga\Documents\rAthena\emulador\rathena\db\re\item_db.yml"
MAX_ERRORS   = 20   # Mostrar no maximo N erros distintos no console
# ──────────────────────────────────────────────────────────────────────────────

yaml = YAML()
yaml.preserve_quotes = True


def find_rathena_root(path: str) -> str:
    """Sobe na arvore de diretorios ate encontrar a pasta que contem 'db/'."""
    cur = os.path.dirname(os.path.abspath(path))
    while cur:
        if os.path.isdir(os.path.join(cur, "db")):
            return cur
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    return os.path.dirname(os.path.abspath(path))


def collect_all_items(root_path: str):
    """Carrega recursivamente todos os itens seguindo Footer.Imports."""
    visited    = set()
    all_items  = []
    rathena_root = find_rathena_root(root_path)
    print(f"  rAthena root: {rathena_root}")

    def load_file(path: str):
        path = os.path.normpath(path)
        if path in visited or not os.path.exists(path):
            if not os.path.exists(path):
                print(f"  [skip] nao encontrado: {path}")
            return
        visited.add(path)
        print(f"  -> Carregando: {os.path.relpath(path, rathena_root)}")
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.load(f)
        except Exception as ex:
            print(f"  [ERRO parse] {path}: {ex}")
            return

        if data and "Body" in data and isinstance(data["Body"], list):
            n = len(data["Body"])
            all_items.extend(data["Body"])
            print(f"     +{n} itens (total acumulado: {len(all_items)})")

        if data and "Footer" in data and "Imports" in data["Footer"]:
            for imp in data["Footer"]["Imports"]:
                if "Path" in imp:
                    rel = imp["Path"].replace("\\", os.sep)
                    abs_path = os.path.join(rathena_root, rel)
                    load_file(abs_path)

    load_file(root_path)
    return all_items


def normalize_scripts(item: dict) -> dict:
    """Replica a normalizacao do yaml_parser._normalize_scripts."""
    for sk in ["Script", "EquipScript", "UnEquipScript"]:
        if sk in item:
            val = item[sk]
            if isinstance(val, dict):
                item[sk] = val.get("Script", "")
            elif val is None:
                item.pop(sk, None)
    return item


def get_nested_value(item_dict: dict, loc_path: tuple):
    """Navega ate o valor problematico indicado pelo loc do erro Pydantic."""
    val = item_dict
    try:
        for loc in loc_path:
            if isinstance(val, dict):
                val = val.get(loc, "<not found>")
            elif isinstance(val, list) and isinstance(loc, int):
                val = val[loc]
            else:
                return f"<cannot navigate loc={loc}>"
    except Exception:
        return "<navigation error>"
    return val


def main():
    if not os.path.exists(ITEM_DB_PATH):
        print(f"[!] Arquivo nao encontrado: {ITEM_DB_PATH}")
        sys.exit(1)

    print(f"\n[*] Carregando item_db de:\n    {ITEM_DB_PATH}\n")
    items = collect_all_items(ITEM_DB_PATH)
    print(f"\n[*] Total de itens brutos carregados: {len(items)}")
    print("=" * 70)

    error_count  = 0
    ok_count     = 0
    field_errors = defaultdict(list)

    for raw in items:
        if not isinstance(raw, dict):
            continue
        item_dict = dict(raw)
        normalize_scripts(item_dict)

        try:
            ItemDBModel(**item_dict)
            ok_count += 1
        except ValidationError as e:
            error_count += 1
            item_id = item_dict.get("Id", "???")
            aegis   = item_dict.get("AegisName", "???")

            for err in e.errors():
                field = " -> ".join(str(loc) for loc in err["loc"])
                msg   = err["msg"]
                val   = get_nested_value(item_dict, err["loc"])
                field_errors[field].append((item_id, aegis, val, msg))

            if error_count <= MAX_ERRORS:
                print(f"\n[ERRO #{error_count}] Id={item_id}  AegisName={aegis}")
                # Mostrar apenas os erros sem os frames completos do Pydantic
                for err in e.errors():
                    loc = " -> ".join(str(l) for l in err["loc"])
                    print(f"  Campo: {loc}")
                    print(f"  Valor: {repr(get_nested_value(item_dict, err['loc']))}")
                    print(f"  Erro : {err['msg']}")

    print("\n" + "=" * 70)
    print(f"[RESULTADO]  OK: {ok_count}   |   FALHA: {error_count}   |   TOTAL: {ok_count + error_count}")
    print("=" * 70)

    if field_errors:
        print("\n[CAMPOS PROBLEMATICOS] (ordenado por frequencia de erro):")
        for field, entries in sorted(field_errors.items(), key=lambda x: -len(x[1])):
            sample = entries[0]
            print(f"\n  Campo  : {field}")
            print(f"  Erros  : {len(entries)}")
            print(f"  Exemplo: Id={sample[0]}  AegisName={sample[1]}")
            print(f"  Valor  : {repr(sample[2])}")
            print(f"  Motivo : {sample[3]}")
    else:
        print("\n[OK] Nenhum erro de validacao! ItemDBModel 100% compativel.")


if __name__ == "__main__":
    main()
