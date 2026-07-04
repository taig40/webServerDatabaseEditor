"""quest_parser.py — Quest DB parser (quest_db.yml)."""

from app.services.generic_parser import GenericYamlParser


class QuestDatabase(GenericYamlParser):
    _id_key = 'Id'
    _import_filename = 'quest_db.yml'
    _label = 'quests'
    _header_type = 'QUEST_DB'
    _header_version = 3

    def get_quests(self):
        return self.get_all()

    def get_quest(self, quest_id: int):
        return self.get_by_id(quest_id)

    def update_quest(self, quest_id: int, updated_data: dict):
        return self.update_entry(quest_id, updated_data)

    def add_quest(self, quest_data: dict):
        return self.add_entry(quest_data)


quest_db = QuestDatabase()
