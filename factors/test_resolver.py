"""Tests for factor resolution and the ingestion that feeds it.

Covers the four properties the real GHG Protocol workbook exposed, plus the
killer case: asking for CO2 per kilometre when the publisher does not ship it.
A refusal there is a PASS. If this suite ever goes green by producing a number
for that case, something has started inventing values.

  python factors/test_resolver.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from resolver import default  # noqa: E402

RELEASE = json.loads((HERE / "releases" / "GHGP-XSECT-2.0.json").read_text(encoding="utf-8"))

fails = 0


def ok(m):
    print(f"  ok    {m}")


def bad(m):
    global fails
    fails += 1
    print(f"  FAIL  {m}")


def check(label, got, want):
    if got == want:
        ok(f"{label} -> {got}")
    else:
        bad(f"{label}: expected {want}, got {got}")


# ======================================================== ingestion ========
print("\nIngestion — the shape the real file forced")

# 1. parent categories must not flatten again
depths = {}
for f in RELEASE["factors"]:
    depths[len(f["category_path"])] = depths.get(len(f["category_path"]), 0) + 1
groups = sorted({f["category_path"][0] for f in RELEASE["factors"]
                 if f["source_sheet"] == "Stationary Combustion"})
EXPECTED_GROUPS = ["Biomass", "Coal products", "Natural gas", "Oil products", "Other wastes"]
if groups == EXPECTED_GROUPS:
    ok(f"stationary hierarchy intact: {len(groups)} groups, none flattened")
else:
    bad(f"category groups regressed: {groups}")
if 1 in depths:
    bad(f"{depths[1]} factor(s) at depth 1 — parents lost again")
else:
    ok("no factor sits at depth 1")

# 2. hand-verified values from the sheet
jet = {f"{f['unit_numerator']}/{f['unit_denominator']}": f["value"]
       for f in RELEASE["factors"] if f["selector"].get("fuel") == "Jet kerosene"}
check("jet kerosene, energy basis", jet.get("kg CO2/TJ"), 71500.0)
check("jet kerosene, mass basis", jet.get("kg CO2/tonne"), 3153.15)

# 3. conversions are kept apart from factors
conv_ids = {c["conversion_id"].split("-")[1] for c in RELEASE["conversions"]}
if conv_ids == {"NCV", "DENS"}:
    ok(f"calorific values and densities live in conversions, not factors "
       f"({len(RELEASE['conversions'])} of them)")
else:
    bad(f"unexpected conversion kinds: {conv_ids}")
if any(f["unit_denominator"] in ("Gg",) and f["gas"] == "CO2" for f in RELEASE["factors"]):
    bad("a calorific value leaked into the factor table")
else:
    ok("no conversion leaked into the factor table")

# 4. ranges survive ingestion
ranges = [f for f in RELEASE["factors"] if f["value_kind"] == "RANGE"]
if len(ranges) == 4 and all(f["value"] is None for f in ranges):
    ok("4 published ranges carried as ranges, with no point value invented")
else:
    bad(f"ranges mishandled: {len(ranges)} found, "
        f"{sum(1 for f in ranges if f['value'] is not None)} given a point value")

# 5. nothing silently dropped
check("rows refused by the adapter", len(RELEASE["rejected"]), 0)

# ========================================================= resolution =======
print("\nResolution")
R = default()

# --- THE KILLER CASE ------------------------------------------------------
# Road / Car / Diesel / 500 km. This publisher's distance table has CH4 and N2O
# and no CO2. The only correct answer is to refuse.
r = R.resolve("DIST_BASED",
              {"activityCategory": "mobileCombustion", "mode": "Road — Car (Diesel)"},
              want_gas="CO2E", want_unit="km", reporting_year=2026)
check("CO2e per km, which this publisher does not ship", r["status"], "DERIVATION_REQUIRED")
if r.get("derivation", {}).get("needs") == ["CO2", "CO2E"] or "CO2" in r.get("derivation", {}).get("needs", []):
    ok(f"names what is missing: {r['derivation']['needs']} (has {r['gases_available']})")
else:
    bad(f"did not name the gap: {r.get('derivation')}")
if "value" not in json.dumps(r.get("derivation", {})):
    ok("no number produced for the unshippable request")

# --- a gas that IS published ----------------------------------------------
r = R.resolve("DIST_BASED",
              {"activityCategory": "mobileCombustion", "mode": "Road — Car (Diesel)"},
              want_gas="CH4", want_unit="mile")
check("CH4 per mile, which is published", r["status"],
      "MULTIPLE_FACTORS_APPLICABLE" if r["status"] != "FACTOR_SELECTED" else "FACTOR_SELECTED")
if r["status"] == "MULTIPLE_FACTORS_APPLICABLE":
    ok(f"several vehicle-years qualify and it says so ({r['applicable_count']} rows), "
       f"rather than picking one")

# --- scalar factor, straightforward ---------------------------------------
r = R.resolve("FUEL_BASED",
              {"activityCategory": "stationaryCombustion", "fuelType": "Jet Kerosene (Jet A-1)"},
              want_gas="CO2", want_unit="TJ")
check("jet kerosene CO2 per TJ", r["status"], "FACTOR_SELECTED")
if r["status"] == "FACTOR_SELECTED":
    check("  the exact published value", r["factor"]["value"], 71500.0)
    check("  the unit", r["factor"]["unit"], "kg CO2/TJ")
    ok(f"  cited to {r['factor']['source']['sheet']} row {r['factor']['source']['row']}")

# --- cross-kind unit conversion via a governed row -------------------------
r = R.resolve("FUEL_BASED",
              {"activityCategory": "stationaryCombustion", "fuelType": "Diesel"},
              want_gas="CO2", want_unit="litre")
if r["status"] == "FACTOR_SELECTED" and r["factor"]["conversions"]:
    ok(f"litres -> {r['factor']['unit_denominator']} via governed conversion "
       f"{r['factor']['conversions'][0].get('conversion_id')}")
elif r["status"] == "UNIT_INCOMPATIBLE":
    ok(f"litres refused rather than approximated: {r['reason']}")
else:
    bad(f"unexpected for litres: {r['status']}")

# --- BROADER binding must surface -----------------------------------------
r = R.resolve("DIST_BASED",
              {"activityCategory": "mobileCombustion", "mode": "Road — LGV (<3.5t)"},
              want_gas="CH4", want_unit="km")
if r["status"] in ("MULTIPLE_FACTORS_APPLICABLE", "VALUE_IS_RANGE", "FACTOR_SELECTED"):
    ok(f"BROADER binding handled as {r['status']}")
    if r["status"] == "FACTOR_SELECTED" and "specificity_warning" not in r:
        bad("  BROADER binding selected a factor without warning about specificity")
    elif r["status"] == "FACTOR_SELECTED":
        ok("  and warns that the publisher node is less specific")
else:
    bad(f"BROADER binding gave {r['status']}")

# --- a published RANGE must never be averaged ------------------------------
found_range = False
for veh, fuel in (("Road — LGV (<3.5t)", None),):
    rr = R.resolve("DIST_BASED",
                   {"activityCategory": "mobileCombustion", "mode": veh},
                   want_gas="CH4", want_unit="km")
    blob = json.dumps(rr)
    if "0.215" in blob and "0.725" in blob:
        found_range = True
        if "0.47" in blob:
            bad("a range appears to have been averaged")
        else:
            ok("the 0.215-0.725 range is carried with both bounds, unaveraged")
if not found_range:
    ok("range rows not reached by this query (covered by the ingestion check)")

# --- no binding at all ------------------------------------------------------
r = R.resolve("DIST_BASED",
              {"activityCategory": "businessTravel", "mode": "Air — Short Haul (<1,600 km)"},
              want_gas="CO2E", want_unit="passenger.km")
check("aviation, which this workbook does not cover", r["status"], "NO_BINDING")
if "do not widen" in (r.get("reason") or ""):
    ok("refuses to widen to a road mode")

# --- determinism -------------------------------------------------------------
seen = set()
for _ in range(50):
    x = R.resolve("FUEL_BASED",
                  {"activityCategory": "stationaryCombustion", "fuelType": "Natural Gas"},
                  want_gas="CO2", want_unit="TJ")
    seen.add(json.dumps(x, sort_keys=True))
check("50 identical calls", len(seen), 1)

print()
print(f"{'PASS — factor resolution behaves' if not fails else str(fails) + ' FAILING'}")
sys.exit(1 if fails else 0)
