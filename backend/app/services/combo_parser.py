"""combo_parser.py — Item Combos parser (item_combos.yml)."""

from app.services.generic_parser import GenericYamlParser
import os


class ComboDatabase(GenericYamlParser):
    _id_key = '_index'           # synthetic index — combos have no native ID
    _import_filename = 'item_combos.yml'
    _label = 'combos'
    _header_type = 'COMBO_DB'
    _header_version = 1

    def _load_file(self, filepath: str):
        """Override to assign synthetic _index to each combo entry."""
        if not os.path.exists(filepath):
            print(f'[!] Import não encontrado: {filepath}')
            return
        if filepath in self.db_cache:
            return

        self.loading_status = f'Lendo {os.path.basename(filepath)}...'
        try:
            from ruamel.yaml import YAML
            yaml = self.yaml
            with open(filepath, 'r', encoding='utf-8') as f:
                data = yaml.load(f)
            self.db_cache[filepath] = data

            norm = filepath.replace('\\', '/')
            is_custom = '/db/import/' in norm
            prefix = 'c' if is_custom else 'r'

            count = 0
            if data and 'Body' in data and isinstance(data['Body'], list):
                for i, entry in enumerate(data['Body']):
                    synthetic_id = f'{prefix}_{i}'
                    # Store the index in the entry so PUT can find it
                    entry['_index'] = synthetic_id
                    self.entry_index[synthetic_id] = filepath
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

    def get_combos(self) -> list:
        result = []
        for filepath, data in self.db_cache.items():
            if not (data and 'Body' in data and isinstance(data['Body'], list)):
                continue
            norm = filepath.replace('\\', '/')
            is_custom = '/db/import/' in norm
            for entry in data['Body']:
                annotated = dict(entry)
                annotated['_source'] = 'custom' if is_custom else 'rathena'
                # Flatten Combos list to a list of item name lists for easier frontend use
                raw_combos = entry.get('Combos', [])
                item_groups = []
                for combo_entry in raw_combos:
                    if isinstance(combo_entry, dict) and 'Combo' in combo_entry:
                        combo = combo_entry['Combo']
                        if isinstance(combo, list):
                            item_groups.append(list(combo))
                        elif isinstance(combo, dict):
                            item_groups.append(list(combo.keys()))
                annotated['_item_groups'] = item_groups
                annotated['Script'] = entry.get('Script', '')
                result.append(annotated)
        return result

    def update_combo(self, index: str, updated_data: dict):
        """Update a combo by its synthetic _index. Redirects rAthena combos to import."""
        filepath = self.entry_index.get(index)
        if not filepath:
            return None

        norm = filepath.replace('\\', '/')
        is_import = '/db/import/' in norm

        # Find the entry
        data = self.db_cache[filepath]
        target_entry = None
        for entry in data.get('Body', []):
            if entry.get('_index') == index:
                target_entry = entry
                break

        if target_entry is None:
            return None

        if not is_import:
            # Redirect to import: make a copy
            import_path = self._ensure_import_loaded()
            import_data = self.db_cache[import_path]
            if 'Body' not in import_data:
                import_data['Body'] = []
            # Check if override already exists
            existing = next((e for e in import_data['Body'] if e.get('_index') == index), None)
            if existing:
                existing.update(updated_data)
                saved = dict(existing)
            else:
                override = dict(target_entry)
                override.update(updated_data)
                import_data['Body'].insert(0, override)
                saved = override
            self.save_file(import_path)
            self.entry_index[index] = import_path
            saved['_source'] = 'custom'
            return saved

        # In-place update
        target_entry.update(updated_data)
        self.save_file(filepath)
        result = dict(target_entry)
        result['_source'] = 'custom'
        return result

    def add_combo(self, combo_data: dict) -> dict:
        """Add a new combo to db/import/item_combos.yml."""
        import_path = self._ensure_import_loaded()
        data = self.db_cache[import_path]
        if 'Body' not in data:
            data['Body'] = []
        new_index = f'c_{len(data["Body"])}'
        combo_data['_index'] = new_index
        data['Body'].insert(0, combo_data)
        self.save_file(import_path)
        self.entry_index[new_index] = import_path
        return combo_data


combo_db = ComboDatabase()
