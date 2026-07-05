"""
mob_skill_parser.py -- Parser for mob_skill_db.txt (CSV format).

Format per line (non-comment, non-empty):
  MobID, DummyName, State, SkillID, SkillLv, Rate, CastTime, Delay,
  Cancelable, Target, ConditionType, ConditionValue,
  Val1, Val2, Val3, Val4, Val5, Emotion, Chat

Save rules:
  - Editing a skill of an existing rAthena mob  -> overwrite the ORIGINAL file
  - Adding a new skill entry for a new mob       -> write to db/import/mob_skill_db.txt
"""

import os
import threading
from typing import Optional
from app.core.config import cfg


FIELDS = [
    'mob_id', 'dummy_name', 'state', 'skill_id', 'skill_lv',
    'rate', 'cast_time', 'delay', 'cancelable', 'target',
    'condition_type', 'condition_value',
    'val1', 'val2', 'val3', 'val4', 'val5',
    'emotion', 'chat',
]

# Only these fields are editable and should be updated on save.
_EDITABLE_FIELDS = set(FIELDS)


def _parse_line(line: str, line_index: int) -> Optional[dict]:
    """Parse a single CSV line into a dict. Returns None for comments/blanks."""
    stripped = line.rstrip('\n\r')
    if not stripped or stripped.lstrip().startswith('//'):
        return None
    if '//' in stripped:
        stripped = stripped[:stripped.index('//')].rstrip()
    parts = [p.strip() for p in stripped.split(',')]
    if len(parts) < 12:
        return None
    entry = {'_line_index': line_index, '_raw': stripped}
    for i, field in enumerate(FIELDS):
        entry[field] = parts[i] if i < len(parts) else ''
    for f in ('mob_id', 'skill_id', 'skill_lv', 'rate', 'cast_time', 'delay',
              'condition_value', 'val1', 'val2', 'val3', 'val4', 'val5'):
        try:
            entry[f] = int(entry[f]) if entry[f] != '' else 0
        except (ValueError, TypeError):
            entry[f] = 0
    try:
        raw_emotion = entry.get('emotion', '')
        entry['emotion'] = int(raw_emotion) if (raw_emotion != '' and raw_emotion is not None) else -1
    except (ValueError, TypeError):
        entry['emotion'] = -1
    entry['cancelable'] = entry.get('cancelable', 'no').lower() in ('yes', '1', 'true')
    return entry


def _val_str(v) -> str:
    if v is None or v == 0 or v == '' or v == '0':
        return ''
    try:
        return str(int(v))
    except (ValueError, TypeError):
        return ''


def _entry_to_csv(e: dict) -> str:
    cancelable = 'yes' if e.get('cancelable') else 'no'
    emotion_raw = e.get('emotion', -1)
    try:
        emotion_int = int(emotion_raw)
    except (ValueError, TypeError):
        emotion_int = -1
    emotion_str = '' if emotion_int < 0 else str(emotion_int)
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
        _val_str(e.get('val1', 0)),
        _val_str(e.get('val2', 0)),
        _val_str(e.get('val3', 0)),
        _val_str(e.get('val4', 0)),
        _val_str(e.get('val5', 0)),
        emotion_str,
        str(e.get('chat', '')),
    ]
    return ','.join(parts)


class MobSkillDatabase:
    def __init__(self):
        self.rathena_root = ''
        self.original_path = ''
        self.import_path = ''
        self._original_entries: list = []
        self._import_entries: list = []
        self._original_lines: list = []
        self._import_lines: list = []
        self.is_loading = False
        self.loading_status = 'Aguardando inicializacao...'
        self.entries_loaded = 0

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
            self.loading_status = f'Arquivo nao encontrado: {filepath}'
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
        with open(filepath, 'r', encoding=cfg.server_encoding, errors='replace') as f:
            for i, line in enumerate(f):
                lines.append(line)
                entry = _parse_line(line, i)
                if entry is not None:
                    entries.append(entry)
        return lines, entries

    def get_all(self) -> list:
        result = []
        for e in self._original_entries:
            a = dict(e); a['_source'] = 'rathena'; result.append(a)
        for e in self._import_entries:
            a = dict(e); a['_source'] = 'custom'; result.append(a)
        return result

    def get_by_mob(self, mob_id: int) -> list:
        return [e for e in self.get_all() if e.get('mob_id') == mob_id]

    def _is_rathena_mob(self, mob_id: int) -> bool:
        return any(e['mob_id'] == mob_id for e in self._original_entries)

    def _save_file(self, filepath: str, lines: list):
        with open(filepath, 'w', encoding=cfg.server_encoding, newline='\r\n') as f:
            f.writelines(lines)

    def _apply_update(self, entry: dict, updated_data: dict):
        """Apply only editable fields; preserve _line_index, _source, _raw."""
        for field in _EDITABLE_FIELDS:
            if field not in updated_data:
                continue
            val = updated_data[field]
            if field in ('mob_id', 'skill_id', 'skill_lv', 'rate', 'cast_time',
                         'delay', 'condition_value', 'val1', 'val2', 'val3',
                         'val4', 'val5', 'emotion'):
                try:
                    entry[field] = int(val) if val not in ('', None) else (
                        -1 if field == 'emotion' else 0)
                except (ValueError, TypeError):
                    entry[field] = -1 if field == 'emotion' else 0
            elif field == 'cancelable':
                if isinstance(val, bool):
                    entry[field] = val
                else:
                    entry[field] = str(val).lower() in ('yes', '1', 'true')
            else:
                entry[field] = str(val) if val is not None else ''

    def update_entry(self, line_index: int, updated_data: dict) -> Optional[dict]:
        for entry in self._original_entries:
            if entry['_line_index'] == line_index:
                self._apply_update(entry, updated_data)
                self._original_lines[line_index] = _entry_to_csv(entry) + '\r\n'
                self._save_file(self.original_path, self._original_lines)
                result = dict(entry); result['_source'] = 'rathena'
                return result
        for entry in self._import_entries:
            if entry['_line_index'] == line_index:
                original_line_idx = entry['_line_index']
                self._apply_update(entry, updated_data)
                entry['_line_index'] = original_line_idx
                self._import_lines[original_line_idx] = _entry_to_csv(entry) + '\r\n'
                self._save_file(self.import_path, self._import_lines)
                result = dict(entry); result['_source'] = 'custom'
                return result
        return None

    def add_entry(self, entry_data: dict) -> dict:
        mob_id = int(entry_data.get('mob_id', 0))

        def _safe_int(key, default=0):
            try:
                v = entry_data.get(key, default)
                return int(v) if v not in ('', None) else default
            except (ValueError, TypeError):
                return default

        clean: dict = {
            'mob_id': mob_id,
            'dummy_name': str(entry_data.get('dummy_name', '')),
            'state': str(entry_data.get('state', 'idle')),
            'skill_id': _safe_int('skill_id', 1),
            'skill_lv': _safe_int('skill_lv', 1),
            'rate': _safe_int('rate', 1000),
            'cast_time': _safe_int('cast_time', 0),
            'delay': _safe_int('delay', 5000),
            'cancelable': bool(entry_data.get('cancelable', False)),
            'target': str(entry_data.get('target', 'target')),
            'condition_type': str(entry_data.get('condition_type', 'always')),
            'condition_value': _safe_int('condition_value', 0),
            'val1': _safe_int('val1', 0),
            'val2': _safe_int('val2', 0),
            'val3': _safe_int('val3', 0),
            'val4': _safe_int('val4', 0),
            'val5': _safe_int('val5', 0),
            'emotion': _safe_int('emotion', -1),
            'chat': str(entry_data.get('chat', '')),
        }
        csv_line = _entry_to_csv(clean) + '\r\n'
        if self._is_rathena_mob(mob_id):
            line_index = len(self._original_lines)
            self._original_lines.append(csv_line)
            clean['_line_index'] = line_index
            clean['_source'] = 'rathena'
            self._original_entries.append(dict(clean))
            self._save_file(self.original_path, self._original_lines)
        else:
            if not os.path.exists(self.import_path):
                os.makedirs(os.path.dirname(self.import_path), exist_ok=True)
                header = '// Mob Skill Database - Custom Import\r\n// MobID,DummyName,State,SkillID,SkillLv,Rate,CastTime,Delay,Cancelable,Target,ConditionType,ConditionValue,Val1,Val2,Val3,Val4,Val5,Emotion,Chat\r\n'
                self._import_lines = [header]
                with open(self.import_path, 'w', encoding=cfg.server_encoding, newline='\r\n') as f:
                    f.write(header)
            line_index = len(self._import_lines)
            self._import_lines.append(csv_line)
            clean['_line_index'] = line_index
            clean['_source'] = 'custom'
            self._import_entries.append(dict(clean))
            self._save_file(self.import_path, self._import_lines)
        self.entries_loaded += 1
        return clean

    def delete_entry(self, line_index: int, source: str) -> bool:
        if source == 'rathena':
            if line_index < len(self._original_lines):
                orig = self._original_lines[line_index].rstrip()
                self._original_lines[line_index] = f'// [DELETED] {orig}\r\n'
                self._save_file(self.original_path, self._original_lines)
                self._original_entries = [e for e in self._original_entries if e['_line_index'] != line_index]
                return True
        else:
            if line_index < len(self._import_lines):
                orig = self._import_lines[line_index].rstrip()
                self._import_lines[line_index] = f'// [DELETED] {orig}\r\n'
                self._save_file(self.import_path, self._import_lines)
                self._import_entries = [e for e in self._import_entries if e['_line_index'] != line_index]
                return True
        return False


mob_skill_db = MobSkillDatabase()
