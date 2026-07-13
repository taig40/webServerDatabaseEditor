import os
import re
from typing import Dict, List, Any

BASE_COMMANDS = [
    {"label": "bonus", "detail": "bonus <type>,<val>;", "documentation": "Adds a basic stat/attribute bonus to the item."},
    {"label": "bonus2", "detail": "bonus2 <type>,<arg1>,<arg2>;", "documentation": "Adds a 2-parameter extended bonus to the item."},
    {"label": "bonus3", "detail": "bonus3 <type>,<arg1>,<arg2>,<arg3>;", "documentation": "Adds a 3-parameter extended bonus to the item."},
    {"label": "bonus4", "detail": "bonus4 <type>,<arg1>,<arg2>,<arg3>,<arg4>;", "documentation": "Adds a 4-parameter extended bonus to the item."},
    {"label": "bonus5", "detail": "bonus5 <type>,<arg1>,<arg2>,<arg3>,<arg4>,<arg5>;", "documentation": "Adds a 5-parameter extended bonus to the item."},
    {"label": "heal", "detail": "heal <hp>,<sp>;", "documentation": "Heals HP and SP directly."},
    {"label": "itemheal", "detail": "itemheal <hp>,<sp>;", "documentation": "Heals HP and SP with potion modifier applied."},
    {"label": "percentheal", "detail": "percentheal <hp_rate>,<sp_rate>;", "documentation": "Heals a percentage of Max HP and Max SP."},
    {"label": "skill", "detail": "skill <skill_id>,<level>;", "documentation": "Grants a skill at the specified level while equipped or used."},
    {"label": "sc_start", "detail": "sc_start <type>,<duration>,<val1>;", "documentation": "Starts a status change/effect on the player."},
    {"label": "sc_start2", "detail": "sc_start2 <type>,<duration>,<val1>,<rate>;", "documentation": "Starts a status change/effect with a specific success rate."},
    {"label": "sc_start4", "detail": "sc_start4 <type>,<duration>,<val1>,<val2>,<val3>,<val4>;", "documentation": "Starts a status change/effect with 4 values."},
    {"label": "getitem", "detail": "getitem <item_id>,<amount>;", "documentation": "Gives an item to the character."},
    {"label": "getitem2", "detail": "getitem2 <item_id>,<amount>,<identify>,<refine>,<attr>,<card1>,<card2>,<card3>,<card4>;", "documentation": "Gives an item with detailed parameters."},
    {"label": "getrandgroupitem", "detail": "getrandgroupitem <group_id>,<amount>;", "documentation": "Gives a random item from a specified item group."},
    {"label": "rentitem", "detail": "rentitem <item_id>,<seconds>;", "documentation": "Gives a rental item that expires after specified duration."},
    {"label": "autospell", "detail": "autospell <skill_id>,<level>,<rate>,<flag>;", "documentation": "Casts a skill automatically when attacking or attacked."},
    {"label": "autospell2", "detail": "autospell2 <skill_id>,<level>,<rate>,<flag>,<card_trigger>;", "documentation": "Casts a skill automatically with card trigger flag."},
    {"label": "autospell3", "detail": "autospell3 <skill_id>,<level>,<rate>,<flag>,<target>;", "documentation": "Casts a skill automatically on a specific target."},
    {"label": "specialeffect2", "detail": "specialeffect2 <effect_id>;", "documentation": "Displays a visual effect on the player."}
]

class ItemIntellisenseService:
    def __init__(self):
        self._cache: Dict[str, Any] = {}
        self._bonus_regex = re.compile(r"^(bonus\d?)\s+([a-zA-Z0-9_]+)(?:\s*,\s*([^;]+))?;\s*(.*)$")

    def _find_item_bonus_file(self) -> str:
        candidates = []
        env_path = os.environ.get("DOC_ITEM_BONUS_PATH", "").strip()
        if env_path:
            candidates.append(env_path)

        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        candidates.extend([
            r"c:\Users\taiga\Documents\rAthena\emulador\rathena\doc\item_bonus.txt",
            os.path.join(base_dir, "..", "emulador", "rathena", "doc", "item_bonus.txt"),
            os.path.join(base_dir, "doc", "item_bonus.txt"),
        ])

        for p in candidates:
            if os.path.exists(p):
                return os.path.abspath(p)
        return ""

    def parse_item_bonus_doc(self) -> List[Dict[str, str]]:
        if "bonuses" in self._cache:
            return self._cache["bonuses"]

        filepath = self._find_item_bonus_file()
        bonuses = []
        constants = []
        seen_bonuses = set()
        seen_constants = set()

        if not filepath:
            self._cache["bonuses"] = bonuses
            self._cache["constants"] = constants
            return bonuses

        current_category = "General"

        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                raw_line = line.strip()
                if not raw_line or raw_line.startswith("//"):
                    continue

                if raw_line.startswith("* "):
                    current_category = raw_line[2:].strip()
                    continue

                # Detect constants line inside Constants section (comma separated uppercase or prefixed words)
                if current_category and not raw_line.startswith("bonus") and "," in raw_line and ("Eff_" in raw_line or "Ele_" in raw_line or "RC_" in raw_line or "RC2_" in raw_line or "BF_" in raw_line or "ATF_" in raw_line or "Size_" in raw_line or "Class_" in raw_line):
                    tokens = [t.strip() for t in raw_line.split(",") if t.strip()]
                    for tok in tokens:
                        if tok and re.match(r"^[A-Za-z0-9_]+$", tok) and tok not in seen_constants:
                            seen_constants.add(tok)
                            constants.append({
                                "label": tok,
                                "category": current_category,
                                "description": f"{current_category} constant: {tok}"
                            })
                    continue

                m = self._bonus_regex.match(raw_line)
                if m:
                    command = m.group(1)
                    label = m.group(2)
                    args = (m.group(3) or "").strip()
                    description = (m.group(4) or "").strip()

                    key = f"{command}:{label}"
                    if key not in seen_bonuses:
                        seen_bonuses.add(key)
                        bonuses.append({
                            "label": label,
                            "command": command,
                            "args": args,
                            "description": description or f"{command} {label}"
                        })

        self._cache["bonuses"] = bonuses
        if "constants" not in self._cache:
            self._cache["constants"] = constants
        return bonuses

    def get_constants(self) -> List[Dict[str, str]]:
        if "constants" not in self._cache:
            self.parse_item_bonus_doc()
        return self._cache.get("constants", [])

    def get_full_intellisense(self) -> Dict[str, Any]:
        bonuses = self.parse_item_bonus_doc()
        constants = self.get_constants()

        # Build lightweight summaries for cross-referencing
        items_summary = []
        mobs_summary = []
        skills_summary = []

        try:
            from app.services.yaml_parser import yaml_db
            for it in yaml_db.get_items()[:2500]:
                item_id = it.get("Id")
                name = it.get("AegisName") or it.get("Name")
                if item_id and name:
                    items_summary.append({"id": item_id, "name": name})
        except Exception:
            pass

        try:
            from app.services.mob_parser import mob_db
            for m in mob_db.get_mobs()[:2000]:
                mob_id = m.get("Id")
                name = m.get("AegisName") or m.get("Name")
                if mob_id and name:
                    mobs_summary.append({"id": mob_id, "name": name})
        except Exception:
            pass

        try:
            from app.services.skill_parser import skill_db
            for sk in skill_db.get_skills()[:2500]:
                sk_id = sk.get("Id")
                name = sk.get("Name") or sk.get("Description")
                if sk_id and name:
                    skills_summary.append({"id": sk_id, "name": name})
        except Exception:
            pass

        return {
            "base_commands": BASE_COMMANDS,
            "bonuses": bonuses,
            "constants": constants,
            "items": items_summary,
            "mobs": mobs_summary,
            "skills": skills_summary
        }

item_intellisense_svc = ItemIntellisenseService()
