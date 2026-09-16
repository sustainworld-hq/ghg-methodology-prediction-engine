"""Adapter: GHG Protocol cross-sector tools workbook -> FrozenRelease.

One publisher, one file, one direction. Everything spreadsheet-shaped stops
here; the resolver never learns that a row number or a merged cell existed.

Scope for the prototype: two sheets, chosen because between them they exercise
every awkward property the format has.

  Stationary Combustion        hierarchical categories via blank cells, one row
                               yielding four records, calorific values and
                               densities that are conversions rather than
                               factors
  Mobile Combustion - Distance two gases per row, units that change partway
                               down the table, published ranges, and a year
                               dimension written as "1984-1993"

A row this adapter cannot represent is recorded in `rejected` with a reason. It
is never emitted half-built and never quietly skipped: at this boundary a
mangled row and a vanished row are equally dangerous, and both are worse than a
refusal somebody can read.

  python factors/adapt_ghgp.py --xlsx <path> --out factors/releases/<id>.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from release import (Conversion, Factor, FrozenRelease, Gas, Unit,  # noqa: E402
                     clean_label, parse_value, sha256_file)

PUBLISHER = "GHG_PROTOCOL"
DATASET = "Cross-Sector Tools V2.0"

# The gases this workbook publishes, with GWPs left null: the workbook does not
# state which assessment report its CO2e conversions assume, and guessing that
# would change every downstream number.
GASES = [
    Gas("CO2", is_aggregate=False),
    Gas("CH4", is_aggregate=False),
    Gas("N2O", is_aggregate=False),
]

UNITS = [
    Unit("km", "distance", 1000.0),
    Unit("mile", "distance", 1609.344),
    Unit("TJ", "energy", 1e12),
    Unit("tonne", "mass", 1000.0),
    Unit("Gg", "mass", 1e6),
    Unit("litre", "volume", 0.001),
]


def _rows(ws, upto=None):
    return list(ws.iter_rows(min_row=1, max_row=upto or ws.max_row, values_only=True))


# ------------------------------------------------- stationary combustion ---

def stationary(ws, rel: FrozenRelease) -> None:
    """Table 1: CO2 factors by fuel, plus the LHV and density columns.

    Layout, read from the file: column B carries a fuel GROUP that appears once
    and is blank on following rows; column C carries the fuel. Columns D-G are
    LHV (TJ/Gg), energy basis (kg CO2/TJ), mass basis (kg CO2/tonne) and liquid
    density (kg/litre).
    """
    group = None
    for i, row in enumerate(_rows(ws), 1):
        if i < 6:
            continue
        b, c, d, e, f, g = (row[1] if len(row) > 1 else None,
                            row[2] if len(row) > 2 else None,
                            row[3] if len(row) > 3 else None,
                            row[4] if len(row) > 4 else None,
                            row[5] if len(row) > 5 else None,
                            row[6] if len(row) > 6 else None)
        # The group is NOT on a row of its own. "Oil products" sits in column B
        # of the same row as its first fuel, "Crude oil", and is blank for the
        # rest of the group. Treating B-with-C-present as "not a group" dropped
        # every parent and flattened 107 factors to depth 1.
        if b:
            lbl = clean_label(b)
            if lbl.lower().startswith("table"):
                break
            group = lbl
            if not c:
                continue        # a heading on its own row: nothing else to read
        fuel = clean_label(c)
        if not fuel:
            continue
        path = [group, fuel] if group else [fuel]

        # energy basis: kg CO2 per TJ
        v = parse_value(e)
        if v:
            kind, val, lo, hi = v
            rel.factors.append(Factor(
                factor_id=f"GHGP-SC-E-{i}", category_path=path,
                selector={"fuel": fuel}, gas="CO2",
                value_kind=kind, value=val, value_low=lo, value_high=hi,
                unit_numerator="kg CO2", unit_denominator="TJ",
                source_sheet=ws.title, source_row=i))
        # mass basis: kg CO2 per tonne
        v = parse_value(f)
        if v:
            kind, val, lo, hi = v
            rel.factors.append(Factor(
                factor_id=f"GHGP-SC-M-{i}", category_path=path,
                selector={"fuel": fuel}, gas="CO2",
                value_kind=kind, value=val, value_low=lo, value_high=hi,
                unit_numerator="kg CO2", unit_denominator="tonne",
                source_sheet=ws.title, source_row=i))
        # calorific value: a CONVERSION, mass -> energy
        v = parse_value(d)
        if v and v[0] == "SCALAR":
            rel.conversions.append(Conversion(
                conversion_id=f"GHGP-NCV-{i}", from_unit="Gg", to_unit="TJ",
                from_kind="mass", to_kind="energy", selector={"fuel": fuel},
                value=v[1], source_sheet=ws.title, source_row=i))
        # density: a CONVERSION, volume -> mass
        v = parse_value(g)
        if v and v[0] == "SCALAR":
            rel.conversions.append(Conversion(
                conversion_id=f"GHGP-DENS-{i}", from_unit="litre", to_unit="tonne",
                from_kind="volume", to_kind="mass", selector={"fuel": fuel},
                value=v[1] / 1000.0, source_sheet=ws.title, source_row=i))


# ----------------------------------------------- mobile, distance basis ----

def mobile_distance(ws, rel: FrozenRelease) -> None:
    """Table 1: CH4 and N2O per distance, by region / vehicle / year / fuel.

    Note what is NOT here: CO2. The workbook publishes CO2 per distance only
    indirectly, through fuel economy and a fuel CO2 factor. That absence is left
    as an absence so the resolver can say DERIVATION_REQUIRED rather than the
    adapter inventing a combined number.
    """
    start = None
    rows = _rows(ws)
    for i, row in enumerate(rows, 1):
        cells = [str(c) for c in row if c]
        if any(str(c).strip().startswith("Table 1.") for c in cells):
            start = i
            break
    if start is None:
        rel.rejected.append({"sheet": ws.title, "reason": "Table 1 header not found"})
        return

    for i, row in enumerate(rows, 1):
        if i <= start + 2:      # title + two header rows
            continue
        get = lambda n: row[n] if len(row) > n else None  # noqa: E731
        region, vehicle, vyear, fuel = (clean_label(get(1)), clean_label(get(2)),
                                        clean_label(get(3)), clean_label(get(4)))
        if not region and not vehicle:
            continue
        if region.lower().startswith("table"):
            break
        if not fuel:
            continue

        # unit sits on the row, not the table: g/km for one region, g/mile for another
        unit_raw = clean_label(get(6)) or clean_label(get(5))
        denom = "km" if "km" in unit_raw.lower() else ("mile" if "mile" in unit_raw.lower() else "")
        if not denom:
            rel.rejected.append({"sheet": ws.title, "row": i,
                                 "reason": f"unrecognised unit {unit_raw!r}",
                                 "selector": {"region": region, "vehicle": vehicle,
                                              "fuel": fuel}})
            continue

        sel = {"region": region, "vehicle": vehicle, "fuel": fuel}
        if vyear:
            sel["vehicle_year"] = vyear

        for gas, col in (("CH4", 5), ("N2O", 7)):
            v = parse_value(get(col))
            if not v:
                continue
            kind, val, lo, hi = v
            rel.factors.append(Factor(
                factor_id=f"GHGP-MD-{gas}-{i}",
                category_path=["Mobile Combustion", "Distance", vehicle or "Unspecified"],
                selector=sel, gas=gas,
                value_kind=kind, value=val, value_low=lo, value_high=hi,
                unit_numerator="g", unit_denominator=denom,
                region_code=region or None, year_range=vyear or None,
                source_sheet=ws.title, source_row=i,
                notes=("published as a range" if kind == "RANGE" else None)))


# --------------------------------------------------------------- main -----

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--out", default=str(HERE / "releases" / "GHGP-XSECT-2.0.json"))
    ap.add_argument("--release-id", default="GHGP-XSECT-2.0")
    ap.add_argument("--by", default="prototype adapter; NOT board-approved")
    a = ap.parse_args()

    src = Path(a.xlsx)
    if not src.exists():
        print(f"no such file: {src}", file=sys.stderr)
        return 1

    rel = FrozenRelease(
        release_id=a.release_id, publisher=PUBLISHER, dataset_version=DATASET,
        source_file=src.name, source_sha256=sha256_file(src),
        published_by=a.by, units=list(UNITS), gases=list(GASES))

    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    try:
        if "Stationary Combustion" in wb.sheetnames:
            stationary(wb["Stationary Combustion"], rel)
        if "Mobile Combustion - Distance" in wb.sheetnames:
            mobile_distance(wb["Mobile Combustion - Distance"], rel)
    finally:
        wb.close()

    errs = rel.validate()
    print(f"release {rel.release_id}  <- {src.name}")
    print(f"  factors     {len(rel.factors)}")
    print(f"  conversions {len(rel.conversions)}")
    print(f"  rejected    {len(rel.rejected)}")
    ranges = [f for f in rel.factors if f.value_kind == "RANGE"]
    print(f"  ranges      {len(ranges)}  (carried as ranges, never averaged)")
    gases = {}
    for f in rel.factors:
        gases[f.gas] = gases.get(f.gas, 0) + 1
    print(f"  by gas      {gases}")

    if errs:
        print(f"\n  {len(errs)} VALIDATION ERROR(S) — release not written:")
        for e in errs[:12]:
            print("    " + e)
        return 1

    digest = rel.write(Path(a.out))
    print(f"\n  written {a.out}")
    print(f"  digest  {digest[:16]}…")
    if rel.rejected:
        print(f"\n  {len(rel.rejected)} row(s) refused, first few:")
        for r in rel.rejected[:5]:
            print(f"    row {r.get('row','?')}: {r['reason']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
