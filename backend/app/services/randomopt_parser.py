import os
from ruamel.yaml import YAML
from typing import List, Dict, Any, Optional

class RandomOptParser:
    def __init__(self):
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.indent(mapping=2, sequence=4, offset=2)
        
        self.db_base_path = ""
        self.options_file_path = ""
        self.groups_file_path = ""
        
        self.options_data: List[Dict[str, Any]] = []
        self.groups_data: List[Dict[str, Any]] = []
        
        self.raw_options_yaml = None
        self.raw_groups_yaml = None

    def initialize(self):
        db_base = os.environ.get("SERVER_DB_BASE_PATH", "").strip()
        if not db_base:
            return
        
        self.db_base_path = db_base.replace("\\", "/")
        
        # Paths
        self.options_file_path = f"{self.db_base_path}/re/item_randomopt_db.yml"
        self.groups_file_path = f"{self.db_base_path}/re/item_randomopt_group.yml"
        
        # Load options
        if os.path.exists(self.options_file_path):
            try:
                with open(self.options_file_path, "r", encoding="utf-8") as f:
                    self.raw_options_yaml = self.yaml.load(f)
            except Exception as e:
                print(f"[!] Error reading options YAML: {e}")
                
        # Load groups
        if os.path.exists(self.groups_file_path):
            try:
                with open(self.groups_file_path, "r", encoding="utf-8") as f:
                    self.raw_groups_yaml = self.yaml.load(f)
            except Exception as e:
                print(f"[!] Error reading groups YAML: {e}")
                
        self.parse_data()

    def parse_data(self):
        self.options_data = []
        self.groups_data = []
        
        # 1. Parse Options
        if self.raw_options_yaml and "Body" in self.raw_options_yaml:
            body = self.raw_options_yaml["Body"]
            if isinstance(body, list):
                for item in body:
                    if isinstance(item, dict) and "Id" in item and "Option" in item:
                        self.options_data.append({
                            "Id": item["Id"],
                            "Option": item["Option"]
                        })
                        
        # 2. Parse Groups
        if self.raw_groups_yaml and "Body" in self.raw_groups_yaml:
            body = self.raw_groups_yaml["Body"]
            if isinstance(body, list):
                for item in body:
                    if isinstance(item, dict) and "Id" in item and "Group" in item:
                        # Extract option list with Chance
                        flat_opts = []
                        slots = item.get("Slots", [])
                        if isinstance(slots, list):
                            for s in slots:
                                if isinstance(s, dict):
                                    opts_list = s.get("Options", [])
                                    if isinstance(opts_list, list):
                                        for opt in opts_list:
                                            if isinstance(opt, dict):
                                                flat_opts.append({
                                                    "Option": opt.get("Option"),
                                                    "Chance": opt.get("Chance", 0)
                                                })
                        
                        # Fallback to Random options if Slots is empty
                        if not flat_opts:
                            random_opts = item.get("Random", [])
                            if isinstance(random_opts, list):
                                for opt in random_opts:
                                    if isinstance(opt, dict):
                                        flat_opts.append({
                                            "Option": opt.get("Option"),
                                            "Chance": opt.get("Chance", 0)
                                        })
                                        
                        self.groups_data.append({
                            "Id": item["Id"],
                            "Group": item["Group"],
                            "Options": flat_opts
                        })

    def save_groups(self, groups_list: list) -> bool:
        if not self.raw_groups_yaml:
            # Create template if not exists
            self.raw_groups_yaml = {
                "Header": {
                    "Type": "RANDOM_OPTION_GROUP",
                    "Version": 1
                },
                "Body": []
            }
            
        body = self.raw_groups_yaml.get("Body")
        if not isinstance(body, list):
            self.raw_groups_yaml["Body"] = []
            body = self.raw_groups_yaml["Body"]
            
        # Create a lookup map of existing group entries in the YAML to preserve formatting/other fields (like MinValue, MaxValue)
        existing_yaml_map = {g["Id"]: g for g in body if isinstance(g, dict) and "Id" in g}
        
        new_body = []
        for g_input in groups_list:
            gid = g_input.get("Id")
            gname = g_input.get("Group")
            gopts = g_input.get("Options", [])
            
            # If group exists in raw YAML, we preserve other properties
            if gid in existing_yaml_map:
                yaml_group = existing_yaml_map[gid]
                yaml_group["Group"] = gname
                
                # We need to reconstruct Slots -> Options
                # For simplicity, if Slots exists, we update Slots[0]["Options"]
                # Else, we initialize it
                slots = yaml_group.get("Slots")
                if not isinstance(slots, list) or len(slots) == 0:
                    yaml_group["Slots"] = [{"Slot": 1, "Options": []}]
                    slots = yaml_group["Slots"]
                    
                # Map Options
                # In ruamel.yaml, we want to update the existing dicts or add new ones
                new_opts = []
                for o in gopts:
                    opt_name = o.get("Option")
                    opt_chance = o.get("Chance", 0)
                    
                    # Try to find existing option in slot to preserve MinValue/MaxValue/Param
                    existing_opt = None
                    for slot in slots:
                        for existing_o in slot.get("Options", []):
                            if isinstance(existing_o, dict) and existing_o.get("Option") == opt_name:
                                existing_opt = existing_o
                                break
                    
                    if existing_opt:
                        existing_opt["Chance"] = opt_chance
                        new_opts.append(existing_opt)
                    else:
                        new_opts.append({
                            "Option": opt_name,
                            "MinValue": 1,  # sensible default
                            "MaxValue": 5,  # sensible default
                            "Chance": opt_chance
                        })
                
                slots[0]["Options"] = new_opts
                new_body.append(yaml_group)
            else:
                # Completely new group
                new_yaml_group = {
                    "Id": gid,
                    "Group": gname,
                    "Slots": [
                        {
                            "Slot": 1,
                            "Options": [
                                {
                                    "Option": o.get("Option"),
                                    "MinValue": 1,
                                    "MaxValue": 5,
                                    "Chance": o.get("Chance", 0)
                                } for o in gopts
                            ]
                        }
                    ],
                    "MaxRandom": 0
                }
                new_body.append(new_yaml_group)
                
        # Re-assign body and write back to file
        self.raw_groups_yaml["Body"] = new_body
        
        target_path = self.groups_file_path
        
        try:
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with open(target_path, "w", encoding="utf-8") as f:
                self.yaml.dump(self.raw_groups_yaml, f)
            self.initialize()  # re-parse to sync memory
            return True
        except Exception as e:
            print(f"[!] Error writing groups YAML: {e}")
            return False

randomopt_db = RandomOptParser()
