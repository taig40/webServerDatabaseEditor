"""const_parser.py — Script Constants DB parser (const.yml + db/import/const.yml)."""

import os
from app.services.generic_parser import GenericYamlParser

class ConstantDatabase(GenericYamlParser):
    _id_key = 'Name'
    _import_filename = 'const.yml'
    _label = 'constantes'
    _header_type = 'CONSTANT_DB'
    _header_version = 1

    def save_constants(self, new_constants: list[dict]):
        """
        Saves updated constants list by comparing entries with the core const.yml
        and writing only custom additions or overrides into db/import/const.yml.
        """
        # Find the original core const.yml path (not /db/import/)
        core_path = None
        import_path = self._ensure_import_loaded()
        
        for filepath in self.db_cache.keys():
            if "/db/import/" not in filepath.replace('\\', '/'):
                core_path = filepath
                break
                
        # Index original constants by Name
        core_constants = {}
        if core_path and core_path in self.db_cache:
            body = self.db_cache[core_path].get('Body') or []
            for entry in body:
                if 'Name' in entry:
                    core_constants[entry['Name']] = entry

        # Construct the minimal overrides and additions for the import file
        new_import_body = []
        
        for entry in new_constants:
            name = entry.get('Name')
            if not name:
                continue
                
            value = entry.get('Value')
            parameter = entry.get('Parameter', False)
            
            # Check if this matches core const.yml exactly
            core_entry = core_constants.get(name)
            if core_entry:
                core_value = core_entry.get('Value')
                core_param = core_entry.get('Parameter', False)
                
                # If value is numeric, match types before checking equality
                # in yaml values can be strings or integers
                try:
                    if isinstance(core_value, (int, float)) or isinstance(value, (int, float)):
                        if float(core_value) == float(value) and bool(core_param) == bool(parameter):
                            continue
                except (ValueError, TypeError):
                    pass
                    
                if core_value == value and bool(core_param) == bool(parameter):
                    continue

            # Override or new addition is needed
            new_import_entry = {
                'Name': name,
                'Value': value
            }
            if parameter:
                new_import_entry['Parameter'] = True
                
            new_import_body.append(new_import_entry)

        # Store and save overrides
        import_data = self.db_cache[import_path]
        import_data['Body'] = new_import_body
        self.save_file(import_path)

        # Clear and rebuild entry index
        self.entry_index.clear()
        self.entries_loaded = 0
        
        # Re-index all entries from files in memory cache
        for filepath, data in self.db_cache.items():
            if data and 'Body' in data and isinstance(data['Body'], list):
                for ent in data['Body']:
                    k = ent.get('Name')
                    if k is not None:
                        self.entry_index[k] = filepath
                        self.entries_loaded += 1


const_db = ConstantDatabase()
