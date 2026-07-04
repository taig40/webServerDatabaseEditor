"""pet_parser.py — Pet DB parser (pet_db.yml)."""

from app.services.generic_parser import GenericYamlParser


class PetDatabase(GenericYamlParser):
    _id_key = 'Mob'
    _import_filename = 'pet_db.yml'
    _label = 'pets'
    _header_type = 'PET_DB'
    _header_version = 1

    def get_pets(self):
        return self.get_all()

    def get_pet(self, mob: str):
        return self.get_by_id(mob)

    def update_pet(self, mob: str, updated_data: dict):
        return self.update_entry(mob, updated_data)

    def add_pet(self, pet_data: dict):
        return self.add_entry(pet_data)


pet_db = PetDatabase()
