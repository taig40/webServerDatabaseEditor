"""skill_parser.py — Skill DB parser (skill_db.yml)."""

from app.services.generic_parser import GenericYamlParser


class SkillDatabase(GenericYamlParser):
    _id_key = 'Id'
    _import_filename = 'skill_db.yml'
    _label = 'skills'
    _header_type = 'SKILL_DB'
    _header_version = 4

    def get_skills(self):
        return self.get_all()

    def get_skill(self, skill_id: int):
        return self.get_by_id(skill_id)

    def update_skill(self, skill_id: int, updated_data: dict):
        return self.update_entry(skill_id, updated_data)

    def create_skill(self, skill_data: dict) -> dict:
        result = self.add_entry(skill_data)
        result['_source'] = 'custom'
        return result

    def delete_skill(self, skill_id: int) -> bool:
        """
        Remove permanentemente uma habilidade do arquivo YAML em que reside.

        Guard de Segurança (SRP):
        - Apenas habilidades que vivem em db/import/ podem ser excluídas.
        - Habilidades do banco oficial do rAthena (db/re/ ou db/pre-re/) lançam
          PermissionError que a rota da API converte em HTTP 403.

        Retorna True em caso de sucesso, False se a habilidade não foi encontrada.
        """
        if skill_id not in self.entry_index:
            return False

        filepath = self.entry_index[skill_id]
        norm_path = filepath.replace('\\', '/')

        if '/db/import/' not in norm_path:
            raise PermissionError(
                f"A habilidade {skill_id} reside em '{norm_path}' que faz parte do banco "
                "oficial do rAthena. Somente habilidades em db/import/ podem ser excluídas."
            )

        data = self.db_cache.get(filepath)
        if not data:
            return False

        body = data.get('Body', [])
        original_len = len(body)

        data['Body'] = [skill for skill in body if skill.get('Id') != skill_id]

        if len(data['Body']) == original_len:
            del self.entry_index[skill_id]
            return False

        self.save_file(filepath)
        del self.entry_index[skill_id]
        return True


skill_db = SkillDatabase()
