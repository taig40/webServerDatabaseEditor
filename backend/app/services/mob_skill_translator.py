"""mob_skill_translator.py — Canonical rAthena Mob Skill Specification & Translation Service.

Adheres strictly to Single Responsibility Principle (SRP) and SOLID principles:
Encapsulates all knowledge of official rAthena mob_skill_db.txt enum rules and maps
external payloads (like Divine Pride) to exact rAthena string enums.
"""

from typing import Any, Dict, Set


class MobSkillTranslator:
    """Canonical translator and validator for rAthena mob skills."""

    RATHENA_STATES: Set[str] = {
        "any", "idle", "walk", "dead", "loot", "attack", "angry",
        "chase", "follow", "anytarget"
    }

    RATHENA_TARGETS: Set[str] = {
        "target", "self", "friend", "master", "randomtarget",
        "around1", "around2", "around3", "around4",
        "around5", "around6", "around7", "around8", "around"
    }

    RATHENA_CONDITIONS: Set[str] = {
        "always", "onspawn", "myhpltmaxrate", "myhpinrate",
        "mystatuson", "mystatusoff", "friendhpltmaxrate", "friendhpinrate",
        "friendstatuson", "friendstatusoff", "attackpcgt", "attackpcge",
        "slavelt", "slavele", "closedattacked", "longrangeattacked",
        "skillused", "afterskill", "casttargeted", "rudeattacked",
        "mobnearbygt", "groundattacked", "damagedgt", "alchemist",
        "trickcasting"
    }

    _STATE_MAP: Dict[str, str] = {
        "IDLE_ST": "idle",
        "IDLE": "idle",
        "WALK_ST": "walk",
        "WALK": "walk",
        "RUSH_ST": "walk",
        "RUSH": "walk",
        "DEAD_ST": "dead",
        "DEAD": "dead",
        "LOOT_ST": "loot",
        "LOOT": "loot",
        "ATTACK_ST": "attack",
        "ATTACK": "attack",
        "BERSERK_ST": "angry",
        "BERSERK": "angry",
        "AGGRESSIVE_ST": "angry",
        "AGGRESSIVE": "angry",
        "ANGRY": "angry",
        "CHASE_ST": "chase",
        "CHASE": "chase",
        "FOLLOW_ST": "follow",
        "FOLLOW": "follow",
        "ANY_ST": "any",
        "ANY": "any",
        "ANYTARGET_ST": "anytarget",
        "ANYTARGET": "anytarget",
    }

    _TARGET_MAP: Dict[str, str] = {
        "TARGET_ST": "target",
        "TARGET": "target",
        "SELF_ST": "self",
        "SELF": "self",
        "FRIEND_ST": "friend",
        "FRIEND": "friend",
        "MASTER_ST": "master",
        "MASTER": "master",
        "RANDOMTARGET_ST": "randomtarget",
        "RANDOMTARGET": "randomtarget",
        "AROUND_ST": "around",
        "AROUND": "around",
    }

    _COND_MAP: Dict[str, str] = {
        "ALWAYS": "always",
        "IF_ALWAYS": "always",
        "ONSPAWN": "onspawn",
        "IF_ONSPAWN": "onspawn",
        "HP": "myhpltmaxrate",
        "IF_HP": "myhpltmaxrate",
        "MYHPLTMAXRATE": "myhpltmaxrate",
        "IF_HPRANGE": "myhpinrate",
        "MYHPINRATE": "myhpinrate",
        "IF_STATUSON": "mystatuson",
        "IF_STATUS": "mystatuson",
        "STATUSON": "mystatuson",
        "MYSTATUSON": "mystatuson",
        "IF_HIDING": "mystatuson",
        "IF_STATUSOFF": "mystatusoff",
        "STATUSOFF": "mystatusoff",
        "MYSTATUSOFF": "mystatusoff",
        "IF_FRIENDHP": "friendhpltmaxrate",
        "IF_COMRADEHP": "friendhpltmaxrate",
        "FRIENDHP": "friendhpltmaxrate",
        "COMRADEHP": "friendhpltmaxrate",
        "FRIENDHPLTMAXRATE": "friendhpltmaxrate",
        "IF_FRIENDHPRANGE": "friendhpinrate",
        "FRIENDHPINRATE": "friendhpinrate",
        "IF_FRIENDSTATUSON": "friendstatuson",
        "FRIENDSTATUSON": "friendstatuson",
        "IF_FRIENDSTATUSOFF": "friendstatusoff",
        "FRIENDSTATUSOFF": "friendstatusoff",
        "IF_ATTACKPCGT": "attackpcgt",
        "ATTACKPCGT": "attackpcgt",
        "IF_ATTACKPCGE": "attackpcge",
        "ATTACKPCGE": "attackpcge",
        "IF_SLAVE": "slavelt",
        "IF_SLAVENUM": "slavelt",
        "SLAVENUM": "slavelt",
        "SLAVE": "slavelt",
        "SLAVELT": "slavelt",
        "IF_SLAVELE": "slavele",
        "SLAVELE": "slavele",
        "IF_CLOSEDATTACK": "closedattacked",
        "IF_CLOSEDATTACKED": "closedattacked",
        "CLOSEDATTACK": "closedattacked",
        "CLOSEDATTACKED": "closedattacked",
        "IF_RANGEATTACK": "longrangeattacked",
        "IF_RANGEATTACKED": "longrangeattacked",
        "RANGEATTACK": "longrangeattacked",
        "RANGEATTACKED": "longrangeattacked",
        "LONGRANGEATTACKED": "longrangeattacked",
        "IF_SKILLUSED": "skillused",
        "SKILLUSED": "skillused",
        "IF_AFTERSKILL": "afterskill",
        "AFTERSKILL": "afterskill",
        "IF_TARGET": "casttargeted",
        "IF_CASTTARGETED": "casttargeted",
        "CASTTARGETED": "casttargeted",
        "CASTSENSOR": "casttargeted",
        "IF_RUDEATTACK": "rudeattacked",
        "IF_RUDEATTACKED": "rudeattacked",
        "RUDEATTACK": "rudeattacked",
        "RUDEATTACKED": "rudeattacked",
        "IF_MONSTERCOUNT": "mobnearbygt",
        "IF_MOBCOUNT": "mobnearbygt",
        "MONSTERCOUNT": "mobnearbygt",
        "MOBCOUNT": "mobnearbygt",
        "MOBNEARBYGT": "mobnearbygt",
        "IF_GROUNDATTACK": "groundattacked",
        "IF_GROUNDATTACKED": "groundattacked",
        "IF_MAGICATTACK": "groundattacked",
        "IF_MAGICATTACKED": "groundattacked",
        "GROUNDATTACK": "groundattacked",
        "GROUNDATTACKED": "groundattacked",
        "IF_DAMAGEDGT": "damagedgt",
        "DAMAGEDGT": "damagedgt",
        "IF_ALCHEMIST": "alchemist",
        "ALCHEMIST": "alchemist",
        "IF_TRICKCASTING": "trickcasting",
        "TRICKCASTING": "trickcasting",
    }

    @classmethod
    def normalize_state(cls, raw_state: Any) -> str:
        if raw_state is None:
            return "idle"
        s = str(raw_state).strip().upper()
        if s in cls._STATE_MAP:
            return cls._STATE_MAP[s]
        s_clean = s.replace("STATE_", "").replace("_ST", "").lower()
        if s_clean in cls.RATHENA_STATES:
            return s_clean
        if s_clean in ("aggressive", "berserk"):
            return "angry"
        return "idle"

    @classmethod
    def normalize_target(cls, raw_target: Any) -> str:
        if raw_target is None:
            return "target"
        t = str(raw_target).strip().upper()
        if t in cls._TARGET_MAP:
            return cls._TARGET_MAP[t]
        t_clean = t.replace("TARGET_", "").replace("_ST", "").lower()
        if t_clean in cls.RATHENA_TARGETS:
            return t_clean
        return "target"

    @classmethod
    def normalize_condition(cls, raw_cond: Any) -> str:
        if raw_cond is None:
            return "always"
        c = str(raw_cond).strip().upper()
        if c in cls._COND_MAP:
            return cls._COND_MAP[c]
        c_clean = c.replace("CONDITION_", "").replace("IF_", "").replace("_", "").lower()
        if c_clean in cls.RATHENA_CONDITIONS:
            return c_clean
        return "always"

    @staticmethod
    def _safe_int(val: Any, default: int = 0) -> int:
        try:
            return int(val) if val not in (None, "", "null", "None") else default
        except (ValueError, TypeError):
            return default

    @classmethod
    def normalize_skill_entry(cls, entry: dict, mob_id: int = 0, dummy_name: str = "") -> dict:
        """Normalizes a raw mob skill entry (from DP JSON or form input) into exact rAthena spec."""
        if not isinstance(entry, dict):
            return {}

        skill_id = cls._safe_int(
            entry.get("skill_id") or entry.get("skillId") or entry.get("Skill") or entry.get("id"), 0
        )
        level = cls._safe_int(
            entry.get("skill_lv") or entry.get("level") or entry.get("Level"), 1
        )
        raw_rate = cls._safe_int(
            entry.get("rate") if entry.get("rate") is not None
            else (entry.get("chance") if entry.get("chance") is not None else entry.get("Rate")),
            10000
        )
        # DP chance is /10 (e.g. 700 = 70%), rAthena is /100 (e.g. 7000 = 70%).
        if 0 < raw_rate <= 1000:
            rate = raw_rate * 10
        elif raw_rate > 10000:
            rate = 10000
        elif raw_rate < 0:
            rate = 0
        else:
            rate = raw_rate

        cast_time = cls._safe_int(
            entry.get("cast_time") if entry.get("cast_time") is not None
            else (entry.get("castTime") if entry.get("castTime") is not None
                  else (entry.get("casttime") if entry.get("casttime") is not None else entry.get("CastTime"))),
            0
        )
        delay = cls._safe_int(
            entry.get("delay") if entry.get("delay") is not None else entry.get("Delay"),
            0
        )

        raw_cancel = entry.get("cancelable") if entry.get("cancelable") is not None else entry.get("interruptable")
        if isinstance(raw_cancel, bool):
            cancelable = raw_cancel
        elif raw_cancel is not None:
            cancelable = str(raw_cancel).lower() in ("yes", "1", "true")
        else:
            cancelable = False

        raw_state_val = entry.get("state") or entry.get("status") or entry.get("State")
        raw_cond_val = entry.get("condition_type") or entry.get("condition") or entry.get("ConditionType")

        # Special check: if condition is IF_DEAD, state -> dead and condition -> always
        cond_upper = str(raw_cond_val).strip().upper() if raw_cond_val is not None else ""
        if cond_upper in ("IF_DEAD", "DEAD_ST", "DEAD"):
            state = "dead"
            cond_type = "always"
        else:
            state = cls.normalize_state(raw_state_val)
            cond_type = cls.normalize_condition(raw_cond_val)

        target = cls.normalize_target(entry.get("target") or entry.get("Target"))

        raw_cval = entry.get("condition_value") if entry.get("condition_value") is not None else entry.get("conditionValue")
        cond_val = cls._safe_int(raw_cval, 0)

        mid = cls._safe_int(entry.get("mob_id") if entry.get("mob_id") is not None else mob_id, mob_id)
        dname = str(entry.get("dummy_name") or dummy_name or str(mid) if mid else "")

        result = {
            "mob_id": mid,
            "dummy_name": dname,
            "skill_id": skill_id,
            "skill_lv": level,
            "rate": rate,
            "state": state,
            "condition_type": cond_type,
            "condition_value": cond_val,
            "cast_time": cast_time,
            "delay": delay,
            "cancelable": cancelable,
            "target": target,
        }

        # Retain extra internal keys or val1..val5/emotion/chat if provided
        for opt_key in ("val1", "val2", "val3", "val4", "val5"):
            if opt_key in entry and entry[opt_key] is not None:
                result[opt_key] = cls._safe_int(entry[opt_key], 0)
        for opt_key in ("emotion", "chat"):
            if opt_key in entry and entry[opt_key] is not None:
                result[opt_key] = entry[opt_key]
        for meta_key in ("_line_index", "_source", "_raw"):
            if meta_key in entry:
                result[meta_key] = entry[meta_key]

        return result
