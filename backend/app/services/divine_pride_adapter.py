"""
services/divine_pride_adapter.py — Adapter (ETL Transform) para o Divine Pride.

Responsabilidade ÚNICA (SRP): receber JSON bruto do Divine Pride e transformá-lo
em dicts compatíveis com nossos DTOs Pydantic V2 (ItemDBModel, MobDBModelUpdate).

Regras críticas obedecidas:
  1. Omissão de Defaults: campos com valor igual ao default do rAthena são
     silenciosamente omitidos — o dump final usará exclude_defaults=True.
  2. LiteralScalarString: scripts são envoltos para forçar pipe | no YAML.
  3. exclude_none implícito: nenhum campo None é incluído no resultado.
  4. Correção de Locations: bitmask do DP → dict ItemLocations do rAthena.
  5. MobSkills: apenas as chaves internas do nosso editor (sem duplicação CamelCase).
"""

import re
from typing import Any, Dict, List, Optional
from ruamel.yaml.scalarstring import LiteralScalarString


# ─── Lookup tables ────────────────────────────────────────────────────────────

_ELEMENT_TYPES: Dict[int, str] = {
    0: "Neutral", 1: "Water",  2: "Earth", 3: "Fire",   4: "Wind",
    5: "Poison",  6: "Holy",   7: "Dark",  8: "Ghost",  9: "Undead",
}

_SCALE_MAP: Dict[int, str] = {0: "Small", 1: "Medium", 2: "Large"}

_RACE_MAP: Dict[int, str] = {
    0: "Formless", 1: "Undead", 2: "Brute",    3: "Plant",  4: "Insect",
    5: "Fish",     6: "Demon",  7: "Demihuman", 8: "Angel",  9: "Dragon",
}

_ITEM_TYPE_MAP: Dict[int, str] = {
    0: "Consumable", 1: "Consumable", 2: "Consumable",
    3: "Etc",        4: "Weapon",     5: "Armor",
    6: "Card",       7: "PetEgg",     8: "PetArmor",
    9: "Ammo",       10: "Consumable",
}

# Bitmask de localização do cliente RO → chaves do ItemLocations do rAthena
# Baseado na tabela oficial iRO/kRO
_LOCATION_BITS: Dict[int, str] = {
    0x0001: "Head_Low",
    0x0002: "Right_Hand",
    0x0004: "Garment",
    0x0008: "Left_Accessory",
    0x0010: "Armor",
    0x0020: "Left_Hand",
    0x0040: "Shoes",
    0x0080: "Right_Accessory",
    0x0100: "Head_Top",
    0x0200: "Head_Mid",
    0x0400: "Costume_Head_Top",
    0x0800: "Costume_Head_Mid",
    0x1000: "Costume_Head_Low",
    0x2000: "Costume_Garment",
    0x4000: "Ammo",
    0x8000: "Shadow_Armor",
}

# Defaults oficiais do rAthena (valores que NÃO devem ser escritos no YAML)
_ITEM_DEFAULTS: Dict[str, Any] = {
    "Type":          "Etc",
    "Defense":       0,
    "Attack":        0,
    "MagicAttack":   0,
    "Weight":        0,
    "Buy":           0,
    "Sell":          0,
    "Slots":         0,
    "EquipLevelMin": 0,
    "EquipLevelMax": 0,
    "Range":         0,
    "Gender":        "Both",
    "Refineable":    False,
    "Gradable":      False,
    "ArmorLevel":    1,
    "WeaponLevel":   1,
    "View":          0,
}

_MOB_DEFAULTS: Dict[str, Any] = {
    "Sp":           0,
    "BaseExp":      0,
    "JobExp":       0,
    "MvpExp":       0,
    "Attack2":      0,
    "Resistance":   0,
    "MagicResistance": 0,
    "WalkSpeed":    150,
    "ElementLevel": 1,
    "DamageTaken":  100,
}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _safe_int(val: Any, default: int = 0) -> int:
    try:
        return int(val if val is not None else default)
    except (ValueError, TypeError):
        return default


def _omit_defaults(data: dict, defaults: Dict[str, Any]) -> dict:
    """Remove do dict qualquer chave cujo valor seja igual ao default do rAthena."""
    return {k: v for k, v in data.items() if defaults.get(k, object()) != v}


def _to_aegis_name(name: str, fallback_id: int = 0) -> str:
    """Gera um AegisName em UpperCamelCase a partir do nome do DP."""
    if not name:
        return f"ITEM_{fallback_id}"
    words = re.findall(r"[A-Za-z0-9]+", str(name))
    return "".join(w[:1].upper() + w[1:] for w in words) if words else f"ITEM_{fallback_id}"


def _decode_location_bitmask(bitmask: int) -> Optional[Dict[str, bool]]:
    """Converte o bitmask de localização do cliente RO para dict ItemLocations."""
    if not bitmask:
        return None
    result = {}
    for bit, name in _LOCATION_BITS.items():
        if bitmask & bit:
            result[name] = True
    return result or None


def _wrap_script(script: str) -> Optional[LiteralScalarString]:
    """
    Envolve um script em LiteralScalarString para forçar o pipe | no YAML.
    Retorna None se o script for vazio.
    """
    if not script or not str(script).strip():
        return None
    s = str(script).strip()
    # Garante terminação com \n (exigido pelo block scalar do YAML)
    return LiteralScalarString(s if s.endswith("\n") else s + "\n")


def _get_element(raw_element: int):
    """Decodifica o elemento do DP: (nível * 20) + tipo."""
    element_type_idx = raw_element % 10
    if raw_element >= 20:
        element_level = raw_element // 20
    elif raw_element >= 10:
        element_level = raw_element // 10
    else:
        element_level = 1
    return _ELEMENT_TYPES.get(element_type_idx, "Neutral"), max(1, min(4, element_level))


# ─── Adapter ─────────────────────────────────────────────────────────────────

class DivinePrideAdapter:
    """
    Adapter (Padrão ETL — Transform) entre o JSON do Divine Pride e os DTOs
    Pydantic V2 do rAthena Web Editor.

    Cada método `adapt_*` retorna um dict pronto para ser passado diretamente
    a `ItemDBModel(**result)` ou `MobDBModelUpdate(**result)`.
    """

    # ── Item ─────────────────────────────────────────────────────────────────

    def adapt_item(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transforma JSON bruto de Item do DP → dict compatível com ItemDBModel.

        Correções aplicadas:
        - Omite campos com valores iguais aos defaults do rAthena
        - Mapeia location (bitmask) → Locations (dict ItemLocations)
        - NÃO inclui EquipLocations (chave inválida no nosso modelo)
        - Scripts envoltos com LiteralScalarString
        """
        if not isinstance(raw, dict):
            raw = {}

        item_id   = _safe_int(raw.get("id"), 0)
        name      = str(raw.get("name") or f"ITEM_{item_id}")
        aegis     = str(raw.get("aegisName") or raw.get("dbname") or "").strip()
        if not aegis:
            aegis = _to_aegis_name(name, item_id)

        # Peso: DP usa float (ex: 0.7 = 70 no rAthena)
        try:
            weight = int(round(float(raw.get("weight") or 0) * 10))
        except (ValueError, TypeError):
            weight = 0

        raw_type = _safe_int(raw.get("itemTypeId"), 3)
        item_type = _ITEM_TYPE_MAP.get(raw_type, "Etc")

        price   = _safe_int(raw.get("price"), 0)
        sell    = price // 2 if price > 0 else 0

        result: Dict[str, Any] = {
            "Id":        item_id,
            "AegisName": aegis,
            "Name":      name,
            "Type":      item_type,
            "Buy":       price,
            "Sell":      sell,
            "Weight":    weight,
            "Attack":    _safe_int(raw.get("attack"), 0),
            "Defense":   _safe_int(raw.get("defense"), 0),
            "Slots":     _safe_int(raw.get("slots"), 0),
            "EquipLevelMin": _safe_int(raw.get("requiredLevel"), 0),
            "EquipLevelMax": _safe_int(raw.get("limitLevel"), 0),
        }

        # Locations (bitmask → dict)
        location_raw = raw.get("location")
        if location_raw is not None:
            locations = _decode_location_bitmask(_safe_int(location_raw))
            if locations:
                result["Locations"] = locations

        # Scripts
        for dp_key, ra_key in [("script", "Script"), ("equipScript", "EquipScript"), ("unequipScript", "UnEquipScript")]:
            script = raw.get(dp_key)
            if script:
                wrapped = _wrap_script(str(script))
                if wrapped:
                    result[ra_key] = wrapped

        # Remove campos com valores iguais aos defaults do rAthena
        result = _omit_defaults(result, _ITEM_DEFAULTS)

        # Remove None remanescentes
        result = {k: v for k, v in result.items() if v is not None}

        return result

    # ── Monster ───────────────────────────────────────────────────────────────

    def adapt_monster(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transforma JSON bruto de Monster do DP → dict compatível com MobDBModelUpdate.

        Correções aplicadas:
        - Omite campos com valores iguais aos defaults do rAthena
        - MobSkills: apenas as chaves snake_case internas (sem duplicação CamelCase)
        - Elemento decodificado corretamente: (nível * 20) + tipo
        """
        if not isinstance(raw, dict):
            raw = {}

        stats = raw.get("stats")
        if not isinstance(stats, dict):
            stats = {}

        mob_id    = _safe_int(raw.get("id"), 0)
        name      = str(raw.get("name") or f"MOB_{mob_id}")
        aegis     = str(raw.get("dbname") or raw.get("aegisName") or f"MOB_{mob_id}")

        # Elemento
        raw_element = _safe_int(stats.get("element"), 0)
        element_str, element_level = _get_element(raw_element)

        # Tamanho e Raça
        size_str = _SCALE_MAP.get(_safe_int(stats.get("scale"), 1), "Medium")
        race_str = _RACE_MAP.get(_safe_int(stats.get("race"),  0), "Formless")

        # AI
        raw_ai = str(stats.get("ai") or "01").strip()
        m = re.search(r"(\d+)$", raw_ai)
        ai_str = m.group(1).zfill(2) if m else "01"

        # Ataque (pode vir como dict {minimum, maximum} ou int)
        attack_raw = stats.get("attack")
        if isinstance(attack_raw, dict):
            attack  = _safe_int(attack_raw.get("minimum"), 0)
            attack2 = _safe_int(attack_raw.get("maximum"), 0)
        else:
            attack  = _safe_int(attack_raw, 0)
            attack2 = _safe_int(stats.get("attack2"), 0)

        # Modos
        modes: Dict[str, bool] = {}
        if _safe_int(stats.get("mvp"), 0) == 1:
            modes["Mvp"] = True

        # Drops normais
        drops: List[Dict[str, Any]] = []
        for drop in (raw.get("drops") or []):
            if not isinstance(drop, dict):
                continue
            item_id = _safe_int(drop.get("itemId") or drop.get("id") or drop.get("Item"), 0)
            rate    = _safe_int(drop.get("chance") or drop.get("rate") or drop.get("Rate"), 0)
            if item_id > 0:
                drops.append({"Item": item_id, "Rate": rate})

        # MVP Drops
        mvp_exp  = _safe_int(raw.get("mvpExperience") or stats.get("mvpExperience"), 0)
        mvp_drops: List[Dict[str, Any]] = []
        for drop in (raw.get("mvpDrops") or stats.get("mvpDrops") or []):
            if not isinstance(drop, dict):
                continue
            item_id = _safe_int(drop.get("itemId") or drop.get("id") or drop.get("Item"), 0)
            rate    = _safe_int(drop.get("chance") or drop.get("rate") or drop.get("Rate"), 0)
            if item_id > 0:
                mvp_drops.append({"Item": item_id, "Rate": rate})

        # MobSkills — apenas chaves snake_case do nosso editor interno (sem duplicação)
        mob_skills: List[Dict[str, Any]] = []
        for sk in (raw.get("skill") or raw.get("skills") or []):
            if not isinstance(sk, dict):
                continue
            skill_id = _safe_int(sk.get("skillId") or sk.get("id") or sk.get("skill_id") or sk.get("Skill"), 0)
            if skill_id <= 0:
                continue

            level = _safe_int(sk.get("level") or sk.get("skill_lv") or sk.get("Level"), 1)
            rate  = _safe_int(sk.get("chance") or sk.get("rate") or sk.get("Rate"), 10000)
            cast_time = _safe_int(sk.get("castTime") or sk.get("cast_time") or sk.get("CastTime"), 0)
            delay     = _safe_int(sk.get("delay") or sk.get("Delay"), 0)
            cancelable = bool(sk.get("interruptable") or sk.get("cancelable") or False)

            raw_state = str(sk.get("status") or sk.get("state") or "idle").strip()
            state     = raw_state.replace("STATE_", "").replace("state_", "").lower() or "idle"

            raw_cond = str(sk.get("condition") or sk.get("condition_type") or "always").strip()
            cond_type = raw_cond.replace("CONDITION_", "").replace("condition_", "").lower() or "always"

            raw_cond_val = sk.get("conditionValue") or sk.get("condition_value")
            cond_val = 0 if (raw_cond_val is None or str(raw_cond_val).lower() in ("null", "")) else _safe_int(raw_cond_val)

            target = str(sk.get("target") or "target").lower().replace("target_", "") or "target"

            mob_skills.append({
                "mob_id":          mob_id,
                "dummy_name":      aegis,
                "skill_id":        skill_id,
                "skill_lv":        level,
                "rate":            rate,
                "state":           state,
                "condition_type":  cond_type,
                "condition_value": cond_val,
                "cast_time":       cast_time,
                "delay":           delay,
                "cancelable":      cancelable,
                "target":          target,
            })

        result: Dict[str, Any] = {
            "Id":         mob_id,
            "AegisName":  aegis,
            "SpriteName": aegis,
            "Name":       name,
            "Level":      _safe_int(stats.get("level"), 1),
            "Hp":         _safe_int(stats.get("health"), 1),
            "Sp":         _safe_int(stats.get("sp"), 0),
            "BaseExp":    _safe_int(stats.get("baseExperience"), 0),
            "JobExp":     _safe_int(stats.get("jobExperience"), 0),
            "Attack":     attack,
            "Attack2":    attack2,
            "Defense":    _safe_int(stats.get("defense"), 0),
            "MagicDefense": _safe_int(stats.get("magicDefense"), 0),
            "Str":  _safe_int(stats.get("str"), 1),
            "Agi":  _safe_int(stats.get("agi"), 1),
            "Vit":  _safe_int(stats.get("vit"), 1),
            "Int":  _safe_int(stats.get("int"), 1),
            "Dex":  _safe_int(stats.get("dex"), 1),
            "Luk":  _safe_int(stats.get("luk"), 1),
            "AttackRange": _safe_int(stats.get("attackRange"), 1),
            "SkillRange":  _safe_int(stats.get("skillRange"), 10),
            "ChaseRange":  _safe_int(stats.get("chaseRange"), 12),
            "Size":         size_str,
            "Race":         race_str,
            "Element":      element_str,
            "ElementLevel": element_level,
            "WalkSpeed":    _safe_int(stats.get("walkSpeed"), 150),
            "AttackDelay":  _safe_int(stats.get("attackDelay"), 1000),
            "AttackMotion": _safe_int(stats.get("attackMotion"), 500),
            "DamageMotion": _safe_int(stats.get("damageMotion"), 500),
            "Ai":    ai_str,
            "Modes": modes if modes else None,
            "Drops": drops if drops else None,
        }

        if mvp_exp > 0:
            result["MvpExp"] = mvp_exp
        if mvp_drops:
            result["MvpDrops"] = mvp_drops
        if mob_skills:
            result["MobSkills"] = mob_skills

        # Omite campos com valores iguais aos defaults do rAthena
        result = _omit_defaults(result, _MOB_DEFAULTS)

        # Remove None remanescentes
        result = {k: v for k, v in result.items() if v is not None}

        return result

    # ── Skill ─────────────────────────────────────────────────────────────────

    def adapt_skill(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Transforma JSON de Skill do DP → dict compatível com SkillModel."""
        if not isinstance(raw, dict):
            raw = {}

        skill_id  = _safe_int(raw.get("id"), 0)
        max_level = _safe_int(raw.get("maxLevel"), 1)

        # Nome e descrição via globalization (language=0 = inglês)
        name        = f"SKILL_{skill_id}"
        description = ""
        globalization = raw.get("globalization")
        if isinstance(globalization, list):
            entry = next((e for e in globalization if isinstance(e, dict) and _safe_int(e.get("language"), -1) == 0), None)
            if entry is None:
                entry = next((e for e in globalization if isinstance(e, dict)), None)
            if entry:
                name        = str(entry.get("name")        or raw.get("name")        or name)
                description = str(entry.get("description") or raw.get("description") or "")
        else:
            name        = str(raw.get("name")        or name)
            description = str(raw.get("description") or "")

        result: Dict[str, Any] = {
            "Id":          skill_id,
            "Name":        name,
            "Description": description or None,
            "MaxLevel":    max_level,
        }

        if raw.get("range")      is not None: result["Range"]      = _safe_int(raw["range"])
        if raw.get("targetType") is not None: result["TargetType"] = str(raw["targetType"])
        if raw.get("element")    is not None:
            result["Element"] = _ELEMENT_TYPES.get(_safe_int(raw["element"]), "Neutral")

        return {k: v for k, v in result.items() if v is not None}

    # ── Experience ────────────────────────────────────────────────────────────

    def adapt_experience(self, raw: Dict[str, Any], exp_type: str = "normal") -> Dict[str, Any]:
        """Transforma JSON de tabela de Exp do DP → formato de curvas do rAthena."""
        if not isinstance(raw, dict):
            raw = {}

        suffix = str(exp_type or "normal").lower().strip()
        if suffix.startswith(("base_", "job_")):
            suffix = suffix.split("_", 1)[1]

        def _get_dict(prefix: str) -> Dict[str, Any]:
            for key in [f"{prefix}_{suffix}", f"{prefix}_rebirth", f"{prefix}_transcendent", suffix]:
                val = raw.get(key)
                if isinstance(val, dict):
                    return val
            return {}

        def _to_array(d: Dict[str, Any]) -> List[int]:
            if not d:
                return []
            levels = [int(k) for k in d if str(k).isdigit()]
            if not levels:
                return []
            return [_safe_int(d.get(str(lvl)) or d.get(lvl), 0) for lvl in range(1, max(levels) + 1)]

        base_arr = _to_array(_get_dict("base"))
        job_arr  = _to_array(_get_dict("job"))

        return {
            "type":          suffix,
            "BaseExp":       base_arr,
            "JobExp":        job_arr,
            "base_exp":      [{"Level": i + 1, "Exp": v} for i, v in enumerate(base_arr)],
            "job_exp":       [{"Level": i + 1, "Exp": v} for i, v in enumerate(job_arr)],
            "MaxBaseLevel":  len(base_arr),
            "MaxJobLevel":   len(job_arr),
        }


# ─── Singleton global ─────────────────────────────────────────────────────────
dp_adapter = DivinePrideAdapter()
