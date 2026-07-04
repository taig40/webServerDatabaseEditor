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


skill_db = SkillDatabase()
