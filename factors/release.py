"""The FrozenRelease contract — the only thing the resolver is allowed to see.

Deliberately not shaped like a spreadsheet. Today a release is produced from an
XLSX by an adapter; later it will come from a SustainFactor release or a
replicated dataset. The resolver must not change when the source does, so the
source never appears in this vocabulary.

    XLSX / CSV  ──► adapter ──►  FrozenRelease  ──► resolver
    SustainFactor ─┘                  ▲
                                      only this is stable

Four things the real GHG Protocol workbook forced into the contract, each found
by reading the file rather than imagining it:

1. A value is not always a scalar. "0.215 - 0.725" appears in the published
   table. A range is carried as a range and is never silently averaged; the
   resolver decides what to do with it, visibly.

2. Units vary row to row inside one table — g/km for one region, g/mile for
   another — so the unit belongs to the factor, not the table.

3. One spreadsheet row can yield several factors. A stationary combustion row
   carries an energy-basis factor, a mass-basis factor, a calorific value and a
   density. Those are four different records, not one.

4. Some factors do not exist directly. The distance table publishes CH4 and N2O
   only; CO2 per kilometre has to be derived from fuel economy and a fuel CO2
   factor. That derivation is a modelling decision, so the contract records what
   is present and lets the resolver return DERIVATION_REQUIRED rather than
   quietly computing something.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path

CONTRACT_VERSION = "1.0"

# quantity kinds a unit can belong to; conversion inside a kind is mechanical,
# conversion across kinds needs a governed conversion factor
QUANTITY_KINDS = {"distance", "volume", "mass", "energy", "count",
                  "area", "time", "mass_distance", "currency"}

VALUE_KINDS = {"SCALAR", "RANGE"}


@dataclass
class Unit:
    code: str                     # "g/km", "kgCO2/TJ"
    quantity_kind: str            # of the DENOMINATOR
    si_factor: float | None = None   # to the kind's SI base; None = unknown
    note: str | None = None


@dataclass
class Gas:
    code: str                     # CO2 | CH4 | N2O | CO2E
    gwp_ar5: float | None = None
    gwp_ar6: float | None = None
    is_aggregate: bool = False    # CO2E is an aggregate, CO2 is not


@dataclass
class Factor:
    factor_id: str
    category_path: list[str]      # ["Oil products", "Jet kerosene"]
    selector: dict                # {"region":"US","vehicle":"Passenger Car",...}
    gas: str
    value_kind: str               # SCALAR | RANGE
    value: float | None           # None when RANGE
    value_low: float | None = None
    value_high: float | None = None
    unit_numerator: str = ""      # "g", "kg CO2"
    unit_denominator: str = ""    # "km", "TJ", "tonne"
    region_code: str | None = None
    reference_year: int | None = None
    year_range: str | None = None  # "1984-1993" as published
    source_sheet: str = ""
    source_row: int = 0
    notes: str | None = None


@dataclass
class Conversion:
    """A governed conversion between quantity kinds.

    Net calorific value and density are conversions, not emission factors, and
    keeping them apart stops the resolver treating a density as something it can
    multiply an activity by.
    """
    conversion_id: str
    from_unit: str
    to_unit: str
    from_kind: str
    to_kind: str
    selector: dict                # {"fuel": "Jet kerosene"}
    value: float
    source_sheet: str = ""
    source_row: int = 0


@dataclass
class FrozenRelease:
    release_id: str
    publisher: str
    dataset_version: str
    source_file: str
    source_sha256: str
    contract_version: str = CONTRACT_VERSION
    published_at: str | None = None
    published_by: str | None = None
    units: list[Unit] = field(default_factory=list)
    gases: list[Gas] = field(default_factory=list)
    factors: list[Factor] = field(default_factory=list)
    conversions: list[Conversion] = field(default_factory=list)
    rejected: list[dict] = field(default_factory=list)   # rows the adapter refused

    # ------------------------------------------------------------ validate --

    def validate(self) -> list[str]:
        """Structural problems that must block a release.

        An adapter that cannot represent a row must record it in `rejected`,
        never emit a half-built factor. A silently dropped row and a silently
        mangled row are both worse than a loud refusal.
        """
        errs: list[str] = []
        unit_codes = {u.code for u in self.units}
        gas_codes = {g.code for g in self.gases}

        for u in self.units:
            if u.quantity_kind not in QUANTITY_KINDS:
                errs.append(f"unit {u.code}: unknown quantity_kind {u.quantity_kind!r}")

        seen = set()
        for f in self.factors:
            if f.factor_id in seen:
                errs.append(f"duplicate factor_id {f.factor_id}")
            seen.add(f.factor_id)
            if f.value_kind not in VALUE_KINDS:
                errs.append(f"{f.factor_id}: bad value_kind {f.value_kind!r}")
            if f.value_kind == "SCALAR" and f.value is None:
                errs.append(f"{f.factor_id}: SCALAR with no value")
            if f.value_kind == "RANGE" and (f.value_low is None or f.value_high is None):
                errs.append(f"{f.factor_id}: RANGE without both bounds")
            if f.gas not in gas_codes:
                errs.append(f"{f.factor_id}: gas {f.gas!r} not in the gas table")
            if f.unit_denominator and f.unit_denominator not in unit_codes:
                errs.append(f"{f.factor_id}: denominator {f.unit_denominator!r} not in the unit table")
            if not f.category_path:
                errs.append(f"{f.factor_id}: no category path")

        for c in self.conversions:
            for k in (c.from_kind, c.to_kind):
                if k not in QUANTITY_KINDS:
                    errs.append(f"conversion {c.conversion_id}: unknown kind {k!r}")
        return errs

    # --------------------------------------------------------------- io ------

    def to_dict(self) -> dict:
        return asdict(self)

    def write(self, path: Path) -> str:
        """Write and return the release digest.

        The digest covers the content, not the file, so re-serialising with
        different whitespace does not look like a different release.
        """
        d = self.to_dict()
        canon = json.dumps({k: v for k, v in d.items() if k != "release_digest"},
                           sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        digest = hashlib.sha256(canon.encode("utf-8")).hexdigest()
        d["release_digest"] = digest
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
        return digest

    @staticmethod
    def read(path: Path) -> dict:
        return json.loads(Path(path).read_text(encoding="utf-8"))


# ------------------------------------------------------------- helpers -----

_FOOTNOTE = re.compile(r"(?<=[a-z\)])\d{1,2}$")
_RANGE = re.compile(r"^\s*([-+]?[\d.]+)\s*[-–—]\s*([-+]?[\d.]+)\s*$")


def clean_label(s) -> str:
    """Strip the footnote digits the workbook appends to names.

    "Motor gasoline2" and "Gas/Diesel oil2" are the published spellings. Left
    alone they become distinct categories from their unmarked siblings.
    """
    t = " ".join(str(s or "").split())
    return _FOOTNOTE.sub("", t).strip()


def parse_value(raw):
    """-> (value_kind, value, low, high) or None if it is not a number at all."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return ("SCALAR", float(raw), None, None)
    t = str(raw).strip()
    if not t:
        return None
    m = _RANGE.match(t)
    if m:
        return ("RANGE", None, float(m.group(1)), float(m.group(2)))
    try:
        return ("SCALAR", float(t.replace(",", "")), None, None)
    except ValueError:
        return None


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()
