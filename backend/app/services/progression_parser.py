"""progression_parser.py — Parsers and managers for the rAthena job/progression YAML files.

Handles:

- ``job_stats.yml``: Job attribute modifiers.
- ``job_basepoints.yml``: HP/SP/AP base points per job.
- ``job_exp.yml``: Base and Job experience tables.
- ``skill_tree.yml``: Skill tree and prerequisites.

All parsers use ``ruamel.yaml`` to preserve original comments and formatting.
"""

import os
import threading
from ruamel.yaml import YAML
from typing import List, Dict, Any, Optional

TRANSCENDENT_JOBS = {
    "Swordman_High", "Mage_High", "Archer_High", "Acolyte_High", "Merchant_High", "Thief_High",
    "Novice_High", "Lord_Knight", "High_Priest", "High_Wizard", "Whitesmith", "Sniper",
    "Assassin_Cross", "Paladin", "Champion", "Professor", "Stalker", "Creator", "Clown", "Gypsy",
    "Lord_Knight2", "Paladin2", "Rune_Knight_T", "Rune_Knight_T2", "Warlock_T", "Ranger_T", "Ranger_T2",
    "Arch_Bishop_T", "Mechanic_T", "Mechanic_T2", "Guillotine_Cross_T", "Royal_Guard_T", "Royal_Guard_T2",
    "Sorcerer_T", "Minstrel_T", "Wanderer_T", "Sura_T", "Genetic_T", "Shadow_Chaser_T",
    "Dragon_Knight_T", "Arch_Mage_T", "Windhawk_T", "Cardinal_T", "Meister_T", "Shadow_Cross_T",
    "Imperial_Guard_T", "Elemental_Master_T", "Troubadour_T", "Trouvere_T", "Inquisitor_T",
    "Biolo_T", "Abyss_Chaser_T"
}

def is_alternate_sprite(job_name: str) -> bool:
    """Returns ``True`` if the job class is an alternate outfit/secondary costume variant.

    Alternate sprites are identified by the suffixes ``_2nd``, ``_3rd``,
    ``_Alternate``, or ``_Alt``.

    Args:
        job_name: rAthena job constant string.

    Returns:
        bool: ``True`` for alternate sprites, ``False`` otherwise.
    """
    if not job_name or not isinstance(job_name, str):
        return False
    if job_name.endswith("_2nd") or job_name.endswith("_3rd") or job_name.endswith("_Alternate") or job_name.endswith("_Alt"):
        return True
    return False

def classify_job_category(job_name: str) -> str:
    """Classifies a job class into one of three tier categories.

    Categories:

    - ``"Baby"``: Baby or Super_Baby classes.
    - ``"Transcendent"``: High/rebirth classes, Transcendent suffixed jobs, and 4th-gen trans.
    - ``"Non-Transcendent"``: All other job classes.

    Args:
        job_name: rAthena job constant string.

    Returns:
        str: One of ``"Baby"``, ``"Transcendent"``, or ``"Non-Transcendent"``.
    """
    if not job_name or not isinstance(job_name, str):
        return "Non-Transcendent"
    if job_name.startswith("Baby") or job_name == "Super_Baby" or "Baby_" in job_name:
        return "Baby"
    if job_name.endswith("_High") or job_name.endswith("_T") or job_name.endswith("_T2") or job_name in TRANSCENDENT_JOBS:
        return "Transcendent"
    return "Non-Transcendent"

class BaseProgressionParser:
    """Base class for progression and job YAML parsers.

    Configures ``ruamel.yaml`` to preserve quotes, comments, and original server
    formatting while allowing duplicate keys where needed by rAthena syntax.

    Attributes:
        default_filename: Target YAML filename (e.g. ``job_stats.yml``).
        filepath: Resolved absolute path to the loaded YAML file.
        raw_data: Parsed top-level dictionary from ``ruamel.yaml``.
        is_loading: Whether a background loading thread is currently active.
        loading_status: Human-readable status string for UI reporting.
    """

    def __init__(self, default_filename: str):
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.allow_duplicate_keys = True
        self.yaml.indent(mapping=2, sequence=4, offset=2)
        
        self.default_filename = default_filename
        self.filepath = ""
        self.raw_data: Optional[Dict[str, Any]] = None
        self.is_loading = False
        self.loading_status = "Não inicializado"
        self.lock = threading.Lock()

    def _resolve_filepath(self, provided_path: Optional[str] = None) -> str:
        if provided_path and os.path.exists(provided_path):
            return provided_path.replace("\\", "/")
        
        db_base = os.environ.get("SERVER_DB_BASE_PATH", "").strip()
        if db_base:
            candidate = os.path.join(db_base, "re", self.default_filename).replace("\\", "/")
            if os.path.exists(candidate):
                return candidate
            candidate_pre = os.path.join(db_base, "pre-re", self.default_filename).replace("\\", "/")
            if os.path.exists(candidate_pre):
                return candidate_pre
            candidate_root = os.path.join(db_base, self.default_filename).replace("\\", "/")
            if os.path.exists(candidate_root):
                return candidate_root
        return ""

    def load(self, filepath: Optional[str] = None):
        target = self._resolve_filepath(filepath)
        if not target or not os.path.exists(target):
            self.loading_status = f"Arquivo não encontrado: {target or self.default_filename}"
            print(f"[!] {self.loading_status}")
            return False

        self.filepath = target
        self.is_loading = True
        self.loading_status = f"Lendo {os.path.basename(target)}..."
        try:
            with open(target, "r", encoding="utf-8") as f:
                self.raw_data = self.yaml.load(f)
            self.loading_status = "Carregado com sucesso"
            return True
        except Exception as e:
            self.loading_status = f"Erro ao ler {self.default_filename}: {e}"
            print(f"[!] {self.loading_status}")
            return False
        finally:
            self.is_loading = False

    def save(self) -> bool:
        if not self.filepath or self.raw_data is None:
            return False
        with self.lock:
            try:
                os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
                with open(self.filepath, "w", encoding="utf-8") as f:
                    self.yaml.dump(self.raw_data, f)
                return True
            except Exception as e:
                print(f"[!] Erro ao salvar {self.filepath}: {e}")
                return False


class JobStatsParser(BaseProgressionParser):
    def __init__(self):
        super().__init__("job_stats.yml")

    def get_all(self) -> List[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return []
        results = []
        for idx, entry in enumerate(self.raw_data["Body"]):
            if isinstance(entry, dict):
                copy_entry = dict(entry)
                copy_entry["_index"] = idx
                results.append(copy_entry)
        return results

    def get_by_job(self, job_name: str) -> Optional[Dict[str, Any]]:
        for idx, entry in enumerate(self.get_all()):
            jobs = entry.get("Jobs")
            if isinstance(jobs, dict) and job_name in jobs:
                return entry
            elif isinstance(jobs, list) and job_name in jobs:
                return entry
        return None

    def update_entry(self, index: int, updated_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return None
        body = self.raw_data["Body"]
        if index < 0 or index >= len(body):
            return None

        entry = body[index]
        for k, v in updated_data.items():
            if k != "_index":
                entry[k] = v

        if self.save():
            res = dict(entry)
            res["_index"] = index
            return res
        return None


class JobBasepointsParser(BaseProgressionParser):
    def __init__(self):
        super().__init__("job_basepoints.yml")

    def get_all(self) -> List[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return []
        results = []
        for idx, entry in enumerate(self.raw_data["Body"]):
            if isinstance(entry, dict):
                copy_entry = dict(entry)
                copy_entry["_index"] = idx
                results.append(copy_entry)
        return results

    def get_by_job(self, job_name: str) -> Optional[Dict[str, Any]]:
        for entry in self.get_all():
            jobs = entry.get("Jobs")
            if isinstance(jobs, dict) and job_name in jobs:
                return entry
            elif isinstance(jobs, list) and job_name in jobs:
                return entry
        return None

    def update_entry(self, index: int, updated_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return None
        body = self.raw_data["Body"]
        if index < 0 or index >= len(body):
            return None

        entry = body[index]
        for k, v in updated_data.items():
            if k != "_index":
                entry[k] = v

        if self.save():
            res = dict(entry)
            res["_index"] = index
            return res
        return None


class JobExpParser(BaseProgressionParser):
    def __init__(self):
        super().__init__("job_exp.yml")

    def get_all(self) -> List[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return []
        results = []
        for idx, entry in enumerate(self.raw_data["Body"]):
            if isinstance(entry, dict):
                copy_entry = dict(entry)
                copy_entry["_index"] = idx
                results.append(copy_entry)
        return results

    def update_group(self, index: int, updated_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return None
        body = self.raw_data["Body"]
        if index < 0 or index >= len(body):
            return None

        entry = body[index]
        for k, v in updated_data.items():
            if k != "_index":
                entry[k] = v

        if self.save():
            res = dict(entry)
            res["_index"] = index
            return res
        return None

    def get_aggregated_tables(self) -> List[Dict[str, Any]]:
        raw_list = self.get_all()
        job_to_base = {}
        job_to_job = {}

        for entry in raw_list:
            idx = entry["_index"]
            jobs_field = entry.get("Jobs", {})
            job_names = list(jobs_field.keys()) if isinstance(jobs_field, dict) else (list(jobs_field) if isinstance(jobs_field, list) else [])

            if "BaseExp" in entry:
                for j in job_names:
                    if not is_alternate_sprite(j):
                        job_to_base[j] = (idx, entry.get("BaseExp", []), entry.get("MaxBaseLevel", 99))
            if "JobExp" in entry:
                for j in job_names:
                    if not is_alternate_sprite(j):
                        job_to_job[j] = (idx, entry.get("JobExp", []), entry.get("MaxJobLevel", 50))

        all_jobs = sorted(set(job_to_base.keys()) | set(job_to_job.keys()))
        aggregated = []
        for j in all_jobs:
            base_info = job_to_base.get(j, (-1, [], 99))
            job_info = job_to_job.get(j, (-1, [], 50))
            aggregated.append({
                "className": j,
                "category": classify_job_category(j),
                "base_exp": base_info[1],
                "job_exp": job_info[1],
                "base_index": base_info[0],
                "job_index": job_info[0],
                "MaxBaseLevel": base_info[2],
                "MaxJobLevel": job_info[2]
            })
        return aggregated

    def update_aggregated_exp(self, base_index: int, job_index: int, base_exp: Optional[List[Dict[str, Any]]] = None, job_exp: Optional[List[Dict[str, Any]]] = None) -> bool:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return False
        body = self.raw_data["Body"]
        changed = False
        if base_index >= 0 and base_index < len(body) and base_exp is not None:
            body[base_index]["BaseExp"] = base_exp
            changed = True
        if job_index >= 0 and job_index < len(body) and job_exp is not None:
            body[job_index]["JobExp"] = job_exp
            changed = True
        if changed:
            return self.save()
        return False


class SkillTreeParser(BaseProgressionParser):
    def __init__(self):
        super().__init__("skill_tree.yml")

    def get_all_raw(self) -> List[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return []
        results = []
        for idx, entry in enumerate(self.raw_data["Body"]):
            if isinstance(entry, dict):
                copy_entry = dict(entry)
                copy_entry["_index"] = idx
                results.append(copy_entry)
        return results

    def get_job_tree_enriched(self, job_name: str) -> Optional[Dict[str, Any]]:
        from app.services.skill_parser import skill_db

        raw_entry = None
        for entry in self.get_all_raw():
            if entry.get("Job") == job_name:
                raw_entry = entry
                break
        if not raw_entry:
            return None

        # Index skills by Name for quick lookup
        skill_map_by_name: Dict[str, Dict[str, Any]] = {}
        if skill_db.db_cache:
            for filepath, data in skill_db.db_cache.items():
                if data and "Body" in data and isinstance(data["Body"], list):
                    for sk in data["Body"]:
                        if isinstance(sk, dict) and "Name" in sk:
                            skill_map_by_name[sk["Name"]] = sk

        enriched_tree = []
        tree_items = raw_entry.get("Tree", [])
        if isinstance(tree_items, list):
            for node in tree_items:
                if not isinstance(node, dict):
                    continue
                name = node.get("Name", "")
                sk_info = skill_map_by_name.get(name, {})
                skill_id = sk_info.get("Id", 0)
                description = sk_info.get("Description", name)

                enriched_node = {
                    "Name": name,
                    "Id": skill_id,
                    "Description": description,
                    "MaxLevel": node.get("MaxLevel", sk_info.get("MaxLevel", 10)),
                    "Exclude": node.get("Exclude", False),
                    "BaseLevel": node.get("BaseLevel", 0),
                    "JobLevel": node.get("JobLevel", 0),
                    "Requires": node.get("Requires", []),
                    "IconUrl": f"/api/grf/skill_icon?name={name}&id={skill_id}"
                }
                enriched_tree.append(enriched_node)

        return {
            "Job": raw_entry.get("Job"),
            "Inherit": raw_entry.get("Inherit", {}),
            "Tree": enriched_tree,
            "_index": raw_entry.get("_index")
        }

    def update_job_tree(self, job_name: str, tree_list: List[Dict[str, Any]], inherit_dict: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return None
        body = self.raw_data["Body"]

        target_idx = -1
        for idx, entry in enumerate(body):
            if isinstance(entry, dict) and entry.get("Job") == job_name:
                target_idx = idx
                break

        clean_tree = []
        for node in tree_list:
            clean_node = {
                "Name": node["Name"],
                "MaxLevel": int(node.get("MaxLevel", 1))
            }
            if node.get("Exclude"):
                clean_node["Exclude"] = True
            if node.get("BaseLevel", 0) > 0:
                clean_node["BaseLevel"] = int(node["BaseLevel"])
            if node.get("JobLevel", 0) > 0:
                clean_node["JobLevel"] = int(node["JobLevel"])

            requires = node.get("Requires", [])
            if requires and isinstance(requires, list) and len(requires) > 0:
                clean_reqs = []
                for r in requires:
                    if isinstance(r, dict) and "Name" in r:
                        clean_reqs.append({
                            "Name": r["Name"],
                            "Level": int(r.get("Level", 1))
                        })
                if clean_reqs:
                    clean_node["Requires"] = clean_reqs
            clean_tree.append(clean_node)

        if target_idx >= 0:
            body[target_idx]["Tree"] = clean_tree
            if inherit_dict is not None:
                body[target_idx]["Inherit"] = inherit_dict
            res = body[target_idx]
        else:
            new_entry = {
                "Job": job_name,
                "Tree": clean_tree
            }
            if inherit_dict:
                new_entry["Inherit"] = inherit_dict
            body.append(new_entry)
            res = new_entry

        if self.save():
            return self.get_job_tree_enriched(job_name)
        return None


class JobAspdParser(BaseProgressionParser):
    def __init__(self):
        super().__init__("job_aspd.yml")

    def get_all(self) -> List[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return []
        results = []
        for idx, entry in enumerate(self.raw_data["Body"]):
            if isinstance(entry, dict):
                copy_entry = dict(entry)
                copy_entry["_index"] = idx
                results.append(copy_entry)
        return results

    def get_by_job(self, job_name: str) -> Optional[Dict[str, Any]]:
        for entry in self.get_all():
            jobs = entry.get("Jobs")
            if isinstance(jobs, dict) and job_name in jobs:
                return entry
            elif isinstance(jobs, list) and job_name in jobs:
                return entry
        return None

    def update_entry(self, index: int, updated_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return None
        body = self.raw_data["Body"]
        if index < 0 or index >= len(body):
            return None

        entry = body[index]
        for k, v in updated_data.items():
            if k != "_index":
                entry[k] = v

        if self.save():
            res = dict(entry)
            res["_index"] = index
            return res
        return None


class JobOutfitsParser(BaseProgressionParser):
    def __init__(self):
        super().__init__("job_outfits.yml")

    def get_all(self) -> List[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return []
        results = []
        for idx, entry in enumerate(self.raw_data["Body"]):
            if isinstance(entry, dict):
                copy_entry = dict(entry)
                copy_entry["_index"] = idx
                results.append(copy_entry)
        return results

    def get_by_job(self, job_name: str) -> Optional[Dict[str, Any]]:
        for entry in self.get_all():
            jobs = entry.get("Jobs")
            if isinstance(jobs, dict) and job_name in jobs:
                return entry
            elif isinstance(jobs, list) and job_name in jobs:
                return entry
        return None

    def update_entry(self, index: int, updated_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.raw_data or "Body" not in self.raw_data or not isinstance(self.raw_data["Body"], list):
            return None
        body = self.raw_data["Body"]
        if index < 0 or index >= len(body):
            return None

        entry = body[index]
        for k, v in updated_data.items():
            if k != "_index":
                entry[k] = v

        if self.save():
            res = dict(entry)
            res["_index"] = index
            return res
        return None


# Singletons globais exportados
job_stats_db = JobStatsParser()
job_basepoints_db = JobBasepointsParser()
job_exp_db = JobExpParser()
skill_tree_db = SkillTreeParser()
job_aspd_db = JobAspdParser()
job_outfits_db = JobOutfitsParser()

