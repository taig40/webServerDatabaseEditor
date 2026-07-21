"""services/divine_pride_adapter.py — ETL adapter for Divine Pride API data.

Single Responsibility: receive raw JSON from Divine Pride and transform it into
dicts compatible with the Pydantic V2 DTOs (``ItemDBModel``, ``MobDBModelUpdate``).

**Critical rules enforced:**

1. **Default omission**: fields whose value equals the rAthena engine default are
   silently dropped — the final dump applies ``exclude_defaults=True``.
2. **LiteralScalarString**: scripts are wrapped to force pipe (``|``) block-style YAML.
3. **Implicit ``exclude_none``**: no ``None`` field is ever included in the result.
4. **Location correction**: DP bitmask → ``ItemLocations`` dict (official iRO/kRO table).
5. **MobSkills**: only the internal editor keys are emitted (no CamelCase duplication).
"""

import re
from typing import Any, Dict, List, Optional, Union
from ruamel.yaml.scalarstring import LiteralScalarString

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

    def _resolve_item_ref(self, item_id: int) -> Union[str, int]:
        """
        Traduz um itemId numérico do Divine Pride para o AegisName local.

        Regra de Fallback (conforme CONVENTIONS.md, Union[str, int]):
          - Item encontrado no banco local → retorna AegisName (str)
          - Item não encontrado (item novo/desconhecido) → retorna item_id (int)

        Busca exclusivamente no cache em memória. Zero requisições HTTP adicionais.
        """
        if self._item_db is None:
            return item_id
        aegis = self._item_db.get_aegisname_by_id(item_id)
        return aegis if aegis is not None else item_id

    def _item_exists(self, item_id: int) -> bool:
        """Reports whether a numeric item ID exists in the local in-memory cache.

        Args:
            item_id: Numeric rAthena item ID to look up.

        Returns:
            ``True`` if the ID resolves to a known AegisName; ``False`` otherwise
            (including when no ``item_db_service`` was injected).
        """
        if self._item_db is None:
            return False
        return self._item_db.get_aegisname_by_id(item_id) is not None

    # ── Item ─────────────────────────────────────────────────────────────────────────────────────

    def adapt_item(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Transforms raw Divine Pride item JSON into an ``ItemDBModel``-compatible dict.

        Corrections applied:

        - **Name**: resolved via ``globalization[]`` fallback chain before ``name`` root key.
        - **Type**: cross-validated against the ``location`` bitmask — prevents mapping an
          armour as ``Consumable`` when ``itemTypeId`` is absent or zero in the DP payload.
        - **Defense**: multi-field lookup (``defense`` → ``defRate`` → ``armorDefense``).
        - **Defaults omitted**: fields equal to rAthena engine defaults are not written.
        - **Locations**: bitmask decoded to ``ItemLocations`` dict.
        - **Scripts**: wrapped in ``LiteralScalarString`` for YAML pipe-block style.
        """
        if not isinstance(raw, dict):
            raw = {}

        item_id = _safe_int(raw.get("id"), 0)
        name    = _resolve_item_name(raw, item_id)
        aegis   = str(raw.get("aegisName") or raw.get("dbname") or "").strip()
        if not aegis:
            aegis = _to_aegis_name(name, item_id)

        try:
            weight = int(round(float(raw.get("weight") or 0) * 10))
        except (ValueError, TypeError):
            weight = 0

        raw_type  = _safe_int(raw.get("itemTypeId"), 3)
        item_type = _ITEM_TYPE_MAP.get(raw_type, "Etc")

        # Sanity check: if itemTypeId produced a non-equipment type but signals
        # indicate equipment, override — writing a wrong Type to item_db.yml crashes
        # the map-server.
        #
        # Signal 1: location bitmask has known equip-slot bits.
        # Signal 2: requiredLevel > 0 — consumables use UseLv, not EquipLv.
        #           When DP sends requiredLevel > 0 but location = 0, we default to
        #           Armor (safer than Consumable for any equip item).
        location_raw = raw.get("location")
        location_bitmask = _safe_int(location_raw) if location_raw is not None else 0
        if item_type in ("Consumable", "Etc"):
            inferred: Optional[str] = None
            if location_bitmask:
                inferred = _infer_type_from_location(location_bitmask)
            if not inferred and _safe_int(raw.get("requiredLevel"), 0) > 0:
                # requiredLevel implies an equip slot; use location hint or default Armor
                inferred = _infer_type_from_location(location_bitmask) or "Armor"
            if inferred:
                item_type = inferred

        price = _safe_int(raw.get("price"), 0)
        sell  = price // 2 if price > 0 else 0

        # Defense: DP uses 'defense' for most items; newer endpoints may use alternatives.
        defense = _safe_int(
            raw.get("defense") or raw.get("defRate") or raw.get("armorDefense"), 0
        )

        result: Dict[str, Any] = {
            "Id":        item_id,
            "AegisName": aegis,
            "Name":      name,
            "Type":      item_type,
            "Buy":       price,
            "Sell":      sell,
            "Weight":    weight,
            "Attack":    _safe_int(raw.get("attack"), 0),
            "Defense":   defense,
            "Slots":     _safe_int(raw.get("slots"), 0),
            "EquipLevelMin": _safe_int(raw.get("requiredLevel"), 0),
            "EquipLevelMax": _safe_int(raw.get("limitLevel"), 0),
        }

        # Locations (bitmask → dict)
        if location_bitmask:
            locations = _decode_location_bitmask(location_bitmask)
            if locations:
                result["Locations"] = locations

        # Scripts
        for dp_key, ra_key in [("script", "Script"), ("equipScript", "EquipScript"), ("unequipScript", "UnEquipScript")]:
            script = raw.get(dp_key)
            if script:
                wrapped = _wrap_script(str(script))
                if wrapped:
                    result[ra_key] = wrapped

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

            # DP uses 'itemId' (not 'id') inside sets[].items[]
            original_ids = [
                _safe_int(it.get("itemId") or it.get("id"), 0)
                for it in dp_items
                if isinstance(it, dict) and _safe_int(it.get("itemId") or it.get("id"), 0) > 0
            ]

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

            # Scenario A / B: validate IDs against local cache
            missing_ids = [id_ for id_ in original_ids if not self._item_exists(id_)]
            has_missing = bool(missing_ids)

            if has_missing:
                combo_items: List[Union[str, int]] = [
                    self._resolve_item_ref(id_) if self._item_exists(id_) else 501
                    for id_ in original_ids
                ]
                missing_str = " and ".join(str(id_) for id_ in missing_ids)
                yaml_comment = f"# TODO: Combo Item ID {missing_str}"
            else:
                combo_items = [self._resolve_item_ref(id_) for id_ in original_ids]
                name_str = " + ".join(
                    str(self._resolve_item_ref(id_)) for id_ in original_ids
                )
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
                # Traduz itemId → AegisName (fallback para int se não encontrado)
                drops.append({"Item": self._resolve_item_ref(item_id), "Rate": rate})

        # MVP Drops
        mvp_exp  = _safe_int(raw.get("mvpExperience") or stats.get("mvpExperience"), 0)
        mvp_drops: List[Dict[str, Any]] = []
        for drop in (raw.get("mvpDrops") or stats.get("mvpDrops") or []):
            if not isinstance(drop, dict):
                continue
            item_id = _safe_int(drop.get("itemId") or drop.get("id") or drop.get("Item"), 0)
            rate    = _safe_int(drop.get("chance") or drop.get("rate") or drop.get("Rate"), 0)
            if item_id > 0:
                # Traduz itemId → AegisName (fallback para int se não encontrado)
                mvp_drops.append({"Item": self._resolve_item_ref(item_id), "Rate": rate})

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


# ─── Singleton global ──────────────────────────────────────────────────────────────────────────────
# O singleton é instanciado com injeção de dependência do yaml_db.
# Importação tardia (lazy) para evitar import circular entre serviços.
def _make_adapter() -> DivinePrideAdapter:
    from app.services.yaml_parser import yaml_db
    return DivinePrideAdapter(item_db_service=yaml_db)

dp_adapter = _make_adapter()
