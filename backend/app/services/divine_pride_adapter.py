"""services/divine_pride_adapter.py — ETL adapter for Divine Pride API data.

Single Responsibility: receive raw JSON from Divine Pride and transform it into
dicts compatible with the Pydantic V2 DTOs (``ItemDBModel``, ``MobDBModelUpdate``).

**Critical rules enforced:**

1. **Default omission**: fields whose value equals the rAthena engine default are
   silently dropped — the final dump applies ``exclude_defaults=True``.
2. **LiteralScalarString**: scripts are wrapped to force pipe (``|``) block-style YAML.
3. **Implicit ``exclude_none``**: no ``None`` field is ever included in the result.
4. **Location correction**: DP ``equipLocation`` bitmask → ``ItemLocations`` dict.
5. **MobSkills**: only the internal editor keys are emitted (no CamelCase duplication).

**Live API alignment (2026-08):**

- Monster payload is **flat** — all stats at root level (no nested ``stats`` dict).
- ``element`` is a string (``"Water 1"``) not an int; ``race``/``size``/``type`` are plain
  English strings already, so numeric lookup tables are used only as a fallback.
- Drop chance field is ``probability`` (float, percentage) → multiply × 100 for rAthena.
- Drop steal-protection flag is ``isStealProtected``, not ``stealProtected``.
- MVP drops key is ``mvpDrops`` (camelCase capital D).
- Monster sprite field is ``spriteName``, not ``sprite``.
- Item buy/sell prices are ``buyPrice`` / ``sellPrice``.
- Item type is already a string (``"Consumable"``, ``"Armor"``, …) — ``itemTypeId`` gone.
- Item equip location is ``equipLocation`` (int bitmask), not ``LOCA``.
- Item scripts are in ``scripts`` (array of dicts with ``script`` key), not ``script``.
- Skill cast/cooldown fields are strings (``"0 sec"``, ``"0,5 sec"``) — parse them.
- Skill levels are in ``levelTable`` (array), not a top-level int per key.
- Skill display name is ``raw["name"]``; internal DB name is ``raw["databaseName"]``.
"""

import re
from typing import Any, Dict, List, Optional, Union
from ruamel.yaml.scalarstring import LiteralScalarString
from app.services.mob_skill_translator import MobSkillTranslator

_RO_COLOR_PATTERN = re.compile(r'\^[0-9A-Fa-f]{6}')

_RATHENA_SCRIPT_KEYWORDS: frozenset = frozenset({
    "bonus", "bonus2", "bonus3", "bonus4", "bonus5",
    "skill", "sc_start", "sc_end", "heal", "itemheal",
    "specialeffect", "callfunc", "callsub", "getitem",
    "delitem", "rentitem", "percentheal", "warp",
    "announce", "atcommand", "set", "if", "strcharinfo",
    "getcharid", "monster", "areamonster", "autobonus",
})


# ─── Lookup tables ────────────────────────────────────────────────────────────

_ELEMENT_TYPES: Dict[int, str] = {
    0: "Neutral", 1: "Water",  2: "Earth", 3: "Fire",   4: "Wind",
    5: "Poison",  6: "Holy",   7: "Dark",  8: "Ghost",  9: "Undead",
}

# Set of valid rAthena element names for quick membership check
_ELEMENT_NAMES: frozenset = frozenset(_ELEMENT_TYPES.values())

_RACE_TYPES: Dict[int, str] = {
    0: "Formless", 1: "Undead", 2: "Brute",  3: "Plant",    4: "Insect",
    5: "Fish",     6: "Demon",  7: "Demihuman", 8: "Angel", 9: "Dragon",
}

_SIZE_TYPES: Dict[int, str] = {0: "Small", 1: "Medium", 2: "Large"}
_SCALE_MAP: Dict[int, str] = _SIZE_TYPES
_RACE_MAP: Dict[int, str] = _RACE_TYPES

_CLASS_MAP: Dict[int, str] = {0: "Normal", 1: "Boss", 4: "Guardian"}

# Valid rAthena string values for race / size / class (pass-through if already correct)
_VALID_RACES: frozenset  = frozenset(_RACE_TYPES.values())
_VALID_SIZES: frozenset  = frozenset(_SIZE_TYPES.values())
_VALID_CLASSES: frozenset = frozenset(_CLASS_MAP.values())

# DP condition names (IF_XXX) → rAthena Condition values
_MOB_SKILL_COND_MAP: Dict[str, str] = {
    "IF_ALWAYS":         "always",
    "IF_RUDEATTACK":     "rudeattack",
    "IF_MONSTERCOUNT":   "mobcount",
    "IF_HP":             "hp",
    "IF_HIDING":         "hiding",
    "IF_SLAVE":          "slave",
    "IF_TARGET":         "target",
    "IF_MAGICATTACK":    "magicattacked",
    "IF_MASTERATTACKED": "masterattacked",
    "IF_DEAD":           "dead",
}

_ITEM_TYPE_MAP: Dict[int, str] = {
    0: "Consumable", 1: "Consumable", 2: "Consumable",
    3: "Etc",        4: "Weapon",     5: "Armor",
    6: "Card",       7: "PetEgg",     8: "PetArmor",
    9: "Ammo",       10: "Consumable",
}

# Location bitmask (RO client) → rAthena ItemLocations keys (official iRO/kRO table)
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

# Bitmasks that unambiguously identify an Armor-type item (garment, body, shoes, headgear…)
_ARMOR_LOCATION_BITS: int = (
    0x0001 | 0x0004 | 0x0008 | 0x0010 | 0x0040 |
    0x0080 | 0x0100 | 0x0200 | 0x0400 | 0x0800 |
    0x1000 | 0x2000 | 0x8000
)

# Bitmasks that indicate a Weapon slot (right-hand or left-hand weapon)
_WEAPON_LOCATION_BITS: int = 0x0002 | 0x0020

# rAthena official defaults: fields with these values are NOT written to YAML
_ITEM_DEFAULTS: Dict[str, Any] = {
    "Type":           "Etc",
    "Defense":        0,
    "Attack":         0,
    "MagicAttack":    0,
    "Weight":         0,
    "Buy":            0,
    "Sell":           0,
    "Slots":          0,
    "EquipLevelMin":  0,
    "EquipLevelMax":  0,
    "Range":          0,
    "Gender":         "Both",
    "Refineable":     False,
    "Gradable":       False,
    "Indestructible": False,
    "ArmorLevel":     1,
    "WeaponLevel":    1,
    "View":           0,
}

_MOB_DEFAULTS: Dict[str, Any] = {
    "Sp":              0,
    "BaseExp":         0,
    "JobExp":          0,
    "MvpExp":          0,
    "Attack2":         0,
    "Resistance":      0,
    "MagicResistance": 0,
    "WalkSpeed":       150,
    "ElementLevel":    1,
    "DamageTaken":     100,
    "Class":           "Normal",
}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _safe_int(val: Any, default: int = 0) -> int:
    """Safely converts input to integer; returns default on failure."""
    try:
        return int(val if val is not None else default)
    except (ValueError, TypeError):
        return default


def _omit_defaults(data: dict, defaults: Dict[str, Any]) -> dict:
    """Remove do dict qualquer chave cujo valor seja igual ao default do rAthena."""
    return {k: v for k, v in data.items() if defaults.get(k, object()) != v}


def _infer_type_from_location(bitmask: int) -> Optional[str]:
    """Infers the rAthena item ``Type`` from the equipment location bitmask.

    Used as a sanity layer when ``itemTypeId`` from Divine Pride is absent,
    zero, or maps to an implausible type (e.g. ``Consumable`` for an item
    with equip-slot bits set).  Writing an incorrect ``Type`` to
    ``item_db.yml`` causes map-server crashes on load.

    Args:
        bitmask: Raw ``location`` integer from the Divine Pride item payload.

    Returns:
        ``"Armor"`` if the bitmask contains armour-slot bits,
        ``"Weapon"`` if it contains weapon-slot bits,
        ``None`` if the bitmask is zero or unrecognised (no override applied).
    """
    if not bitmask:
        return None
    if bitmask & _ARMOR_LOCATION_BITS:
        return "Armor"
    if bitmask & _WEAPON_LOCATION_BITS:
        return "Weapon"
    return None


def _resolve_item_name(raw: Dict[str, Any], item_id: int) -> str:
    """Extracts the English display name from a Divine Pride item payload.

    Fallback chain:
        1. ``globalization[language==0].name``
        2. ``globalization[0].name`` (any language)
        3. ``raw["name"]`` (top-level, may be non-English for newer items)
        4. ``sets[*].items[*].name`` where ``itemId == item_id`` (DP stores the
           display name inside the set entries, e.g. "White Knight's Physical Mantle [1]")
        5. ``raw["aegisName"]`` as-is (e.g. ``WM_Physical_LT``)
        6. ``f"ITEM_{item_id}"`` (last-resort placeholder)

    Args:
        raw: Full raw item dictionary from Divine Pride.
        item_id: Numeric item ID used for cache lookup and the placeholder fallback.

    Returns:
        Best available English name string.
    """
    globalization = raw.get("globalization")
    if isinstance(globalization, list) and globalization:
        entry = next(
            (e for e in globalization if isinstance(e, dict) and _safe_int(e.get("language"), -1) == 0),
            None,
        )
        if entry is None:
            entry = next((e for e in globalization if isinstance(e, dict)), None)
        if entry:
            candidate = str(entry.get("name") or "").strip()
            if candidate:
                return candidate

    top_level = str(raw.get("name") or "").strip()
    if top_level:
        return top_level

    # Fallback: extract name from sets[].items[] where itemId matches
    for set_entry in (raw.get("sets") or []):
        if not isinstance(set_entry, dict):
            continue
        for it in (set_entry.get("items") or []):
            if isinstance(it, dict) and _safe_int(it.get("itemId") or it.get("id"), 0) == item_id:
                candidate = str(it.get("name") or "").strip()
                if candidate:
                    return candidate

    aegis_fallback = str(raw.get("aegisName") or raw.get("dbname") or "").strip()
    return aegis_fallback if aegis_fallback else f"ITEM_{item_id}"


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
    """Envolve um script em LiteralScalarString para forçar o pipe ``|`` no YAML.

    Args:
        script: Raw script string from the Divine Pride payload or editor input.

    Returns:
        LiteralScalarString suitable for ruamel.yaml block-scalar output,
        or ``None`` if the input is empty/whitespace-only.
    """
    if not script or not str(script).strip():
        return None
    s = str(script).strip()
    return LiteralScalarString(s if s.endswith("\n") else s + "\n")


def _is_server_script(text: str) -> bool:
    """Determines whether a Divine Pride script string is rAthena server-side logic.

    A script is considered server-side when it contains at least one recognised
    rAthena bonus/skill keyword.  Strings that exclusively contain RO client
    colour tokens (``^RRGGBB``) and no bonus keywords are classified as
    client-side (lore/visual) and must **never** be written to ``Script:`` in
    ``item_combo_db.yml`` — doing so would crash the map-server.

    Args:
        text: Raw script string from the ``sets[].script`` field of a Divine
              Pride item payload.

    Returns:
        ``True`` if the string contains a valid rAthena script keyword.
        ``False`` if the content is purely visual/descriptive (client-side).
    """
    lower = text.lower()
    return any(kw in lower for kw in _RATHENA_SCRIPT_KEYWORDS)


def _strip_ro_color_tokens(text: str) -> str:
    """Removes RO client colour tokens (``^RRGGBB``) from a string.

    Intended **only** for producing human-readable YAML comment lines.
    The return value must never be written to a server-side ``Script:`` field.

    Args:
        text: Raw string potentially containing ``^000000``-style colour tokens
              from the Ragnarok Online client format.

    Returns:
        Sanitized plain-text string with all colour tokens removed.
    """
    return _RO_COLOR_PATTERN.sub('', text).strip()


def _get_element(raw_element: Any) -> tuple:
    """Decodes a Divine Pride element field into ``(element_name, level)``.

    The live DP API returns a **string** such as ``"Water 1"`` or ``"Neutral"``.
    Legacy/internal callers may still pass an integer encoded as
    ``level * 10 + type_index``.  Both forms are handled.

    Args:
        raw_element: String (``"Fire 3"``) or integer from the DP payload.

    Returns:
        Tuple of (element_name: str, level: int) where level is clamped to [1, 4].
    """
    if isinstance(raw_element, str) and raw_element.strip():
        # Format: "<ElementName> <level>" or just "<ElementName>"
        parts = raw_element.strip().split()
        element_name = parts[0].capitalize() if parts else "Neutral"
        if element_name not in _ELEMENT_NAMES:
            element_name = "Neutral"
        try:
            element_level = max(1, min(4, int(parts[1]))) if len(parts) > 1 else 1
        except (ValueError, IndexError):
            element_level = 1
        return element_name, element_level

    # Legacy integer encoding: level * 10 + type_index
    raw_int = _safe_int(raw_element, 0)
    element_type_idx = raw_int % 10
    element_level    = raw_int // 10
    return _ELEMENT_TYPES.get(element_type_idx, "Neutral"), max(1, min(4, element_level))


def _parse_dp_seconds(value: Any, default: float = 0.0) -> float:
    """Parses a Divine Pride time string such as ``"0,5 sec"`` or ``"1 sec"`` into
    a float number of seconds.

    Args:
        value: Raw string from the DP payload (commas used as decimal separator).
        default: Value returned when parsing fails or input is empty/dash.

    Returns:
        Float seconds value, or ``default`` if the input cannot be parsed.
    """
    if value is None:
        return default
    s = str(value).strip()
    if not s or s in ("-", ""):
        return default
    # Remove " sec" suffix and replace comma decimal separator
    s = s.lower().replace(" sec", "").replace(",", ".").strip()
    try:
        return float(s)
    except ValueError:
        return default


# ─── Adapter ─────────────────────────────────────────────────────────────────

class DivinePrideAdapter:
    """
    Adapter (Padrão ETL — Transform) entre o JSON do Divine Pride e os DTOs
    Pydantic V2 do rAthena Web Editor.

    Cada método `adapt_*` retorna um dict pronto para ser passado diretamente
    a `ItemDBModel(**result)` ou `MobDBModelUpdate(**result)`.

    Dependência injetada: `item_db_service` expe o método
    `get_aegisname_by_id(item_id: int) -> Optional[str]` sem fazer
    nenhuma requisição HTTP — busca apenas em memória local.
    """

    def __init__(self, item_db_service=None):
        """
        Args:
            item_db_service: Qualquer objeto que implemente
                             `get_aegisname_by_id(int) -> Optional[str]`.
                             Se None, os drops serão mantidos como inteiros (fallback seguro).
        """
        self._item_db = item_db_service

    # ── Helpers Internos ─────────────────────────────────────────────────────

    def _resolve_item_ref(
        self,
        item_id: int,
        raw_current_item: Optional[Dict[str, Any]] = None,
        dp_item_dict: Optional[Dict[str, Any]] = None
    ) -> Union[str, int]:
        """
        Traduz um itemId numérico do Divine Pride para o AegisName local ou do payload.

        Regra de Fallback (conforme CONVENTIONS.md, Union[str, int]):
          - Item no banco local (yaml_db) → retorna AegisName (str)
          - Item atual sendo importado → retorna dbname/aegisName (str)
          - Item no payload do Divine Pride → retorna dbname/aegisName/name (str)
          - Item não encontrado → retorna item_id (int)
        """
        if self._item_db is not None:
            aegis = self._item_db.get_aegisname_by_id(item_id)
            if aegis:
                return aegis

        if raw_current_item and isinstance(raw_current_item, dict):
            current_id = _safe_int(raw_current_item.get("id"), 0)
            if current_id == item_id or item_id == 0:
                name = raw_current_item.get("dbname") or raw_current_item.get("aegisName")
                if name:
                    return str(name)

        if dp_item_dict and isinstance(dp_item_dict, dict):
            name = dp_item_dict.get("dbname") or dp_item_dict.get("aegisName") or dp_item_dict.get("name")
            if name:
                return str(name)

        return item_id

    def _item_exists(
        self,
        item_id: int,
        raw_current_item: Optional[Dict[str, Any]] = None,
        dp_item_dict: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Reports whether a numeric item ID can be resolved to a known AegisName."""
        resolved = self._resolve_item_ref(item_id, raw_current_item, dp_item_dict)
        return isinstance(resolved, str)

    # ── Item ─────────────────────────────────────────────────────────────────────────────────────

    def adapt_item(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Transforms raw Divine Pride item JSON into an ``ItemDBModel``-compatible dict.

        Aligned with the live DP API (2026-08):

        - **buyPrice / sellPrice** are the price fields (``price`` is gone).
        - **type** is already a string (``"Consumable"``, ``"Armor"`` …).
        - **equipLocation** is the bitmask (``LOCA`` / ``location`` are absent).
        - **scripts** is an array of dicts; the first item with a non-null ``script``
          key is used as the item ``Script:`` value.
        - **weight** arrives as a plain integer (no ×10 conversion needed).
        - **Trade**: ``itemMoveInfo`` keys ``canDrop``, ``canTrade`` … are booleans
          (also available at root level as ``canDrop``, ``canTrade`` …).
        - **Refineable / Indestructible**: only emitted for equipment.
        - **Defaults omitted**: fields equal to rAthena engine defaults are not written.
        """
        if not isinstance(raw, dict):
            raw = {}

        item_id = _safe_int(raw.get("id"), 0)
        name    = _resolve_item_name(raw, item_id)
        aegis   = str(raw.get("aegisName") or raw.get("dbname") or "").strip()
        if not aegis:
            aegis = _to_aegis_name(name, item_id)

        # Weight: live API delivers the raw integer already (no ×10 conversion)
        try:
            weight = int(raw.get("weight") or 0)
        except (ValueError, TypeError):
            weight = 0

        # Type: live API delivers a ready string ("Consumable", "Armor", "Weapon" …)
        # Legacy fallback: itemTypeId integer map still accepted.
        raw_type_str = str(raw.get("type") or "").strip()
        if raw_type_str in ("Consumable", "Armor", "Weapon", "Card", "Etc",
                            "PetEgg", "PetArmor", "Ammo"):
            item_type = raw_type_str
        else:
            item_type = _ITEM_TYPE_MAP.get(_safe_int(raw.get("itemTypeId"), 3), "Etc")

        # Location — live API uses ``equipLocation`` (int bitmask).
        # Legacy fallback: ``LOCA`` / ``location`` still accepted.
        location_bitmask = _safe_int(
            raw.get("equipLocation") or raw.get("LOCA") or raw.get("location") or 0
        )

        # Type sanity: cross-validate against location bitmask and requiredLevel.
        # A wrong Type in item_db.yml causes map-server crashes on startup.
        if item_type in ("Consumable", "Etc"):
            inferred: Optional[str] = None
            if location_bitmask:
                inferred = _infer_type_from_location(location_bitmask)
            if not inferred and _safe_int(raw.get("requiredLevel"), 0) > 0:
                inferred = _infer_type_from_location(location_bitmask) or "Armor"
            if inferred:
                item_type = inferred

        # Prices: live API uses ``buyPrice`` and ``sellPrice``.
        # Legacy fallback: ``price`` (old field) still accepted.
        buy_price  = _safe_int(raw.get("buyPrice")  or raw.get("price"),  0)
        sell_price = _safe_int(raw.get("sellPrice"), buy_price // 2 if buy_price > 0 else 0)

        defense = _safe_int(
            raw.get("defense") or raw.get("defRate") or raw.get("armorDefense"), 0
        )

        # Refineable / Indestructible only apply to equipment (Armor, Weapon).
        # Consumables and Etc items cannot be refined or destroyed in rAthena.
        _is_equipment      = item_type in ("Armor", "Weapon")
        refinable_raw      = raw.get("refinable")
        indestructible_raw = raw.get("indestructible")
        refineable     = (False if refinable_raw is False else True)  if _is_equipment else False
        indestructible = (True  if indestructible_raw is True else False) if _is_equipment else False

        result: Dict[str, Any] = {
            "Id":             item_id,
            "AegisName":      aegis,
            "Name":           name,
            "Type":           item_type,
            "Buy":            buy_price,
            "Sell":           sell_price,
            "Weight":         weight,
            "Attack":         _safe_int(raw.get("attack"), 0),
            "MagicAttack":    _safe_int(raw.get("matk") or raw.get("magicAttack"), 0),
            "Defense":        defense,
            "Slots":          _safe_int(raw.get("slots"), 0),
            "Refineable":     refineable,
            "Indestructible": indestructible,
            "EquipLevelMin":  _safe_int(raw.get("requiredLevel"), 0),
            "EquipLevelMax":  _safe_int(raw.get("limitLevel"), 0),
        }

        # Locations (equipLocation bitmask → ItemLocations dict)
        if location_bitmask:
            locations = _decode_location_bitmask(location_bitmask)
            if locations:
                result["Locations"] = locations

        # Trade restrictions.
        # Live API: ``itemMoveInfo`` dict with keys ``drop``, ``trade``, ``store`` …
        # Fallback: root-level ``canDrop``, ``canTrade`` … booleans.
        _DP_TRADE_MAP = (
            ("drop",        "canDrop",         "NoDrop"),
            ("trade",       "canTrade",        "NoTrade"),
            ("sell",        "canSellToNpc",    "NoSell"),
            ("cart",        "canCart",         "NoCart"),
            ("store",       "canStore",        "NoStorage"),
            ("guildStore",  "canGuildStorage", "NoGuildStorage"),
            ("mail",        "canMail",         "NoMail"),
            ("auction",     "canAuction",      "NoAuction"),
        )
        move_info = raw.get("itemMoveInfo") or {}
        trade: Dict[str, bool] = {}
        for mi_key, root_key, ra_key in _DP_TRADE_MAP:
            # itemMoveInfo value=False means NOT allowed → write restriction
            val = move_info.get(mi_key)
            if val is None:
                # Fallback to root-level canX booleans (False = restricted)
                val = raw.get(root_key)
            if val is False:
                trade[ra_key] = True
        if trade:
            result["Trade"] = trade

        # Scripts — live API returns ``scripts`` array of dicts.
        # Each dict may have ``script``, ``equipScript``, ``unequipScript`` keys.
        # Also accept legacy top-level ``script`` / ``equipScript`` strings.
        scripts_arr = raw.get("scripts") or []
        _script_fields = [
            ("script",        "Script"),
            ("equipScript",   "EquipScript"),
            ("unequipScript", "UnEquipScript"),
        ]
        for dp_key, ra_key in _script_fields:
            # Try array first, then top-level
            script_val = None
            for s_entry in scripts_arr:
                if isinstance(s_entry, dict) and s_entry.get(dp_key):
                    script_val = s_entry[dp_key]
                    break
            if not script_val:
                script_val = raw.get(dp_key)
            if script_val:
                wrapped = _wrap_script(str(script_val))
                if wrapped:
                    result[ra_key] = wrapped

        # Extra relations/metadata from Divine Pride
        sold_by = raw.get("soldByEntries") or raw.get("soldBy")
        if sold_by:
            result["SoldBy"] = sold_by
        if raw.get("sources"):
            result["Sources"] = raw.get("sources")
        if raw.get("containedIn"):
            result["ContainedIn"] = raw.get("containedIn")
        if raw.get("contains"):
            result["Contains"] = raw.get("contains")

        result = _omit_defaults(result, _ITEM_DEFAULTS)
        result = {k: v for k, v in result.items() if v is not None}

        return result

    # ── Item Combos ──────────────────────────────────────────────────────────

    def adapt_item_combos(self, raw: Dict[str, Any], item_id: int) -> List[Dict[str, Any]]:
        """Extracts and validates combo entries from the Divine Pride ``sets`` key.

        Applies two scenarios based on local cache availability:

        - **Scenario A** — all combo item IDs exist in the local ``item_db``:
          Resolves each ID to its AegisName and annotates with a human-readable
          comment listing the resolved names.
        - **Scenario B** — one or more IDs are missing from the local cache:
          Replaces unknown IDs with ``501`` (``Red_Potion``) as a safe placeholder
          to prevent map-server crashes, and annotates with a ``TODO`` comment
          listing the original unknown IDs for manual resolution.

        Script classification (server vs client-side):

        - If ``sets[].script`` passes ``_is_server_script()``, it is wrapped as
          a ``LiteralScalarString`` for the YAML ``Script:`` field.
        - Otherwise the raw text is demoted to a ``_visual_script_note`` comment
          and the ``Script:`` field is **omitted** from the output to avoid
          crashing the map-server parser.

        Args:
            raw: Full raw item dictionary received from Divine Pride.
            item_id: Numeric ID of the item currently being imported (used as
                     anchor when the DP payload omits the current item from a set).

        Returns:
            List of combo descriptor dicts.  Each dict contains:

            - ``combo_items`` (``List[Union[str, int]]``): AegisNames or ``501`` placeholders.
            - ``script`` (``Optional[LiteralScalarString]``): Server-side script or ``None``.
            - ``_yaml_comment`` (``str``): Header comment for the YAML block.
            - ``_visual_script_note`` (``Optional[str]``): Client-side script demoted to comment.
            - ``has_missing_items`` (``bool``): Whether any placeholder was applied.
            - ``original_ids`` (``List[int]``): Original IDs from the DP payload.
            - ``script_is_server_side`` (``bool``): Classification result.

            Returns an empty list when ``sets`` is absent or empty.
        """
        sets = raw.get("sets") or []
        if not sets or not isinstance(sets, list):
            return []

        results: List[Dict[str, Any]] = []

        for set_entry in sets:
            if not isinstance(set_entry, dict):
                continue

            dp_items = set_entry.get("items") or []
            if not isinstance(dp_items, list):
                continue

            dp_item_map: Dict[int, Dict[str, Any]] = {}
            original_ids: List[int] = []

            for it in dp_items:
                if not isinstance(it, dict):
                    continue
                id_ = _safe_int(it.get("itemId") or it.get("id"), 0)
                if id_ > 0:
                    dp_item_map[id_] = it
                    original_ids.append(id_)

            if len(original_ids) < 2:
                continue

            # Classify the DP script field
            dp_script = str(set_entry.get("script") or "").strip()
            if dp_script and _is_server_script(dp_script):
                server_script: Optional[LiteralScalarString] = _wrap_script(dp_script)
                visual_note: Optional[str] = None
                script_is_server = True
            elif dp_script:
                server_script = None
                visual_note = _strip_ro_color_tokens(dp_script)
                script_is_server = False
            else:
                server_script = None
                visual_note = None
                script_is_server = False

            # Scenario A / B: validate IDs against local cache or payload context
            missing_ids = [
                id_ for id_ in original_ids
                if not self._item_exists(id_, raw_current_item=raw, dp_item_dict=dp_item_map.get(id_))
            ]
            has_missing = bool(missing_ids)

            if has_missing:
                combo_items: List[Union[str, int]] = [
                    self._resolve_item_ref(id_, raw_current_item=raw, dp_item_dict=dp_item_map.get(id_))
                    if self._item_exists(id_, raw_current_item=raw, dp_item_dict=dp_item_map.get(id_))
                    else "Red_Potion"
                    for id_ in original_ids
                ]
                missing_str = " and ".join(str(id_) for id_ in missing_ids)
                yaml_comment = f"# TODO: Combo Item ID {missing_str}"
            else:
                combo_items = [
                    self._resolve_item_ref(id_, raw_current_item=raw, dp_item_dict=dp_item_map.get(id_))
                    for id_ in original_ids
                ]
                name_str = " + ".join(str(item) for item in combo_items)
                yaml_comment = f"# {name_str}"

            results.append({
                "combo_items":         combo_items,
                "script":              server_script,
                "_yaml_comment":       yaml_comment,
                "_visual_script_note": f"# DP script (client-side): {visual_note}" if visual_note else None,
                "has_missing_items":   has_missing,
                "original_ids":        original_ids,
                "script_is_server_side": script_is_server,
            })

        return results

    # ── Monster ───────────────────────────────────────────────────────────────

    def adapt_monster(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Transforms raw Divine Pride monster JSON into a ``MobDBModelUpdate``-compatible dict.

        Aligned with the live DP API (2026-08) where the payload is **flat** — all
        stats live at root level (no nested ``stats`` dict).

        Key field mappings:

        - ``spriteName``          → ``SpriteName``
        - ``element`` (str)       → ``Element`` + ``ElementLevel`` (parsed from ``"Water 1"``)
        - ``race`` / ``size`` / ``type`` (strings) → used as-is; int fallback retained.
        - ``speed``               → ``WalkSpeed`` (float, converted to int ms-equivalent)
        - ``attackSpeed``         → ``AttackMotion``
        - ``def``                 → ``Defense``
        - ``mDef``                → ``MagicDefense``
        - ``res`` / ``mRes``      → ``Resistance`` / ``MagicResistance``
        - Drop ``probability``    → ``Rate`` (float % → × 100 → int, capped at 10000)
        - Drop ``isStealProtected`` → ``StealProtected``
        - ``mvpDrops``            → ``MvpDrops`` (capital D)
        - ``skills``              → ``MobSkills`` (via ``MobSkillTranslator``)
        """
        if not isinstance(raw, dict):
            raw = {}

        mob_id = _safe_int(raw.get("id"), 0)
        name   = str(raw.get("name") or f"MOB_{mob_id}")
        aegis  = str(raw.get("dbname") or raw.get("aegisName") or f"MOB_{mob_id}")
        # Live API: spriteName (not sprite)
        sprite = str(raw.get("spriteName") or raw.get("sprite") or aegis)

        # Element — live API: string "Water 1"; legacy: int encoded as level*10+type
        element_str, element_level = _get_element(raw.get("element") or 0)
        # elementLevel is also provided directly in the live payload
        if raw.get("elementLevel") is not None:
            element_level = max(1, min(4, _safe_int(raw["elementLevel"], element_level)))

        # Size, Race, Class — live API returns strings already; int fallback preserved.
        raw_race  = raw.get("race")  or ""
        raw_size  = raw.get("size")  or ""
        raw_class = raw.get("type")  or "Normal"

        race_str  = raw_race  if raw_race  in _VALID_RACES   else _RACE_MAP.get(_safe_int(raw_race,  0), "Formless")
        size_str  = raw_size  if raw_size  in _VALID_SIZES   else _SCALE_MAP.get(_safe_int(raw_size, 1), "Medium")
        class_str = raw_class if raw_class in _VALID_CLASSES else _CLASS_MAP.get(_safe_int(raw_class, 0), "Normal")

        # AI — live API does not expose ai; default to "01" (passive)
        raw_ai = str(raw.get("ai") or raw.get("aiFlag") or "01").strip()
        m = re.search(r"(\d+)$", raw_ai)
        ai_str = m.group(1).zfill(2) if m else "01"

        # Attack — live API: ``attackRange`` is a string range ("1 - 1"); stats are flat.
        attack  = _safe_int(raw.get("atk1") or raw.get("attack"), 0)
        attack2 = _safe_int(raw.get("atk2") or raw.get("attack2"), 0)

        # Timing — live API: ``speed`` (float, lower = faster), ``attackSpeed`` (float s)
        # rAthena WalkSpeed is in ms; DP ``speed`` appears to be tiles/sec → approximate.
        # Use direct ms values where available, fall back to DP floats.
        raw_speed = raw.get("speed")
        if raw_speed is not None:
            try:
                walk_speed = max(20, int(1000.0 / float(raw_speed))) if float(raw_speed) > 0 else 150
            except (ValueError, TypeError):
                walk_speed = 150
        else:
            walk_speed = _safe_int(raw.get("movementSpeed"), 150)

        raw_atk_spd = raw.get("attackSpeed")
        if raw_atk_spd is not None:
            try:
                attack_delay  = max(100, int(float(raw_atk_spd) * 1000))
                attack_motion = max(100, int(float(raw_atk_spd) * 1000))
            except (ValueError, TypeError):
                attack_delay  = 1000
                attack_motion = 500
        else:
            attack_delay  = _safe_int(raw.get("rechargeTime"), 1000)
            attack_motion = _safe_int(raw.get("attackMotion"), 500)
        damage_motion = _safe_int(raw.get("attackedSpeed") or raw.get("damageMotion"), 500)

        # Modes — live API does not directly expose MVP flag in a numeric field;
        # detect from mvpDrops presence or type=="Boss".
        modes: Dict[str, bool] = {}
        if raw.get("mvpDrops") or raw.get("mvpdrops"):
            modes["Mvp"] = True
        if class_str == "Boss" and not modes.get("Mvp"):
            # Boss without mvp drops = miniboss; add NoCast flag typically
            pass

        # Drops — live API: ``probability`` (float %) → rAthena Rate (int, 1=0.01%, 10000=100%)
        # Filter rows where probability is 0 or None (DP placeholder rows).
        drops: List[Dict[str, Any]] = []
        for drop in (raw.get("drops") or []):
            if not isinstance(drop, dict):
                continue
            item_id = _safe_int(drop.get("itemId") or drop.get("id") or drop.get("Item"), 0)
            if item_id <= 0:
                continue
            # probability is a float percentage (e.g. 0.7 = 0.7% = 700 in rAthena units)
            prob = drop.get("probability") or drop.get("chance") or drop.get("rate") or 0
            try:
                rate = min(10000, max(0, int(round(float(prob) * 100))))
            except (ValueError, TypeError):
                rate = 0
            if rate == 0:
                continue
            entry: Dict[str, Any] = {"Item": self._resolve_item_ref(item_id), "Rate": rate}
            # isStealProtected is the live API field (not stealProtected)
            if drop.get("isStealProtected") is True or drop.get("stealProtected") is True:
                entry["StealProtected"] = True
            drops.append(entry)

        # MvpDrops — live API key: ``mvpDrops`` (camelCase, capital D)
        mvp_exp: int = _safe_int(raw.get("mvpExperience"), 0)
        mvp_drops: List[Dict[str, Any]] = []
        for drop in (raw.get("mvpDrops") or raw.get("mvpdrops") or []):
            if not isinstance(drop, dict):
                continue
            item_id = _safe_int(drop.get("itemId") or drop.get("id") or drop.get("Item"), 0)
            if item_id <= 0:
                continue
            prob = drop.get("probability") or drop.get("chance") or drop.get("rate") or 0
            try:
                rate = min(10000, max(0, int(round(float(prob) * 100))))
            except (ValueError, TypeError):
                rate = 0
            if rate == 0:
                continue
            entry = {"Item": self._resolve_item_ref(item_id), "Rate": rate}
            if drop.get("isStealProtected") is True or drop.get("stealProtected") is True:
                entry["StealProtected"] = True
            mvp_drops.append(entry)

        # MobSkills — live API key: ``skills`` (not ``skill``)
        mob_skills: List[Dict[str, Any]] = []
        for sk in (raw.get("skills") or raw.get("skill") or []):
            if not isinstance(sk, dict):
                continue
            normalized_sk = MobSkillTranslator.normalize_skill_entry(sk, mob_id=mob_id, dummy_name=aegis)
            if normalized_sk and normalized_sk.get("skill_id", 0) > 0:
                mob_skills.append(normalized_sk)

        result: Dict[str, Any] = {
            "Id":              mob_id,
            "AegisName":       aegis,
            "SpriteName":      sprite,
            "Name":            name,
            "Level":           _safe_int(raw.get("level"), 1),
            "Hp":              _safe_int(raw.get("health"), 1),
            "Sp":              _safe_int(raw.get("sp") or raw.get("magicHealth"), 0),
            "BaseExp":         _safe_int(raw.get("baseExperience"), 0),
            "JobExp":          _safe_int(raw.get("jobExperience"), 0),
            "Attack":          attack,
            "Attack2":         attack2,
            # live API: "def" (reserved keyword — accessed via .get)
            "Defense":         _safe_int(raw.get("def") or raw.get("defense"), 0),
            "MagicDefense":    _safe_int(raw.get("mDef") or raw.get("magicDefense"), 0),
            "Str":             _safe_int(raw.get("str"), 1),
            "Agi":             _safe_int(raw.get("agi"), 1),
            "Vit":             _safe_int(raw.get("vit"), 1),
            "Int":             _safe_int(raw.get("int"), 1),
            "Dex":             _safe_int(raw.get("dex"), 1),
            "Luk":             _safe_int(raw.get("luk"), 1),
            # attackRange: live API is a string range "1 - 1" → take first int
            "AttackRange":     _safe_int(str(raw.get("attackRange") or "1").split("-")[0].strip(), 1),
            "SkillRange":      _safe_int(raw.get("aggroRange") or raw.get("skillRange") or raw.get("range"), 10),
            "ChaseRange":      _safe_int(raw.get("escapeRange") or raw.get("chaseRange"), 12),
            "Size":            size_str,
            "Race":            race_str,
            "Element":         element_str,
            "ElementLevel":    element_level,
            "Class":           class_str,
            "WalkSpeed":       walk_speed,
            "AttackDelay":     attack_delay,
            "AttackMotion":    attack_motion,
            "DamageMotion":    damage_motion,
            "Resistance":      _safe_int(raw.get("res") or raw.get("mRes"), 0),
            "MagicResistance": _safe_int(raw.get("mRes") or raw.get("magicResistance"), 0),
            "Ai":              ai_str,
            "Modes":           modes if modes else None,
            "Drops":           drops if drops else None,
        }

        if mvp_exp > 0:
            result["MvpExp"] = mvp_exp
        if mvp_drops:
            result["MvpDrops"] = mvp_drops
        if mob_skills:
            result["MobSkills"] = mob_skills

        # Extra relations/metadata from Divine Pride
        if raw.get("spawns"):
            result["Spawns"] = raw.get("spawns")
        elem_res = raw.get("elementResistances")
        if elem_res:
            result["ElementalDamage"] = elem_res
        if raw.get("expPenaltyTable"):
            result["ExpPenaltyTable"] = raw.get("expPenaltyTable")

        result = _omit_defaults(result, _MOB_DEFAULTS)
        result = {k: v for k, v in result.items() if v is not None}

        return result

    # ── Skill ─────────────────────────────────────────────────────────────────

    def adapt_skill(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Transforma JSON de Skill do DP → dict compatível com SkillModel.

        Aligned with the live DP API (2026-08):

        - ``name`` is the display name; ``databaseName`` is the internal constant.
        - ``description`` is the rendered description (no ``globalization`` array).
        - ``levelTable`` is an array of objects with per-level timing strings such as
          ``"0 sec"`` or ``"0,5 sec"`` — parsed via ``_parse_dp_seconds``.
        - Top-level ``castTime`` / ``cooldown`` are aggregate strings for the whole skill.
        - ``prerequisites`` is an array of ``{skillId, skillLevel}`` dicts.
        - ``monsterUsers`` / ``itemUsers`` contain related entity arrays.
        """
        if not isinstance(raw, dict):
            raw = {}

        skill_id  = _safe_int(raw.get("id"), 0)
        max_level = _safe_int(raw.get("maxLevel"), 1)

        # Name: display name; fallback chain includes databaseName and placeholder.
        # Legacy globalization array still supported as final fallback.
        name = str(raw.get("name") or "").strip()
        if not name:
            globalization = raw.get("globalization")
            if isinstance(globalization, list):
                entry = next(
                    (e for e in globalization if isinstance(e, dict) and _safe_int(e.get("language"), -1) == 0),
                    next((e for e in globalization if isinstance(e, dict)), None),
                )
                if entry:
                    name = str(entry.get("name") or "").strip()
        if not name:
            name = str(raw.get("databaseName") or f"SKILL_{skill_id}")

        db_name     = str(raw.get("databaseName") or "").strip() or None
        description = str(raw.get("description") or raw.get("rawDescription") or "").strip()

        result: Dict[str, Any] = {
            "Id":          skill_id,
            "Name":        name,
            "Description": description or None,
            "MaxLevel":    max_level,
        }

        if db_name:
            result["DatabaseName"] = db_name

        # Range — live API: string "-" means N/A → skip
        raw_range = raw.get("range")
        if raw_range is not None and str(raw_range).strip() not in ("", "-"):
            result["Range"] = _safe_int(raw_range)

        # TargetType / SkillType
        if raw.get("targetType") and str(raw["targetType"]).strip():
            result["TargetType"] = str(raw["targetType"]).strip()
        if raw.get("skillType") and str(raw["skillType"]).strip():
            result["SkillType"] = str(raw["skillType"]).strip()

        # Element — live API: string ("Fire") or int or empty string
        raw_elem = raw.get("element")
        if raw_elem is not None and str(raw_elem).strip():
            elem_str_candidate = str(raw_elem).strip().capitalize()
            if elem_str_candidate in _ELEMENT_NAMES:
                result["Element"] = elem_str_candidate
            else:
                elem_int = _safe_int(raw_elem, -1)
                if elem_int >= 0 and elem_int in _ELEMENT_TYPES:
                    result["Element"] = _ELEMENT_TYPES[elem_int]

        # Top-level cast/cooldown strings (aggregate for whole skill, not per-level)
        # Live API: string values like "0,5 sec" or "-"; parse to float seconds.
        _timing_map = [
            ("castTime",         "CastTime"),
            ("fixedCastTime",    "FixedCastTime"),
            ("variableCastTime", "VariableCastTime"),
            ("globalCooldown",   "GlobalCooldown"),
            ("skillCooldown",    "SkillCooldown"),
            ("cooldown",         "SkillCooldown"),   # legacy key
        ]
        for dp_key, ra_key in _timing_map:
            if ra_key in result:
                continue  # already filled by a higher-priority key
            val = raw.get(dp_key)
            if val is None:
                continue
            parsed = _parse_dp_seconds(val)
            if parsed > 0:
                result[ra_key] = parsed

        # LevelTable — live API: array of objects per level with per-level timing strings.
        # Normalize each entry to float seconds so consumers don't deal with string parsing.
        raw_level_table = raw.get("levelTable")
        if isinstance(raw_level_table, list) and raw_level_table:
            parsed_levels = []
            for lvl_entry in raw_level_table:
                if not isinstance(lvl_entry, dict):
                    continue
                parsed_entry: Dict[str, Any] = {"level": _safe_int(lvl_entry.get("level"), 0)}
                for t_key in ("fixedCastTime", "variableCastTime", "globalCooldown", "skillCooldown"):
                    raw_t = lvl_entry.get(t_key)
                    if raw_t is not None:
                        parsed_entry[t_key] = _parse_dp_seconds(raw_t)
                parsed_levels.append(parsed_entry)
            if parsed_levels:
                result["LevelTable"] = parsed_levels

        # Prerequisites
        if raw.get("prerequisites") is not None:
            result["Prerequisites"] = raw["prerequisites"]

        # Monster / item users
        if raw.get("monsterUsers") is not None:
            result["Monsters"] = raw["monsterUsers"]
        elif raw.get("monsters") is not None:
            result["Monsters"] = raw["monsters"]

        if raw.get("itemUsers") is not None:
            result["ItemUsers"] = raw["itemUsers"]

        # SP cost (display string, not YAML-serialized — kept for frontend preview)
        if raw.get("spCost") and str(raw["spCost"]).strip():
            result["SpCost"] = str(raw["spCost"]).strip()

        # Icon URL (for frontend display only)
        if raw.get("iconUrl"):
            result["IconUrl"] = raw["iconUrl"]

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

    # ── Quest ─────────────────────────────────────────────────────────────────

    def adapt_quest(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Transforma JSON de Quest do DP → formato estruturado do Web Editor."""
        if not isinstance(raw, dict):
            raw = {}

        quest_id = _safe_int(raw.get("id"), 0)
        title = str(raw.get("Title") or raw.get("title") or raw.get("name") or f"QUEST_{quest_id}")
        description = str(raw.get("Description") or raw.get("description") or "")
        summary = str(raw.get("Summary") or raw.get("summary") or "")

        result: Dict[str, Any] = {
            "Id":          quest_id,
            "Title":       title,
            "Description": description,
            "Summary":     summary,
        }

        if raw.get("RewardExp") is not None or raw.get("rewardExp") is not None:
            result["RewardExp"] = _safe_int(raw.get("RewardExp") or raw.get("rewardExp"), 0)
        if raw.get("RewardJobExp") is not None or raw.get("rewardJobExp") is not None:
            result["RewardJobExp"] = _safe_int(raw.get("RewardJobExp") or raw.get("rewardJobExp"), 0)
        if raw.get("rewardItems") or raw.get("RewardItems"):
            result["RewardItems"] = raw.get("rewardItems") or raw.get("RewardItems")
        if raw.get("dropItems") or raw.get("DropItems"):
            result["DropItems"] = raw.get("dropItems") or raw.get("DropItems")
        if raw.get("huntingList") or raw.get("HuntingList"):
            result["HuntingList"] = raw.get("huntingList") or raw.get("HuntingList")
        if raw.get("coolDown") or raw.get("Cooldown"):
            result["Cooldown"] = _safe_int(raw.get("coolDown") or raw.get("Cooldown"), 0)

        return {k: v for k, v in result.items() if v is not None}

    # ── Efst ──────────────────────────────────────────────────────────────────

    def adapt_efst(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Transforma JSON de Status Effect (Efst) do DP → formato estruturado."""
        if not isinstance(raw, dict):
            raw = {}

        efst_id = _safe_int(raw.get("id"), 0)
        name = str(raw.get("name") or raw.get("aegisName") or raw.get("title") or f"EFST_{efst_id}")
        description = str(raw.get("description") or raw.get("rawDescription") or "")

        result: Dict[str, Any] = {
            "Id":          efst_id,
            "Name":        name,
            "Description": description or None,
            "IconUrl":     raw.get("iconUrl") or raw.get("icon"),
            "Group":       raw.get("group"),
            "Type":        raw.get("type"),
        }

        return {k: v for k, v in result.items() if v is not None}


# ─── Singleton global ──────────────────────────────────────────────────────────────────────────────
# O singleton é instanciado com injeção de dependência do yaml_db.
# Importação tardia (lazy) para evitar import circular entre serviços.
def _make_adapter() -> DivinePrideAdapter:
    from app.services.yaml_parser import yaml_db
    return DivinePrideAdapter(item_db_service=yaml_db)

dp_adapter = _make_adapter()
