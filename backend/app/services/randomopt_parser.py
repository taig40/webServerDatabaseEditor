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
        self.laphine_file_path = ""
        
        self.options_data: List[Dict[str, Any]] = []
        self.groups_data: List[Dict[str, Any]] = []
        
        self.raw_options_yaml = None
        self.raw_groups_yaml = None
        self.raw_laphine_yaml = None

    def initialize(self, force=False):
        if self.groups_data and not force:
            return

        db_base = os.environ.get("SERVER_DB_BASE_PATH", "").strip()
        if not db_base:
            item_db = os.environ.get("ITEM_DB_PATH", "").strip()
            if item_db and "/re/" in item_db.replace("\\", "/"):
                db_base = item_db.replace("\\", "/").split("/re/")[0]
            elif item_db and "/pre-re/" in item_db.replace("\\", "/"):
                db_base = item_db.replace("\\", "/").split("/pre-re/")[0]
        
        if not db_base:
            return
            
        self.db_base_path = db_base.replace("\\", "/")
        
        # Paths
        mode = "re" if os.path.exists(f"{self.db_base_path}/re/item_randomopt_db.yml") else ("pre-re" if os.path.exists(f"{self.db_base_path}/pre-re/item_randomopt_db.yml") else "re")
        self.options_file_path = f"{self.db_base_path}/{mode}/item_randomopt_db.yml"
        self.groups_file_path = f"{self.db_base_path}/{mode}/item_randomopt_group.yml"
        self.laphine_file_path = f"{self.db_base_path}/{mode}/laphine_upgrade.yml"
        
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

        # Load laphine upgrade
        if os.path.exists(self.laphine_file_path):
            try:
                with open(self.laphine_file_path, "r", encoding="utf-8") as f:
                    self.raw_laphine_yaml = self.yaml.load(f)
            except Exception as e:
                print(f"[!] Error reading laphine_upgrade YAML: {e}")
                
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

        # 2. Parse Laphine mapping: group_name.upper() -> laphine_info
        laphine_map: Dict[str, Dict[str, Any]] = {}
        if self.raw_laphine_yaml and "Body" in self.raw_laphine_yaml:
            l_body = self.raw_laphine_yaml["Body"]
            if isinstance(l_body, list):
                for entry in l_body:
                    if isinstance(entry, dict) and "RandomOptionGroup" in entry:
                        group_key = str(entry["RandomOptionGroup"]).strip().upper()
                        target_items = []
                        raw_targets = entry.get("TargetItems", [])
                        if isinstance(raw_targets, list):
                            for t in raw_targets:
                                if isinstance(t, dict) and "Item" in t:
                                    target_items.append({"Item": str(t["Item"])})
                                elif isinstance(t, str):
                                    target_items.append({"Item": t})
                        laphine_map[group_key] = {
                            "Item": entry.get("Item", ""),
                            "RequiredRandomOptions": entry.get("RequiredRandomOptions", 0),
                            "ResultRefine": entry.get("ResultRefine", None),
                            "TargetItems": target_items
                        }

        # 3. Parse Groups with JOIN
        if self.raw_groups_yaml and "Body" in self.raw_groups_yaml:
            body = self.raw_groups_yaml["Body"]
            if isinstance(body, list):
                for item in body:
                    if isinstance(item, dict) and "Id" in item and "Group" in item:
                        group_name = str(item["Group"]).strip()
                        
                        # Extract detailed Slots
                        parsed_slots = []
                        slots = item.get("Slots", [])
                        if isinstance(slots, list):
                            for s in slots:
                                if isinstance(s, dict):
                                    opts_list = []
                                    for opt in s.get("Options", []):
                                        if isinstance(opt, dict):
                                            opts_list.append({
                                                "Option": opt.get("Option", ""),
                                                "MinValue": opt.get("MinValue", 1),
                                                "MaxValue": opt.get("MaxValue", 1),
                                                "Param": opt.get("Param", 0),
                                                "Chance": opt.get("Chance", 0)
                                            })
                                    parsed_slots.append({
                                        "Slot": s.get("Slot", len(parsed_slots) + 1),
                                        "Options": opts_list
                                    })
                        
                        # Extract detailed Random options pool
                        parsed_random = []
                        random_opts = item.get("Random", [])
                        if isinstance(random_opts, list):
                            for opt in random_opts:
                                if isinstance(opt, dict):
                                    parsed_random.append({
                                        "Option": opt.get("Option", ""),
                                        "MinValue": opt.get("MinValue", 1),
                                        "MaxValue": opt.get("MaxValue", 1),
                                        "Param": opt.get("Param", 0),
                                        "Chance": opt.get("Chance", 0)
                                    })

                        # Flat options list for compatibility
                        flat_opts = []
                        for s in parsed_slots:
                            for o in s["Options"]:
                                flat_opts.append({"Option": o["Option"], "Chance": o["Chance"]})
                        if not flat_opts:
                            for o in parsed_random:
                                flat_opts.append({"Option": o["Option"], "Chance": o["Chance"]})

                        # Laphine relational JOIN
                        laphine_entry = laphine_map.get(group_name.upper(), {
                            "Item": "",
                            "RequiredRandomOptions": 0,
                            "ResultRefine": None,
                            "TargetItems": []
                        })

                        self.groups_data.append({
                            "Id": item["Id"],
                            "Group": group_name,
                            "Slots": parsed_slots,
                            "MaxRandom": item.get("MaxRandom", 0),
                            "Random": parsed_random,
                            "Options": flat_opts,
                            "LaphineData": laphine_entry
                        })

    def save_groups(self, groups_list: list) -> bool:
        """
        Salva uma lista de grupos (compatibilidade ou save global).
        Pode receber objetos simples ou unificados (com LaphineData).
        """
        if not self.raw_groups_yaml:
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
            
        existing_yaml_map = {g["Id"]: g for g in body if isinstance(g, dict) and "Id" in g}
        
        new_body = []
        for g_input in groups_list:
            gid = g_input.get("Id")
            gname = g_input.get("Group", f"Group_{gid}")
            
            # Formatar slots e random
            parsed_slots = g_input.get("Slots")
            parsed_random = g_input.get("Random")
            max_random = g_input.get("MaxRandom", 0)

            # Fallback para estrutura antiga (apenas g_input["Options"])
            if parsed_slots is None and parsed_random is None:
                gopts = g_input.get("Options", [])
                parsed_slots = [{
                    "Slot": 1,
                    "Options": [
                        {
                            "Option": o.get("Option"),
                            "MinValue": 1,
                            "MaxValue": 5,
                            "Chance": o.get("Chance", 0)
                        } for o in gopts
                    ]
                }]
                parsed_random = []

            if gid in existing_yaml_map:
                yaml_group = existing_yaml_map[gid]
                yaml_group["Group"] = gname
                if parsed_slots is not None:
                    yaml_group["Slots"] = parsed_slots
                if max_random is not None:
                    yaml_group["MaxRandom"] = max_random
                if parsed_random is not None and len(parsed_random) > 0:
                    yaml_group["Random"] = parsed_random
                elif "Random" in yaml_group and not parsed_random:
                    del yaml_group["Random"]
                new_body.append(yaml_group)
            else:
                new_group = {
                    "Id": gid,
                    "Group": gname,
                    "Slots": parsed_slots or [],
                    "MaxRandom": max_random or 0
                }
                if parsed_random and len(parsed_random) > 0:
                    new_group["Random"] = parsed_random
                new_body.append(new_group)

        self.raw_groups_yaml["Body"] = new_body
        
        try:
            os.makedirs(os.path.dirname(self.groups_file_path), exist_ok=True)
            with open(self.groups_file_path, "w", encoding="utf-8") as f:
                self.yaml.dump(self.raw_groups_yaml, f)
            
            # Atualizar laphine_upgrade.yml se houver LaphineData em algum grupo
            self._sync_laphine_data(groups_list)
            
            self.initialize(force=True)
            return True
        except Exception as e:
            print(f"[!] Error writing groups YAML: {e}")
            return False

    def _sync_laphine_data(self, groups_list: list):
        if not self.laphine_file_path:
            return

        if not self.raw_laphine_yaml:
            self.raw_laphine_yaml = {
                "Header": {
                    "Type": "LAPHINE_UPGRADE_DB",
                    "Version": 1
                },
                "Body": []
            }

        body = self.raw_laphine_yaml.get("Body")
        if not isinstance(body, list):
            self.raw_laphine_yaml["Body"] = []
            body = self.raw_laphine_yaml["Body"]

        for g_input in groups_list:
            if "LaphineData" not in g_input or g_input["LaphineData"] is None:
                continue
            
            group_name = str(g_input.get("Group", "")).strip()
            if not group_name:
                continue

            laphine_data = g_input["LaphineData"]
            trigger_item = str(laphine_data.get("Item", "")).strip()
            req_opts = laphine_data.get("RequiredRandomOptions", 0)
            res_refine = laphine_data.get("ResultRefine", None)
            targets = laphine_data.get("TargetItems", [])

            # Normalizar TargetItems para [{"Item": name}, ...]
            norm_targets = []
            for t in targets:
                if isinstance(t, dict) and "Item" in t and str(t["Item"]).strip():
                    norm_targets.append({"Item": str(t["Item"]).strip()})
                elif isinstance(t, str) and t.strip():
                    norm_targets.append({"Item": t.strip()})

            existing_entry = None
            for entry in body:
                if isinstance(entry, dict) and str(entry.get("RandomOptionGroup", "")).strip().upper() == group_name.upper():
                    existing_entry = entry
                    break

            if trigger_item or norm_targets:
                if existing_entry:
                    if trigger_item:
                        existing_entry["Item"] = trigger_item
                    existing_entry["RandomOptionGroup"] = group_name
                    if res_refine is not None and res_refine != "":
                        existing_entry["ResultRefine"] = int(res_refine)
                    elif "ResultRefine" in existing_entry:
                        del existing_entry["ResultRefine"]
                    if req_opts and int(req_opts) > 0:
                        existing_entry["RequiredRandomOptions"] = int(req_opts)
                    elif "RequiredRandomOptions" in existing_entry:
                        del existing_entry["RequiredRandomOptions"]
                    existing_entry["TargetItems"] = norm_targets
                else:
                    new_entry = {
                        "Item": trigger_item or "Applicator_Item",
                        "RandomOptionGroup": group_name
                    }
                    if res_refine is not None and res_refine != "":
                        new_entry["ResultRefine"] = int(res_refine)
                    if req_opts and int(req_opts) > 0:
                        new_entry["RequiredRandomOptions"] = int(req_opts)
                    new_entry["TargetItems"] = norm_targets
                    body.append(new_entry)
            else:
                # Se não tem trigger e não tem targets, remover caso exista
                if existing_entry in body:
                    body.remove(existing_entry)

        try:
            os.makedirs(os.path.dirname(self.laphine_file_path), exist_ok=True)
            with open(self.laphine_file_path, "w", encoding="utf-8") as f:
                self.yaml.dump(self.raw_laphine_yaml, f)
        except Exception as e:
            print(f"[!] Error writing laphine_upgrade YAML: {e}")

    def save_unified_group(self, group_data: Dict[str, Any]) -> bool:
        """
        Salva ou atualiza um único grupo unificado nos dois arquivos YAML.
        """
        gid = group_data.get("Id")
        existing_idx = -1
        for idx, g in enumerate(self.groups_data):
            if g.get("Id") == gid:
                existing_idx = idx
                break

        updated_list = list(self.groups_data)
        if existing_idx >= 0:
            updated_list[existing_idx] = group_data
        else:
            updated_list.append(group_data)

        return self.save_groups(updated_list)

randomopt_db = RandomOptParser()

