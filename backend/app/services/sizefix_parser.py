import os
from ruamel.yaml import YAML
from typing import List, Dict, Any

WEAPON_TYPES = [
    "Barehand",
    "Dagger",
    "Sword",
    "TwoHandSword",
    "Spear",
    "TwoHandSpear",
    "Axe",
    "TwoHandAxe",
    "Mace",
    "TwoHandMace",
    "Staff",
    "TwoHandStaff",
    "Bow",
    "Knuckle",
    "Musical",
    "Whip",
    "Book",
    "Katar",
    "Revolver",
    "Rifle",
    "Gatling",
    "Shotgun",
    "Grenade",
    "Huuma"
]

class SizeFixParser:
    def __init__(self):
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.indent(mapping=2, sequence=4, offset=2)
        
        self.db_base_path = ""
        self.filepath = ""
        self.raw_yaml = None
        self.matrix_data: List[Dict[str, Any]] = []

    def initialize(self):
        db_base = os.environ.get("SERVER_DB_BASE_PATH", "").strip()
        if not db_base:
            return
        
        self.db_base_path = db_base.replace("\\", "/")
        mode = "re" if os.path.exists(f"{self.db_base_path}/re/size_fix.yml") else ("pre-re" if os.path.exists(f"{self.db_base_path}/pre-re/size_fix.yml") else "re")
        self.filepath = f"{self.db_base_path}/{mode}/size_fix.yml"
        
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    self.raw_yaml = self.yaml.load(f)
            except Exception as e:
                print(f"[!] Error reading size_fix YAML: {e}")
                
        self.parse_data()

    def parse_data(self):
        self.matrix_data = []
        
        # Load values from loaded YAML
        yaml_map = {}
        if self.raw_yaml and "Body" in self.raw_yaml:
            body = self.raw_yaml["Body"]
            if isinstance(body, list):
                for item in body:
                    if isinstance(item, dict) and "Weapon" in item:
                        yaml_map[item["Weapon"]] = item
                        
        # Construct the complete list with defaults
        for w in WEAPON_TYPES:
            entry = yaml_map.get(w, {})
            self.matrix_data.append({
                "Weapon": w,
                "Small": entry.get("Small", 100),
                "Medium": entry.get("Medium", 100),
                "Large": entry.get("Large", 100)
            })

    def save_matrix(self, matrix_list: list) -> bool:
        if not self.raw_yaml:
            self.raw_yaml = {
                "Header": {
                    "Type": "SIZE_FIX_DB",
                    "Version": 1
                },
                "Body": []
            }
            
        new_body = []
        for entry in matrix_list:
            wname = entry.get("Weapon")
            small = entry.get("Small", 100)
            medium = entry.get("Medium", 100)
            large = entry.get("Large", 100)
            
            # If all are 100, we omit it from the file to keep it clean (as default is 100)
            if small == 100 and medium == 100 and large == 100:
                continue
                
            yaml_entry = {"Weapon": wname}
            if small != 100:
                yaml_entry["Small"] = small
            if medium != 100:
                yaml_entry["Medium"] = medium
            if large != 100:
                yaml_entry["Large"] = large
                
            new_body.append(yaml_entry)
            
        self.raw_yaml["Body"] = new_body
        
        try:
            os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
            with open(self.filepath, "w", encoding="utf-8") as f:
                self.yaml.dump(self.raw_yaml, f)
            self.initialize()  # sync back
            return True
        except Exception as e:
            print(f"[!] Error writing size_fix YAML: {e}")
            return False

sizefix_db = SizeFixParser()
