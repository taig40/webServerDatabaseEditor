"""
mob_skill_parser.py — Parser for mob_skill_db.txt (CSV format).

Format per line (non-comment, non-empty):
  MobID, DummyName, State, SkillID, SkillLv, Rate, CastTime, Delay,
  Cancelable, Target, ConditionType, ConditionValue,
  Val1, Val2, Val3, Val4, Val5, Emotion, Chat

Save rules (as specified by project owner):
  - Editing a skill of an existing rAthena mob  → overwrite the ORIGINAL file
  - Adding a new skill entry for a new mob       → write to db/import/mob_skill_db.txt
"""

import os
import threading
from typing import Optional


FIELDS = [
    'mob_id', 'dummy_name', 'state', 'skill_id', 'skill_lv',
    'rate', 'cast_time', 'delay', 'cancelable', 'target',
    'condition_type', 'condition_value',
    'val1', 'val2', 'val3', 'val4', 'val5',
    'emotion', 'chat',
]


def _parse_line(line: str, line_index: int) -> Optional[dict]:
    """Parse a single CSV line into a dict. Returns None for comments/blanks."""
    stripped = line.rstrip('\n\r')
    if not stripped or stripped.lstrip().startswith('//'):
        return None
    # Remove inline comments
    if '//' in stripped:
        stripped = stripped[:stripped.index('//')].rstrip()
    parts = [p.strip() for p in stripped.split(',')]
    if len(parts) < 12:
        return None
    entry = {'_line_index': line_index, '_raw': stripped}
    for i, field in enumerate(FIELDS):
        entry[field] = parts[i] if i < len(parts) else ''
    # Numeric coercions
    for f in ('mob_id', 'skill_id', 'skill_lv', 'rate', 'cast_time', 'delay',
              'condition_value', 'val1', 'val2', 'val3', 'val4', 'val5', 'emotion'):
        try:
            entry[f] = int(entry[f]) if entry[f] != '' else 0
        except ValueError:
            pass
    entry['cancelable'] = entry.get('cancelable', 'no').lower() in ('yes', '1', 'true')
    return entry


def _entry_to_csv(e: dict) -> str:
    """Serialize an entry dict back to a CSV line."""
    cancelable = 'yes' if e.get('cancelable') else 'no'
    parts = [
        str(e.get('mob_id', 0)),
        str(e.get('dummy_name', '')),
        str(e.get('state', 'idle')),
        str(e.get('skill_id', 0)),
        str(e.get('skill_lv', 1)),
        str(e.get('rate', 1000)),
        str(e.get('cast_time', 0)),
        str(e.get('delay', 5000)),
        cancelable,
        str(e.get('target', 'target')),
        str(e.get('condition_type', 'always')),
        str(e.get('condition_value', 0)),
        str(e.get('val1', 0)),
        str(e.get('val2', 0)),
        str(e.get('val3', 0)),
        str(e.get('val4', 0)),
        str(e.get('val5', 0)),
        str(e.get('emotion', -1)),
        str(e.get('chat', '')),
    ]
    return ', '.join(parts)


class MobSkillDatabase:
    def __init__(self):
        self.rathena_root = ''
        self.original_path = ''       # db/re/mob_skill_db.txt
        self.import_path = ''         # db/import/mob_skill_db.txt

        # All entries from both files combined (original first, import appended)
        self._original_entries: list[dict] = []
        self._import_entries: list[dict] = []

        # Raw lines kept for faithful round-trip saves
        self._original_lines: list[str] = []
        self._import_lines: list[str] = []

        self.is_loading = False
        self.loading_status = 'Aguardando inicialização...'
        self.entries_loaded = 0

    # ─── Loading ────────────────────────────────────────────────────────────

    def load_db_async(self, filepath: str):
        if self.is_loading:
            return
        self.is_loading = True
        self.entries_loaded = 0
        self.loading_status = 'Iniciando leitura de mob_skill_db.txt...'
        t = threading.Thread(target=self._load_sync, args=(filepath,), daemon=True)
        t.start()

    def _load_sync(self, filepath: str):
        try:
            self._load(filepath)
        except Exception as e:
            print(f'[!] Erro ao carregar mob_skill_db: {e}')
            self.loading_status = f'Erro: {e}'
        finally:
            self.is_loading = False
            if 'Erro' not in self.loading_status:
                self.loading_status = 'Carregamento Finalizado.'

    def _load(self, filepath: str):
        filepath = filepath.replace('\\', '/')
        if not os.path.exists(filepath):
            self.loading_status = f'Arquivo não encontrado: {filepath}'
            print(f'[!] {self.loading_status}')
            return

        path_parts = filepath.split('/')
        if 'db' in path_parts:
            self.rathena_root = '/'.join(path_parts[:path_parts.index('db')])
        else:
            self.rathena_root = os.path.dirname(filepath)

        self.original_path = filepath
        self.import_path = f'{self.rathena_root}/db/import/mob_skill_db.txt'

        self.loading_status = 'Lendo mob_skill_db.txt...'
        self._original_lines, self._original_entries = self._read_file(filepath)
        self.entries_loaded = len(self._original_entries)
        print(f'[*] {self.entries_loaded} mob skills carregadas de: {os.path.basename(filepath)}')

        if os.path.exists(self.import_path):
            self.loading_status = 'Lendo mob_skill_db.txt (import)...'
            self._import_lines, self._import_entries = self._read_file(self.import_path)
            self.entries_loaded += len(self._import_entries)
            print(f'[*] {len(self._import_entries)} mob skills customizadas carregadas.')

    def _read_file(self, filepath: str):
        lines = []
        entries = []
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            for i, line in enumerate(f):
                lines.append(line)
                entry = _parse_line(line, i)
                if entry is not None:
                    entries.append(entry)
        return lines, entries

    # ─── Read ────────────────────────────────────────────────────────────────

    def get_all(self) -> list[dict]:
        result = []
        for e in self._original_entries:
            a = dict(e)
            a['_source'] = 'rathena'
            result.append(a)
        for e in self._import_entries:
            a = dict(e)
            a['_source'] = 'custom'
            result.append(a)
        return result

    def get_by_mob(self, mob_id: int) -> list[dict]:
        return [e for e in self.get_all() if e.get('mob_id') == mob_id]

    # ─── Write ───────────────────────────────────────────────────────────────

    def _is_rathena_mob(self, mob_id: int) -> bool:
        """True if this mob has entries in the original rAthena file."""
        return any(e['mob_id'] == mob_id for e in self._original_entries)

    def _save_file(self, filepath: str, lines: list[str]):
        with open(filepath, 'w', encoding='utf-8', newline='\r\n') as f:
            f.writelines(lines)

    def update_entry(self, line_index: int, updated_data: dict) -> Optional[dict]:
        """
        Update a skill entry by its line_index.
        - Entry from original rAthena file → overwrite original file.
        - Entry from import file → update import file.
        """
        # Check original first
        for entry in self._original_entries:
            if entry['_line_index'] == line_index:
                entry.update(updated_data)
                # Update the raw line in-place
                self._original_lines[line_index] = _entry_to_csv(entry) + '\r\n'
                self._save_file(self.original_path, self._original_lines)
                result = dict(entry)
                result['_source'] = 'rathena'
                return result

        # Check import
        for entry in self._import_entries:
            if entry['_line_index'] == line_index:
                entry.update(updated_data)
                self._import_lines[entry['_line_index']] = _entry_to_csv(entry) + '\r\n'
                self._save_file(self.import_path, self._import_lines)
                result = dict(entry)
                result['_source'] = 'custom'
                return result

        return None

    def add_entry(self, entry_data: dict) -> dict:
        """
        Add a new skill entry.
        - If mob exists in original rAthena db → append to original file.
        - Otherwise → append to import file.
        """
        mob_id = int(entry_data.get('mob_id', 0))
        csv_line = _entry_to_csv(entry_data) + '\r\n'

        if self._is_rathena_mob(mob_id):
            line_index = len(self._original_lines)
            self._original_lines.append(csv_line)
            entry_data['_line_index'] = line_index
            entry_data['_source'] = 'rathena'
            self._original_entries.append(dict(entry_data))
            self._save_file(self.original_path, self._original_lines)
        else:
            if not os.path.exists(self.import_path):
                os.makedirs(os.path.dirname(self.import_path), exist_ok=True)
                header = '// Mob Skill Database — Custom Import\r\n// MobID,DummyName,State,SkillID,SkillLv,Rate,CastTime,Delay,Cancelable,Target,ConditionType,ConditionValue,Val1,Val2,Val3,Val4,Val5,Emotion,Chat\r\n'
                self._import_lines = [header]
                with open(self.import_path, 'w', encoding='utf-8', newline='\r\n') as f:
                    f.write(header)

            line_index = len(self._import_lines)
            self._import_lines.append(csv_line)
            entry_data['_line_index'] = line_index
            entry_data['_source'] = 'custom'
            self._import_entries.append(dict(entry_data))
            self._save_file(self.import_path, self._import_lines)

        self.entries_loaded += 1
        return entry_data

    def delete_entry(self, line_index: int, source: str) -> bool:
        """Delete an entry by replacing its line with a comment."""
        if source == 'rathena':
            if line_index < len(self._original_lines):
                original_line = self._original_lines[line_index].rstrip()
                self._original_lines[line_index] = f'// [DELETED] {original_line}\r\n'
                self._save_file(self.original_path, self._original_lines)
                self._original_entries = [e for e in self._original_entries if e['_line_index'] != line_index]
                return True
        else:
            if line_index < len(self._import_lines):
                original_line = self._import_lines[line_index].rstrip()
                self._import_lines[line_index] = f'// [DELETED] {original_line}\r\n'
                self._save_file(self.import_path, self._import_lines)
                self._import_entries = [e for e in self._import_entries if e['_line_index'] != line_index]
                return True
        return False


mob_skill_db = MobSkillDatabase()
