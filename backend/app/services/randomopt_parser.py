"""randomopt_parser.py — Parser and writer for rAthena Random Option YAML databases.

Manages three related files:

- ``item_randomopt_db.yml``: Option definitions.
- ``item_randomopt_group.yml``: Option groups (weighted random pools).
- ``laphine_upgrade.yml``: Laphine upgrade option tables.

All files are lazily loaded via ``initialize()`` and kept in raw ruamel.yaml objects
for lossless in-place updates.

Key design decisions
--------------------
* **Surgical saves**: only the file whose content actually changed is written to disk.
  ``laphine_upgrade.yml`` is *never* touched unless the caller provides ``LaphineData``
  with a non-empty ``Item`` or ``TargetItems``.
* **ruamel.yaml indent**: ``mapping=2, sequence=2, offset=2`` mirrors the native rAthena
  indentation style (sequence items are NOT doubly-indented).  This prevents the emitter
  from re-indenting the entire document on the first round-trip.
* **In-place mutation**: existing entries are updated on their ``CommentedMap`` objects so
  comments, anchors and per-key formatting are preserved.  A brand-new entry is built as a
  plain dict (ruamel converts it on dump).
* **exclude_defaults**: ``Param: 0`` is the rAthena default and is therefore *omitted*
  from new/updated entries, keeping the diff minimal.
"""

import os
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq
from typing import Any, Dict, List, Optional


def _make_yaml() -> YAML:
    """Factory that returns a YAML instance configured to match the rAthena file style.

    rAthena uses ``mapping=2, sequence=2, offset=2``, meaning sequence items sit
    exactly two spaces past the parent mapping key — *not* the four-space offset that
    ruamel's default produces.
    """
    y = YAML()
    y.preserve_quotes = True
    y.default_flow_style = False
    y.indent(mapping=2, sequence=2, offset=2)
    return y


class RandomOptParser:
    """Parser and in-place writer for the three Random Option YAML databases.

    All three YAML files are loaded lazily on the first call to ``initialize()``
    and kept as live ``ruamel.yaml`` objects so that saves preserve comments and
    original formatting.

    Attributes:
        db_base_path: Resolved rAthena ``db/`` root path.
        options_file_path: Path to ``item_randomopt_db.yml``.
        groups_file_path: Path to ``item_randomopt_group.yml``.
        laphine_file_path: Path to ``laphine_upgrade.yml``.
        options_data: Parsed flat list of option entries.
        groups_data: Parsed flat list of group entries with linked option details.
    """

    def __init__(self):
        self.yaml = _make_yaml()

        self.db_base_path = ""
        self.options_file_path = ""
        self.groups_file_path = ""
        self.laphine_file_path = ""

        self.options_data: List[Dict[str, Any]] = []
        self.groups_data: List[Dict[str, Any]] = []

        self.raw_options_yaml = None
        self.raw_groups_yaml = None
        self.raw_laphine_yaml = None

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    def initialize(self, force: bool = False) -> None:
        """Lazily loads all three YAML files and populates the in-memory data stores.

        No-ops if data is already loaded and ``force`` is ``False``.

        Args:
            force: If ``True``, reloads all files unconditionally.
        """
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

        mode = (
            "re"
            if os.path.exists(f"{self.db_base_path}/re/item_randomopt_db.yml")
            else (
                "pre-re"
                if os.path.exists(f"{self.db_base_path}/pre-re/item_randomopt_db.yml")
                else "re"
            )
        )
        self.options_file_path = f"{self.db_base_path}/{mode}/item_randomopt_db.yml"
        self.groups_file_path = f"{self.db_base_path}/{mode}/item_randomopt_group.yml"
        self.laphine_file_path = f"{self.db_base_path}/{mode}/laphine_upgrade.yml"

        self._load_file_into("options", self.options_file_path)
        self._load_file_into("groups", self.groups_file_path)
        self._load_file_into("laphine", self.laphine_file_path)

        self.parse_data()

    def _load_file_into(self, attr: str, path: str) -> None:
        """Loads a single YAML file into the corresponding ``raw_*_yaml`` attribute.

        Args:
            attr: One of ``"options"``, ``"groups"``, or ``"laphine"``.
            path: Absolute file path to read.
        """
        if not os.path.exists(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = self.yaml.load(fh)
            setattr(self, f"raw_{attr}_yaml", data)
        except Exception as exc:  # noqa: BLE001
            print(f"[!] randomopt_parser: error reading {path}: {exc}")

    # ------------------------------------------------------------------
    # Parsing
    # ------------------------------------------------------------------

    def parse_data(self) -> None:
        """Parses the loaded raw YAML objects into flat Python lists.

        Populates ``options_data`` (from ``item_randomopt_db.yml``) and
        ``groups_data`` (from ``item_randomopt_group.yml``, enriched with
        option details from ``options_data``).
        """
        self.options_data = []
        self.groups_data = []

        # 1. Parse option definitions
        if self.raw_options_yaml and "Body" in self.raw_options_yaml:
            body = self.raw_options_yaml["Body"]
            if isinstance(body, list):
                for item in body:
                    if isinstance(item, dict) and "Id" in item and "Option" in item:
                        self.options_data.append(
                            {"Id": item["Id"], "Option": item["Option"]}
                        )

        # 2. Build laphine lookup: group_name.upper() -> laphine_info
        laphine_map: Dict[str, Dict[str, Any]] = {}
        if self.raw_laphine_yaml and "Body" in self.raw_laphine_yaml:
            l_body = self.raw_laphine_yaml["Body"]
            if isinstance(l_body, list):
                for entry in l_body:
                    if isinstance(entry, dict) and "RandomOptionGroup" in entry:
                        group_key = str(entry["RandomOptionGroup"]).strip().upper()
                        target_items: List[Dict[str, str]] = []
                        for t in entry.get("TargetItems", []) or []:
                            if isinstance(t, dict) and "Item" in t:
                                target_items.append({"Item": str(t["Item"])})
                            elif isinstance(t, str):
                                target_items.append({"Item": t})
                        laphine_map[group_key] = {
                            "Item": entry.get("Item", ""),
                            "RequiredRandomOptions": entry.get("RequiredRandomOptions", 0),
                            "ResultRefine": entry.get("ResultRefine", None),
                            "TargetItems": target_items,
                        }

        # 3. Parse groups with laphine JOIN
        if self.raw_groups_yaml and "Body" in self.raw_groups_yaml:
            body = self.raw_groups_yaml["Body"]
            if isinstance(body, list):
                for item in body:
                    if not (isinstance(item, dict) and "Id" in item and "Group" in item):
                        continue

                    group_name = str(item["Group"]).strip()

                    # Slots
                    parsed_slots: List[Dict[str, Any]] = []
                    for s in item.get("Slots", []) or []:
                        if not isinstance(s, dict):
                            continue
                        opts_list = []
                        for opt in s.get("Options", []) or []:
                            if isinstance(opt, dict):
                                opts_list.append(
                                    {
                                        "Option": opt.get("Option", ""),
                                        "MinValue": opt.get("MinValue", 0),
                                        "MaxValue": opt.get("MaxValue", 0),
                                        "Param": opt.get("Param", 0),
                                        "Chance": opt.get("Chance", 0),
                                    }
                                )
                        parsed_slots.append(
                            {"Slot": s.get("Slot", len(parsed_slots) + 1), "Options": opts_list}
                        )

                    # Random pool
                    parsed_random: List[Dict[str, Any]] = []
                    for opt in item.get("Random", []) or []:
                        if isinstance(opt, dict):
                            parsed_random.append(
                                {
                                    "Option": opt.get("Option", ""),
                                    "MinValue": opt.get("MinValue", 0),
                                    "MaxValue": opt.get("MaxValue", 0),
                                    "Param": opt.get("Param", 0),
                                    "Chance": opt.get("Chance", 0),
                                }
                            )

                    # Flat options for compatibility
                    flat_opts = [
                        {"Option": o["Option"], "Chance": o["Chance"]}
                        for s in parsed_slots
                        for o in s["Options"]
                    ] or [
                        {"Option": o["Option"], "Chance": o["Chance"]}
                        for o in parsed_random
                    ]

                    laphine_entry = laphine_map.get(
                        group_name.upper(),
                        {
                            "Item": "",
                            "RequiredRandomOptions": 0,
                            "ResultRefine": None,
                            "TargetItems": [],
                        },
                    )

                    self.groups_data.append(
                        {
                            "Id": item["Id"],
                            "Group": group_name,
                            "Slots": parsed_slots,
                            "MaxRandom": item.get("MaxRandom", 0),
                            "Random": parsed_random,
                            "Options": flat_opts,
                            "LaphineData": laphine_entry,
                        }
                    )

    # ------------------------------------------------------------------
    # Saving — public surface
    # ------------------------------------------------------------------

    def save_unified_group(self, group_data: Dict[str, Any]) -> bool:
        """Saves or updates a single group entry using surgical in-place writes.

        Only ``item_randomopt_group.yml`` is written.  ``laphine_upgrade.yml`` is
        written **only** when the group carries non-empty ``LaphineData`` (i.e. the
        user explicitly set a trigger item or target items).

        Args:
            group_data: Unified group dict as produced by the frontend.

        Returns:
            ``True`` on success, ``False`` on any write error.
        """
        self.initialize()

        if not self.raw_groups_yaml:
            self.raw_groups_yaml = CommentedMap(
                {
                    "Header": CommentedMap({"Type": "RANDOM_OPTION_GROUP", "Version": 1}),
                    "Body": CommentedSeq(),
                }
            )

        body = self.raw_groups_yaml.get("Body")
        if not isinstance(body, list):
            self.raw_groups_yaml["Body"] = CommentedSeq()
            body = self.raw_groups_yaml["Body"]

        gid = group_data.get("Id")

        # Find existing CommentedMap entry (preserves inline comments)
        existing_yaml_entry: Optional[CommentedMap] = None
        for entry in body:
            if isinstance(entry, dict) and entry.get("Id") == gid:
                existing_yaml_entry = entry
                break

        if existing_yaml_entry is not None:
            self._update_group_entry(existing_yaml_entry, group_data)
        else:
            body.append(self._build_new_group_entry(group_data))

        ok = self._write_yaml(self.groups_file_path, self.raw_groups_yaml)
        if not ok:
            return False

        # Laphine: only write if this group actually has meaningful laphine data
        laphine_changed = self._apply_laphine_for_group(group_data)
        if laphine_changed:
            ok = self._write_yaml(self.laphine_file_path, self.raw_laphine_yaml)
            if not ok:
                return False

        self.initialize(force=True)
        return True

    def save_groups(self, groups_list: List[Dict[str, Any]]) -> bool:
        """Bulk-saves multiple groups (legacy / global-save path).

        Each group is mutated in-place on ``raw_groups_yaml`` to preserve comments.
        ``laphine_upgrade.yml`` is only written if at least one group has
        non-empty ``LaphineData``.

        Args:
            groups_list: List of unified group dicts.

        Returns:
            ``True`` if all writes succeeded, ``False`` on first error.
        """
        self.initialize()

        if not self.raw_groups_yaml:
            self.raw_groups_yaml = CommentedMap(
                {
                    "Header": CommentedMap({"Type": "RANDOM_OPTION_GROUP", "Version": 1}),
                    "Body": CommentedSeq(),
                }
            )

        body = self.raw_groups_yaml.get("Body")
        if not isinstance(body, list):
            self.raw_groups_yaml["Body"] = CommentedSeq()
            body = self.raw_groups_yaml["Body"]

        existing_map: Dict[Any, CommentedMap] = {
            e["Id"]: e for e in body if isinstance(e, dict) and "Id" in e
        }

        new_body: list = []
        for g_input in groups_list:
            gid = g_input.get("Id")
            if gid in existing_map:
                yaml_entry = existing_map[gid]
                self._update_group_entry(yaml_entry, g_input)
                new_body.append(yaml_entry)
            else:
                new_body.append(self._build_new_group_entry(g_input))

        # Replace body preserving the CommentedSeq wrapper if present
        if hasattr(body, "clear"):
            body.clear()
            body.extend(new_body)
        else:
            self.raw_groups_yaml["Body"] = new_body

        if not self._write_yaml(self.groups_file_path, self.raw_groups_yaml):
            return False

        laphine_dirty = False
        for g_input in groups_list:
            if self._apply_laphine_for_group(g_input):
                laphine_dirty = True

        if laphine_dirty:
            if not self._write_yaml(self.laphine_file_path, self.raw_laphine_yaml):
                return False

        self.initialize(force=True)
        return True

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _update_group_entry(
        self, yaml_entry: CommentedMap, group_data: Dict[str, Any]
    ) -> None:
        """Mutates an existing ``CommentedMap`` in-place.

        Only the keys explicitly provided by ``group_data`` are touched.
        Existing keys not present in ``group_data`` (and their comments) are
        left untouched.

        Args:
            yaml_entry: Live ``CommentedMap`` from ``raw_groups_yaml["Body"]``.
            group_data: Incoming group dict from the frontend.
        """
        yaml_entry["Group"] = group_data.get("Group", yaml_entry.get("Group"))

        slots = group_data.get("Slots")
        if slots is not None:
            yaml_entry["Slots"] = self._build_slots(slots)

        max_random = group_data.get("MaxRandom")
        if max_random is not None:
            yaml_entry["MaxRandom"] = max_random

        random_opts = group_data.get("Random")
        if random_opts is not None:
            if random_opts:
                yaml_entry["Random"] = self._build_random_opts(random_opts)
            else:
                yaml_entry.pop("Random", None)

    def _build_new_group_entry(self, group_data: Dict[str, Any]) -> dict:
        """Builds a fresh dict for a brand-new group entry.

        Args:
            group_data: Incoming group dict from the frontend.

        Returns:
            Plain ``dict`` that ruamel will serialize correctly.
        """
        # Handle legacy format: only "Options" list, no Slots/Random breakdown
        slots = group_data.get("Slots")
        random_opts = group_data.get("Random")
        if slots is None and random_opts is None:
            gopts = group_data.get("Options", [])
            slots = [{"Slot": 1, "Options": [
                {"Option": o.get("Option"), "Chance": o.get("Chance", 0)}
                for o in gopts
            ]}]
            random_opts = []

        entry: Dict[str, Any] = {
            "Id": group_data["Id"],
            "Group": group_data.get("Group", f"Group_{group_data['Id']}"),
            "Slots": self._build_slots(slots or []),
            "MaxRandom": group_data.get("MaxRandom") or 0,
        }
        if random_opts:
            entry["Random"] = self._build_random_opts(random_opts)
        return entry

    @staticmethod
    def _build_slots(slots: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Converts frontend slot list to the rAthena-compatible structure.

        Fields that match rAthena defaults (``Param: 0``) are **omitted** to
        keep the YAML clean (``exclude_defaults`` pattern).

        Args:
            slots: List of slot dicts from the frontend.

        Returns:
            Cleaned list suitable for YAML serialization.
        """
        result = []
        for s in slots:
            opts = []
            for o in s.get("Options", []):
                opt_dict: Dict[str, Any] = {"Option": o["Option"]}
                if o.get("MinValue", 0) not in (None, 0):
                    opt_dict["MinValue"] = o["MinValue"]
                if o.get("MaxValue", 0) not in (None, 0):
                    opt_dict["MaxValue"] = o["MaxValue"]
                # Param: 0 is the rAthena default — omit it (exclude_defaults)
                if o.get("Param", 0) not in (None, 0):
                    opt_dict["Param"] = o["Param"]
                opt_dict["Chance"] = o.get("Chance", 0)
                opts.append(opt_dict)
            result.append({"Slot": s["Slot"], "Options": opts})
        return result

    @staticmethod
    def _build_random_opts(opts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Converts frontend random option list omitting rAthena default values.

        Args:
            opts: List of random option dicts from the frontend.

        Returns:
            Cleaned list suitable for YAML serialization.
        """
        result = []
        for o in opts:
            opt_dict: Dict[str, Any] = {"Option": o["Option"]}
            if o.get("MinValue", 0) not in (None, 0):
                opt_dict["MinValue"] = o["MinValue"]
            if o.get("MaxValue", 0) not in (None, 0):
                opt_dict["MaxValue"] = o["MaxValue"]
            # Param: 0 is the rAthena default — omit it
            if o.get("Param", 0) not in (None, 0):
                opt_dict["Param"] = o["Param"]
            opt_dict["Chance"] = o.get("Chance", 0)
            result.append(opt_dict)
        return result

    def _apply_laphine_for_group(self, group_data: Dict[str, Any]) -> bool:
        """Mutates ``raw_laphine_yaml`` for a single group if needed.

        Returns:
            ``True`` if ``raw_laphine_yaml`` was actually modified (caller must
            write the file); ``False`` otherwise (caller must skip writing).
        """
        laphine_data = group_data.get("LaphineData")
        if not laphine_data:
            return False

        group_name = str(group_data.get("Group", "")).strip()
        if not group_name:
            return False

        trigger_item = str(laphine_data.get("Item", "")).strip()
        req_opts = laphine_data.get("RequiredRandomOptions", 0)
        res_refine = laphine_data.get("ResultRefine", None)
        raw_targets = laphine_data.get("TargetItems", []) or []

        norm_targets: List[Dict[str, str]] = []
        for t in raw_targets:
            if isinstance(t, dict) and "Item" in t and str(t["Item"]).strip():
                norm_targets.append({"Item": str(t["Item"]).strip()})
            elif isinstance(t, str) and t.strip():
                norm_targets.append({"Item": t.strip()})

        # No meaningful laphine data — nothing to do, do NOT touch the file
        if not trigger_item and not norm_targets:
            return False

        if not self.raw_laphine_yaml:
            self.raw_laphine_yaml = CommentedMap(
                {
                    "Header": CommentedMap({"Type": "LAPHINE_UPGRADE_DB", "Version": 1}),
                    "Body": CommentedSeq(),
                }
            )

        body = self.raw_laphine_yaml.get("Body")
        if not isinstance(body, list):
            self.raw_laphine_yaml["Body"] = CommentedSeq()
            body = self.raw_laphine_yaml["Body"]

        existing_entry: Optional[CommentedMap] = None
        for entry in body:
            if (
                isinstance(entry, dict)
                and str(entry.get("RandomOptionGroup", "")).strip().upper()
                == group_name.upper()
            ):
                existing_entry = entry
                break

        if existing_entry is not None:
            if trigger_item:
                existing_entry["Item"] = trigger_item
            existing_entry["RandomOptionGroup"] = group_name
            if res_refine is not None and res_refine != "":
                existing_entry["ResultRefine"] = int(res_refine)
            else:
                existing_entry.pop("ResultRefine", None)
            if req_opts and int(req_opts) > 0:
                existing_entry["RequiredRandomOptions"] = int(req_opts)
            else:
                existing_entry.pop("RequiredRandomOptions", None)
            existing_entry["TargetItems"] = norm_targets
        else:
            new_entry: Dict[str, Any] = {
                "Item": trigger_item or "Applicator_Item",
                "RandomOptionGroup": group_name,
            }
            if res_refine is not None and res_refine != "":
                new_entry["ResultRefine"] = int(res_refine)
            if req_opts and int(req_opts) > 0:
                new_entry["RequiredRandomOptions"] = int(req_opts)
            new_entry["TargetItems"] = norm_targets
            body.append(new_entry)

        return True

    def _write_yaml(self, path: str, data: Any) -> bool:
        """Writes a ruamel document to disk, creating parent directories as needed.

        Args:
            path: Absolute path to the target file.
            data: ruamel.yaml document object.

        Returns:
            ``True`` on success, ``False`` on any OS/serialization error.
        """
        if not path or not data:
            return False
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                self.yaml.dump(data, fh)
            return True
        except Exception as exc:  # noqa: BLE001
            print(f"[!] randomopt_parser: error writing {path}: {exc}")
            return False


randomopt_db = RandomOptParser()
