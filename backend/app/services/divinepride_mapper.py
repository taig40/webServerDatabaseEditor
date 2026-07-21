"""divinepride_mapper.py — ETL mapping helpers for Divine Pride JSON payloads.

Transforms raw API responses for items, monsters, skills, and experience curves
into strict dictionary formats compatible with rAthena YAML databases.
"""

import re
from typing import Dict, Any, List
from app.services.mob_skill_translator import MobSkillTranslator

ELEMENT_TYPES = {
    0: "Neutral",
    1: "Water",
    2: "Earth",
    3: "Fire",
    4: "Wind",
    5: "Poison",
    6: "Holy",
    7: "Dark",
    8: "Ghost",
    9: "Undead",
}

SCALE_MAP = {
    0: "Small",
    1: "Medium",
    2: "Large",
}

RACE_MAP = {
    0: "Formless",
    1: "Undead",
    2: "Brute",
    3: "Plant",
    4: "Insect",
    5: "Fish",
    6: "Demon",
    7: "Demihuman",
    8: "Angel",
    9: "Dragon",
}

def _safe_int(val: Any, default: int = 0) -> int:
    """Safely converts arbitrary values to integer with a default fallback."""
    try:
        return int(val if val is not None else default)
    except (ValueError, TypeError):
        return default

ITEM_TYPE_MAP = {
    0: "Consumable",
    1: "Consumable",
    2: "Consumable",
    3: "Etc",
    4: "Weapon",
    5: "Armor",
    6: "Card",
    7: "PetEgg",
    8: "PetArmor",
    9: "Ammo",
    10: "Consumable",
}

def to_upper_camel_case(name: str, fallback_id: int = 0) -> str:
    """Converts a raw string into valid UpperCamelCase notation for AegisName generation.

    Args:
        name: Raw item or monster name string.
        fallback_id: Numeric ID used if string extraction yields no alphanumeric characters.

    Returns:
        str: Sanitized UpperCamelCase string (e.g. ``"RedPotion"``).
    """
    if not name:
        return f"ITEM_{fallback_id}"
    words = re.findall(r'[A-Za-z0-9]+', str(name))
    if not words:
        return f"ITEM_{fallback_id}"
    return "".join(word[:1].upper() + word[1:] for word in words)

def map_divinepride_item_to_rathena(dp_json: Dict[str, Any]) -> Dict[str, Any]:
    """Transforms raw Divine Pride item JSON into an rAthena ``item_db.yml`` compatible dict.

    Applies weight scaling (x10), type mapping, and default value normalization.

    Args:
        dp_json: Raw dictionary received from Divine Pride item endpoints.

    Returns:
        dict: rAthena item database fields.
    """
    if not isinstance(dp_json, dict):
        dp_json = {}

    item_id = _safe_int(dp_json.get("id"), 0)
    name = str(dp_json.get("name") or f"ITEM_{item_id}")

    # 1. Nomenclatura: AegisName em UpperCamelCase a partir do Name para pré-preenchimento
    aegis_name = str(dp_json.get("aegisName") or dp_json.get("dbname") or "")
    if not aegis_name.strip():
        aegis_name = to_upper_camel_case(name, item_id)

    # 2. Matemática de Peso: O rAthena exige o peso multiplicado por 10
    raw_weight = dp_json.get("weight", 0)
    try:
        dp_weight = float(raw_weight) if raw_weight is not None else 0.0
    except (ValueError, TypeError):
        dp_weight = 0.0
    weight = int(round(dp_weight * 10))

    # 3. Atributos Básicos com fallbacks seguros (.get) para evitar KeyError em consumíveis
    defense = _safe_int(dp_json.get("defense"), 0)
    attack = _safe_int(dp_json.get("attack"), 0)
    slots = _safe_int(dp_json.get("slots"), 0)
    equip_level_min = _safe_int(dp_json.get("requiredLevel"), 0)
    equip_level_max = _safe_int(dp_json.get("limitLevel"), 0)

    # 4. Mapeamento de Tipos (itemTypeId -> Type do rAthena)
    raw_item_type = _safe_int(dp_json.get("itemTypeId"), 3)
    rathena_type = ITEM_TYPE_MAP.get(raw_item_type, "Etc")

    price = _safe_int(dp_json.get("price"), 0)

    result = {
        "Id": item_id,
        "AegisName": aegis_name,
        "Name": name,
        "Type": rathena_type,
        "Buy": price,
        "Sell": price // 2,
        "Weight": weight,
        "Attack": attack,
        "Defense": defense,
        "Slots": slots,
        "EquipLevelMin": equip_level_min,
        "EquipLevelMax": equip_level_max,
    }

    # 5. Localização de Equipamento (location): repasse para a chave EquipLocations
    location = dp_json.get("location")
    if location is not None:
        result["EquipLocations"] = location

    return result

class DivinePrideItemMapper:
    """Mapper class for transforming Divine Pride item JSON into rAthena item database structure."""

    @staticmethod
    def map_item_to_rathena(dp_json: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for ``map_divinepride_item_to_rathena``."""
        return map_divinepride_item_to_rathena(dp_json)

    @staticmethod
    def map_divinepride_item_to_rathena(dp_json: Dict[str, Any]) -> Dict[str, Any]:
        """Transforms raw Divine Pride item JSON to rAthena structure."""
        return map_divinepride_item_to_rathena(dp_json)

class DivinePrideMapper:
    """Mapper class for transforming Divine Pride monster JSON into rAthena mob database structure."""

    @staticmethod
    def map_monster_to_rathena(dp_json: Dict[str, Any]) -> Dict[str, Any]:
        """Transforms raw Divine Pride monster JSON to rAthena ``mob_db.yml`` structure."""
        stats = dp_json.get("stats")
        if not isinstance(stats, dict):
            stats = {}

        mob_id = _safe_int(dp_json.get("id"), 0)
        name = str(dp_json.get("name") or f"MOB_{mob_id}")
        aegis_name = str(dp_json.get("dbname") or dp_json.get("aegisName") or f"MOB_{mob_id}")

        # 1. Elemento
        # A API do DivinePride / RO Client armazena o elemento como: (nível * 20) + tipo
        # Tipo do elemento = raw_element % 10 (0=Neutral, 1=Water, ..., 9=Undead)
        # Nível do elemento = raw_element // 20 (ou clamped entre 1 e 4)
        raw_element = _safe_int(stats.get("element"), 0)
        element_type_idx = raw_element % 10
        if raw_element >= 20:
            element_level = raw_element // 20
        elif raw_element >= 10:
            element_level = raw_element // 10
        else:
            element_level = 1
        element_level = max(1, min(4, element_level))
        element_str = ELEMENT_TYPES.get(element_type_idx, "Neutral")

        # 2. Tamanho (Size)
        raw_scale = _safe_int(stats.get("scale", 1), 1)
        size_str = SCALE_MAP.get(raw_scale, "Medium")

        # 3. Raça (Race)
        raw_race = _safe_int(stats.get("race", 0), 0)
        race_str = RACE_MAP.get(raw_race, "Formless")

        # 4. AI Behavior
        raw_ai = str(stats.get("ai") or "01").strip()
        match = re.search(r'(\d+)$', raw_ai)
        if match:
            ai_str = match.group(1).zfill(2)
        else:
            ai_str = "01"

        # 5. Mvp Mode
        modes: Dict[str, bool] = {}
        raw_mvp = _safe_int(stats.get("mvp"), 0)
        if raw_mvp == 1:
            modes["Mvp"] = True

        # 6. Drops
        rathena_drops: List[Dict[str, Any]] = []
        raw_drops = dp_json.get("drops")
        if isinstance(raw_drops, list):
            for drop in raw_drops:
                if not isinstance(drop, dict):
                    continue
                item_id = _safe_int(drop.get("itemId") or drop.get("id") or drop.get("Item"), 0)
                rate = _safe_int(drop.get("chance") or drop.get("rate") or drop.get("Rate"), 0)
                if item_id > 0:
                    rathena_drops.append({
                        "Item": item_id,
                        "Rate": rate
                    })

        # Ataque Mínimo e Máximo
        attack_raw = stats.get("attack")
        if isinstance(attack_raw, dict):
            attack = _safe_int(attack_raw.get("minimum"), 0)
            attack2 = _safe_int(attack_raw.get("maximum"), 0)
        else:
            attack = _safe_int(attack_raw, 0)
            attack2 = _safe_int(stats.get("attack2"), 0)

        # 7. Mvp Experience e Mvp Drops
        mvp_exp = _safe_int(dp_json.get("mvpExperience", stats.get("mvpExperience")), 0)
        rathena_mvp_drops: List[Dict[str, Any]] = []
        raw_mvp_drops = dp_json.get("mvpDrops", stats.get("mvpDrops", []))
        if isinstance(raw_mvp_drops, list):
            for drop in raw_mvp_drops:
                if not isinstance(drop, dict):
                    continue
                item_id = _safe_int(drop.get("itemId", drop.get("id", drop.get("Item"))), 0)
                rate = _safe_int(drop.get("chance", drop.get("rate", drop.get("Rate"))), 0)
                if item_id > 0:
                    rathena_mvp_drops.append({
                        "Item": item_id,
                        "Rate": rate
                    })

        # 8. Mob Skills (Habilidades de Monstro)
        rathena_mob_skills: List[Dict[str, Any]] = []
        raw_skills = dp_json.get("skill", dp_json.get("skills", []))
        if isinstance(raw_skills, list):
            for sk in raw_skills:
                if not isinstance(sk, dict):
                    continue
                norm = MobSkillTranslator.normalize_skill_entry(sk, mob_id=mob_id, dummy_name=aegis_name)
                if not norm or norm.get("skill_id", 0) <= 0:
                    continue
                rathena_mob_skills.append({
                    "Skill": norm["skill_id"],
                    "skill_id": norm["skill_id"],
                    "Level": norm["skill_lv"],
                    "skill_lv": norm["skill_lv"],
                    "Rate": norm["rate"],
                    "rate": norm["rate"],
                    "State": norm["state"],
                    "state": norm["state"],
                    "ConditionType": norm["condition_type"],
                    "condition_type": norm["condition_type"],
                    "ConditionValue": norm["condition_value"],
                    "condition_value": norm["condition_value"],
                    "CastTime": norm["cast_time"],
                    "cast_time": norm["cast_time"],
                    "Delay": norm["delay"],
                    "delay": norm["delay"],
                    "Cancelable": norm["cancelable"],
                    "cancelable": norm["cancelable"],
                    "Target": norm["target"],
                    "target": norm["target"],
                })

        result = {
            "Id": mob_id,
            "AegisName": aegis_name,
            "Name": name,
            "Level": _safe_int(stats.get("level", 1), 1),
            "Hp": _safe_int(stats.get("health", 1), 1),
            "Sp": _safe_int(stats.get("sp", 0), 0),
            "BaseExp": _safe_int(stats.get("baseExperience", 0), 0),
            "JobExp": _safe_int(stats.get("jobExperience", 0), 0),
            "Attack": attack,
            "Attack2": attack2,
            "Defense": _safe_int(stats.get("defense", 0), 0),
            "MagicDefense": _safe_int(stats.get("magicDefense", 0), 0),
            "Str": _safe_int(stats.get("str", 1), 1),
            "Agi": _safe_int(stats.get("agi", 1), 1),
            "Vit": _safe_int(stats.get("vit", 1), 1),
            "Int": _safe_int(stats.get("int", 1), 1),
            "Dex": _safe_int(stats.get("dex", 1), 1),
            "Luk": _safe_int(stats.get("luk", 1), 1),
            "AttackRange": _safe_int(stats.get("attackRange", 1), 1),
            "SkillRange": _safe_int(stats.get("skillRange", 10), 10),
            "ChaseRange": _safe_int(stats.get("chaseRange", 12), 12),
            "Size": size_str,
            "Race": race_str,
            "Element": element_str,
            "ElementLevel": element_level,
            "WalkSpeed": _safe_int(stats.get("walkSpeed", 200), 200),
            "AttackDelay": _safe_int(stats.get("attackDelay", 1000), 1000),
            "AttackMotion": _safe_int(stats.get("attackMotion", 500), 500),
            "DamageMotion": _safe_int(stats.get("damageMotion", 500), 500),
            "Ai": ai_str,
            "Modes": modes,
            "Drops": rathena_drops,
        }
        if mvp_exp > 0:
            result["MvpExp"] = mvp_exp
        if rathena_mvp_drops:
            result["MvpDrops"] = rathena_mvp_drops
        if rathena_mob_skills:
            result["MobSkills"] = rathena_mob_skills
        return result

    @staticmethod
    def map_item_to_rathena(dp_json: Dict[str, Any]) -> Dict[str, Any]:
        return map_divinepride_item_to_rathena(dp_json)

    @staticmethod
    def map_skill_to_rathena(dp_json: Dict[str, Any]) -> Dict[str, Any]:
        return map_divinepride_skill_to_rathena(dp_json)

    @staticmethod
    def map_exp_to_rathena(dp_json: Dict[str, Any], exp_type: str = "normal") -> Dict[str, Any]:
        return map_divinepride_exp_to_rathena(dp_json, exp_type=exp_type)


def map_divinepride_skill_to_rathena(dp_json: Dict[str, Any]) -> Dict[str, Any]:
    """Transforms raw Divine Pride skill JSON into an rAthena ``skill_db.yml`` compatible dict.

    Extracts localized names (preferring language 0/English), description strings,
    and maximum skill levels.

    Args:
        dp_json: Raw dictionary received from Divine Pride skill endpoints.

    Returns:
        dict: rAthena skill database fields.
    """
    if not isinstance(dp_json, dict):
        dp_json = {}

    skill_id = _safe_int(dp_json.get("id"), 0)

    # 1. Iterar sobre array globalization procurando language: 0 para Name e Description
    globalization = dp_json.get("globalization")
    name = f"SKILL_{skill_id}"
    description = ""

    if isinstance(globalization, list) and globalization:
        selected_entry = None
        for entry in globalization:
            if isinstance(entry, dict) and _safe_int(entry.get("language"), -1) == 0:
                selected_entry = entry
                break
        if selected_entry is None:
            for entry in globalization:
                if isinstance(entry, dict):
                    selected_entry = entry
                    break

        if selected_entry:
            name = str(selected_entry.get("name") or dp_json.get("name") or f"SKILL_{skill_id}")
            description = str(selected_entry.get("description") or dp_json.get("description") or "")
    else:
        name = str(dp_json.get("name") or f"SKILL_{skill_id}")
        description = str(dp_json.get("description") or "")

    # 3. maxLevel -> MaxLevel
    max_level = _safe_int(dp_json.get("maxLevel"), 1)

    result: Dict[str, Any] = {
        "Id": skill_id,
        "Name": name,
        "Description": description,
        "MaxLevel": max_level,
    }

    # 4. Outros campos como alcance (range) ou elementos na raiz do JSON
    if dp_json.get("range") is not None:
        result["Range"] = _safe_int(dp_json.get("range"), 0)

    if dp_json.get("element") is not None:
        raw_element = _safe_int(dp_json.get("element"), 0)
        result["Element"] = ELEMENT_TYPES.get(raw_element, "Neutral")

    if dp_json.get("hit") is not None:
        result["Hit"] = _safe_int(dp_json.get("hit"), 0)

    if dp_json.get("targetType") is not None:
        result["TargetType"] = str(dp_json.get("targetType"))

    return result


def _get_exp_dict(dp_json: Dict[str, Any], prefix: str, suffix: str) -> Dict[str, Any]:
    """Resolves and extracts a specific experience table dictionary from a Divine Pride payload.

    Args:
        dp_json: Raw experience payload dictionary.
        prefix: Table category (``"base"`` or ``"job"``).
        suffix: Progression tier (e.g. ``"normal"``, ``"rebirth"``, ``"transcendent"``).

    Returns:
        dict: Mapping of level strings to experience requirements, or empty dict if not found.
    """
    candidates = [f"{prefix}_{suffix}"]
    if suffix in ("rebirth", "trans", "transcendent"):
        candidates.extend([f"{prefix}_rebirth", f"{prefix}_transcendent", f"{prefix}_trans"])
    for cand in candidates:
        val = dp_json.get(cand)
        if isinstance(val, dict):
            return val
    val = dp_json.get(suffix)
    if isinstance(val, dict):
        return val
    return {}


def _dict_to_int_array(exp_dict: Dict[str, Any]) -> List[int]:
    """Converts a dictionary of level keys (`"1"`, `"2"`, ...) into a continuous 0-indexed integer list.

    Args:
        exp_dict: Level-to-EXP mapping dictionary.

    Returns:
        list[int]: Ordered list of experience points per level from 1 to max level.
    """
    if not isinstance(exp_dict, dict) or not exp_dict:
        return []
    levels = []
    for k in exp_dict.keys():
        if str(k).isdigit():
            levels.append(int(k))
    if not levels:
        return []
    max_level = max(levels)
    arr = []
    for lvl in range(1, max_level + 1):
        arr.append(_safe_int(exp_dict.get(str(lvl), exp_dict.get(lvl)), 0))
    return arr


def map_divinepride_exp_to_rathena(dp_json: Dict[str, Any], exp_type: str = "normal") -> Dict[str, Any]:
    """Transforms raw Divine Pride EXP table JSON into rAthena curve and array representations.

    Args:
        dp_json: Raw experience payload from Divine Pride.
        exp_type: Progression category string (e.g. ``"normal"``, ``"rebirth"``).

    Returns:
        dict: Formatted dictionary containing integer arrays and level objects for Base and Job EXP.
    """
    if not isinstance(dp_json, dict):
        dp_json = {}

    suffix = str(exp_type or "normal").lower().strip()
    if suffix.startswith("base_") or suffix.startswith("job_"):
        suffix = suffix.split("_", 1)[1]

    base_dict = _get_exp_dict(dp_json, "base", suffix)
    job_dict = _get_exp_dict(dp_json, "job", suffix)

    base_int_array = _dict_to_int_array(base_dict)
    job_int_array = _dict_to_int_array(job_dict)

    base_curve_objects = [{"Level": idx + 1, "Exp": val} for idx, val in enumerate(base_int_array)]
    job_curve_objects = [{"Level": idx + 1, "Exp": val} for idx, val in enumerate(job_int_array)]

    return {
        "type": suffix,
        "BaseExp": base_int_array,
        "JobExp": job_int_array,
        "base_exp": base_curve_objects,
        "job_exp": job_curve_objects,
        "MaxBaseLevel": len(base_int_array),
        "MaxJobLevel": len(job_int_array),
    }


class DivinePrideSkillMapper:
    """Mapper class for transforming Divine Pride skill JSON into rAthena skill database structure."""

    @staticmethod
    def map_skill_to_rathena(dp_json: Dict[str, Any]) -> Dict[str, Any]:
        """Transforms raw Divine Pride skill JSON to rAthena ``skill_db.yml`` structure."""
        return map_divinepride_skill_to_rathena(dp_json)

    @staticmethod
    def map_divinepride_skill_to_rathena(dp_json: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for ``map_divinepride_skill_to_rathena``."""
        return map_divinepride_skill_to_rathena(dp_json)


class DivinePrideExpMapper:
    """Mapper class for transforming Divine Pride experience table JSON into rAthena curve structures."""

    @staticmethod
    def map_exp_to_rathena(dp_json: Dict[str, Any], exp_type: str = "normal") -> Dict[str, Any]:
        """Transforms raw Divine Pride EXP JSON to rAthena experience table structure."""
        return map_divinepride_exp_to_rathena(dp_json, exp_type=exp_type)

    @staticmethod
    def map_divinepride_exp_to_rathena(dp_json: Dict[str, Any], exp_type: str = "normal") -> Dict[str, Any]:
        return map_divinepride_exp_to_rathena(dp_json, exp_type=exp_type)


map_divinepride_monster_to_rathena = DivinePrideMapper.map_monster_to_rathena
map_divinepride_item_to_rathena = map_divinepride_item_to_rathena
map_divinepride_skill_to_rathena = map_divinepride_skill_to_rathena
map_divinepride_exp_to_rathena = map_divinepride_exp_to_rathena
