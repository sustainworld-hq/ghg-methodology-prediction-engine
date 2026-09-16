"""Deterministic factor resolution against a frozen release.

Given an activity record whose METHODOLOGY is already decided, find the exact
factor row. No model, no network, no live lookup — a typed filter over a frozen
artefact, so the same inputs give the same row forever.

    methodology (MATCHED)
            │
      taxonomy binding        authored + approved, never inferred here
            │
      candidate rows
            │
      gas requested           CO2 | CH4 | N2O | CO2E
            │
      unit compatibility      same quantity kind, or a governed conversion
            │
      geography / vintage
            │
      declared precedence     across publishers; absent -> ambiguity
            │
      one row, or an honest refusal

The refusals matter as much as the hits. Every one of these is a real outcome
this release produces, not a hypothetical:

  DERIVATION_REQUIRED   asked for CO2 per km; the publisher ships CH4 and N2O
                        only, and adding them is a modelling decision
  VALUE_IS_RANGE        the published value is "0.215 - 0.725"; averaging it
                        would invent precision the publisher declined to give
  MULTIPLE_FACTORS_APPLICABLE  the binding is BROADER than the activity, so
                        several rows qualify and nothing orders them
  NO_BINDING            our selector maps to no node in this publisher
  NO_FACTOR             bound, but the release holds no matching row
  UNIT_INCOMPATIBLE     no conversion path to the activity's unit
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Gases a CO2e request would have to combine. Listed so the resolver can say
# precisely what a derivation would need, rather than just refusing.
CO2E_COMPONENTS = ("CO2", "CH4", "N2O")


class Resolver:
    def __init__(self, release_path: Path, binding_path: Path):
        self.release = json.loads(Path(release_path).read_text(encoding="utf-8"))
        self.bindings = json.loads(Path(binding_path).read_text(encoding="utf-8"))
        self.units = {u["code"]: u for u in self.release["units"]}
        self.factors = self.release["factors"]
        self.conversions = self.release["conversions"]
        self.release_id = self.release["release_id"]
        self.publisher = self.release["publisher"]
        self.digest = self.release.get("release_digest")

    # ------------------------------------------------------------ binding --

    def find_binding(self, methodology: str, record: dict):
        """First binding whose our_selector is a subset of the record."""
        for b in self.bindings["bindings"]:
            if b["methodology"] != methodology:
                continue
            if all(record.get(k) == v for k, v in b["our_selector"].items()):
                return b
        return None

    # -------------------------------------------------------------- units --

    def unit_path(self, want_unit: str, have_unit: str, selector: dict):
        """Can `have_unit` (the factor's denominator) serve `want_unit`?

        Returns (ok, conversions, why). Same quantity kind converts by si_factor.
        Different kinds need a governed conversion row; there is no fallback and
        no approximation, because litres against a per-kWh factor is wrong by an
        order of magnitude and looks entirely normal.
        """
        if want_unit == have_unit:
            return True, [], None
        w, h = self.units.get(want_unit), self.units.get(have_unit)
        if not w or not h:
            return False, [], f"unit {want_unit!r} or {have_unit!r} is not in the release unit table"
        if w["quantity_kind"] == h["quantity_kind"]:
            if w.get("si_factor") and h.get("si_factor"):
                return True, [{"kind": "scale", "from": want_unit, "to": have_unit,
                               "factor": w["si_factor"] / h["si_factor"]}], None
            return False, [], f"no si_factor for {want_unit} or {have_unit}"
        for c in self.conversions:
            if c["from_kind"] == w["quantity_kind"] and c["to_kind"] == h["quantity_kind"]:
                if all(selector.get(k) == v for k, v in c["selector"].items()):
                    return True, [{"kind": "governed", "conversion_id": c["conversion_id"],
                                   "from": c["from_unit"], "to": c["to_unit"],
                                   "value": c["value"]}], None
        return False, [], (f"no governed conversion from {w['quantity_kind']} "
                           f"to {h['quantity_kind']}")

    # ------------------------------------------------------------ resolve --

    def resolve(self, methodology: str, record: dict, want_gas: str = "CO2E",
                want_unit: str | None = None, reporting_year: int | None = None) -> dict:
        out = {
            "publisher": self.publisher,
            "release_id": self.release_id,
            "release_digest": (self.digest or "")[:16],
            "binding_policy_version": self.bindings["binding_policy_version"],
            "methodology": methodology,
            "requested": {"gas": want_gas, "unit": want_unit,
                          "reporting_year": reporting_year},
        }

        b = self.find_binding(methodology, record)
        if not b:
            known = [u for u in self.bindings.get("unbound_known", [])
                     if all(record.get(k) == v for k, v in u["our_selector"].items())]
            out.update(status="NO_BINDING",
                       reason=(known[0]["why"] if known else
                               "no authored binding maps this activity onto this publisher"))
            return out

        out["binding"] = {"binding_id": b["binding_id"],
                          "confidence": b["confidence"],
                          "publisher_selector": b["publisher_selector"],
                          "note": b.get("note")}

        cands = [f for f in self.factors
                 if all(f["selector"].get(k) == v
                        for k, v in b["publisher_selector"].items())]
        if not cands:
            out.update(status="NO_FACTOR",
                       reason="the binding resolves, but this release holds no row for it")
            return out

        gases_here = sorted({f["gas"] for f in cands})
        out["gases_available"] = gases_here

        # ---- the gas actually asked for --------------------------------
        if want_gas == "CO2E":
            if "CO2E" not in gases_here:
                missing = [g for g in CO2E_COMPONENTS if g not in gases_here]
                out.update(
                    status="DERIVATION_REQUIRED",
                    reason=("this publisher does not ship CO2e for this activity; "
                            f"it holds {', '.join(gases_here)} and is missing "
                            f"{', '.join(missing)}"),
                    derivation={
                        "needs": missing,
                        "have": gases_here,
                        "note": ("Combining these into CO2e requires a GWP basis and, "
                                 "where CO2 is absent, a fuel-economy step. Both are "
                                 "modelling decisions and neither is recorded here, so "
                                 "the resolver stops rather than inventing a number."),
                    })
                return out
            cands = [f for f in cands if f["gas"] == "CO2E"]
        else:
            got = [f for f in cands if f["gas"] == want_gas]
            if not got:
                out.update(status="NO_FACTOR",
                           reason=f"gas {want_gas} not published for this activity; "
                                  f"available: {', '.join(gases_here)}")
                return out
            cands = got

        # ---- unit compatibility ----------------------------------------
        if want_unit:
            keep, why = [], []
            for f in cands:
                ok, conv, reason = self.unit_path(want_unit, f["unit_denominator"],
                                                  f["selector"])
                if ok:
                    keep.append((f, conv))
                else:
                    why.append(reason)
            if not keep:
                out.update(status="UNIT_INCOMPATIBLE",
                           reason=why[0] if why else "no compatible unit",
                           available_units=sorted({f["unit_denominator"] for f in cands}))
                return out
        else:
            keep = [(f, []) for f in cands]

        # ---- vintage ----------------------------------------------------
        if reporting_year is not None:
            dated = [(f, c) for f, c in keep if f.get("reference_year") == reporting_year]
            if dated:
                keep = dated
            elif any(f.get("reference_year") for f, _ in keep):
                out["vintage_note"] = (
                    f"no row for {reporting_year}; this release is "
                    f"{self.release['dataset_version']}")

        # ---- one row, or say so ------------------------------------------
        if len(keep) > 1:
            out.update(
                status="MULTIPLE_FACTORS_APPLICABLE",
                reason=("several rows in this release qualify and nothing in the "
                        "binding or the publisher distinguishes them"),
                applicable=[{
                    "factor_id": f["factor_id"], "selector": f["selector"],
                    "gas": f["gas"], "value_kind": f["value_kind"],
                    "value": f["value"], "value_low": f.get("value_low"),
                    "value_high": f.get("value_high"),
                    "unit": f"{f['unit_numerator']}/{f['unit_denominator']}",
                    "source_row": f["source_row"],
                } for f, _ in keep[:12]],
                applicable_count=len(keep))
            return out

        f, conv = keep[0]

        if f["value_kind"] == "RANGE":
            out.update(
                status="VALUE_IS_RANGE",
                reason=("the publisher gives a range, not a point value; averaging it "
                        "would invent precision it declined to give"),
                factor=self._describe(f, conv))
            return out

        out.update(status="FACTOR_SELECTED", factor=self._describe(f, conv))
        if b["confidence"] != "EXACT":
            out["specificity_warning"] = (
                f"binding is {b['confidence']}: the publisher node is not the same "
                f"thing as the activity described")
        return out

    def _describe(self, f: dict, conv: list) -> dict:
        return {
            "factor_id": f["factor_id"],
            "category_path": f["category_path"],
            "selector": f["selector"],
            "gas": f["gas"],
            "value_kind": f["value_kind"],
            "value": f["value"],
            "value_low": f.get("value_low"),
            "value_high": f.get("value_high"),
            "unit": f"{f['unit_numerator']}/{f['unit_denominator']}",
            "unit_numerator": f["unit_numerator"],
            "unit_denominator": f["unit_denominator"],
            "region_code": f.get("region_code"),
            "year_range": f.get("year_range"),
            "source": {"sheet": f["source_sheet"], "row": f["source_row"]},
            "conversions": conv,
        }


def default() -> Resolver:
    return Resolver(HERE / "releases" / "GHGP-XSECT-2.0.json",
                    HERE / "bindings" / "ghgp-xsect-2.0.json")
