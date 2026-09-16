"""The M2 extraction contract, as executable code.

One definition of the schema, the prompt and the validators, imported by both
the extractor and the bake-off. They drifted apart once already: the bake-off
kept grading against a `selection_semantics` field the contract had replaced,
which would have produced meaningless scores.

Spec: docs/M2-EXTRACTION-CONTRACT.md
Labels: knowledge/m2/semantics-gold.json
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request

API = "https://api.groq.com/openai/v1/chat/completions"

# Cloudflare fronting the API rejects the default "Python-urllib/3.x" agent
# with 403 code 1010.
HEADERS_BASE = {
    "Content-Type": "application/json",
    "User-Agent": "sustainghg-m2/1.0",
    "Accept": "application/json",
}

# Provisional until the bake-off runs: largest context, and the only model so
# far measured on quote verification (3/3, zero inventions).
DEFAULT_MODEL = "openai/gpt-oss-120b"

# --------------------------------------------------------------- schema -----

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["outcome", "method_name_verbatim", "applies_count",
                 "selection_basis", "inputs_verbatim", "ordering_relations",
                 "evidence_quote", "source_chunk_id"],
    "properties": {
        "outcome": {
            "type": "string",
            "enum": ["extracted", "no_change", "insufficient_evidence"]},
        "method_name_verbatim": {"type": ["string", "null"]},
        "applies_count": {
            "type": "string",
            "enum": ["one_of", "all_of", "unstated"]},
        "selection_basis": {
            "type": "string",
            "enum": ["other_method_availability", "published_decision_tree",
                     "activity_condition", "unstated"]},
        "inputs_verbatim": {"type": "array", "items": {"type": "string"}},
        "ordering_relations": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["relation", "other_method_verbatim",
                             "condition_verbatim"],
                "properties": {
                    "relation": {"type": "string",
                                 "enum": ["ranks_below", "ranks_above",
                                          "no_stated_order"]},
                    "other_method_verbatim": {"type": "string"},
                    "condition_verbatim": {"type": "string"}}}},
        "evidence_quote": {"type": ["string", "null"]},
        "source_chunk_id": {"type": "string"},
    },
}

SYSTEM = """You are a methodology analyst. You read one passage from a GHG \
accounting standard and report only what that passage says.

Hard rules:
1. Use ONLY the passage supplied. Your own knowledge of the GHG Protocol or \
IPCC is inadmissible and must not influence the answer.
2. evidence_quote must be copied VERBATIM from the passage, character for \
character. It is checked automatically against the source text. Do not \
paraphrase, do not tidy up, do not join separated sentences.
3. If the passage states that nothing changed (for example "No refinement"), \
return outcome "no_change" and do not invent a method.
4. If the passage does not establish a calculation method, return outcome \
"insufficient_evidence". This is a correct and expected answer, not a failure.
5. Do not assign priority numbers, tiers, or internal codes. Report ordering \
only as relations the passage itself states.

6. applies_count - apply in order, first match wins:
   a) more than one method's result is required for the same activity -> "all_of"
   b) a single method is applied -> "one_of"
   c) the passage is silent -> "unstated"

7. selection_basis - apply in order, first match wins:
   a) this method's use depends on another NAMED CALCULATION METHOD being \
unavailable or infeasible -> "other_method_availability"
   b) the passage points to a decision tree, figure, or tier-selection \
procedure -> "published_decision_tree"
   c) the passage states a condition that is NOT about another calculation \
method (about data, instruments, the activity, or circumstances) -> \
"activity_condition"
   d) otherwise -> "unstated"
   The single question separating (a) from (c) is: IS THE THING NAMED IN THE \
CONDITION A CALCULATION METHOD? If yes, (a). If no, (c).

8. ordering_relations are directional, always from THIS method's point of \
view. "ranks_below" means the named method is used instead of this one when \
feasible. "ranks_above" is the reverse. "no_stated_order" when both are \
offered with no preference stated."""


def user_prompt(chunk_id: str, section: str, text: str, ask: str) -> str:
    return (f"Passage id: {chunk_id}\n"
            f"Section: {section}\n"
            f"Activity in question: {ask}\n\n"
            f"--- BEGIN PASSAGE ---\n{text}\n--- END PASSAGE ---\n\n"
            f"Report the calculation method this passage describes for the "
            f"activity in question. Set source_chunk_id to exactly "
            f'"{chunk_id}".')


# ----------------------------------------------------------------- call -----

def call(prompt: str, model: str = DEFAULT_MODEL, key: str | None = None,
         timeout: int = 120, retries: int = 4) -> dict:
    """One extraction call. Backs off on 429 rather than dropping the passage."""
    key = key or os.environ.get("GROQ_API_KEY")
    if not key:
        return {"error": "GROQ_API_KEY is not set"}

    body = {
        "model": model, "temperature": 0, "max_tokens": 1600,
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": prompt}],
        "response_format": {"type": "json_schema", "json_schema": {
            "name": "methodology_extraction", "strict": True, "schema": SCHEMA}},
    }
    hdrs = dict(HEADERS_BASE, Authorization=f"Bearer {key}")

    for attempt in range(retries):
        t0 = time.time()
        req = urllib.request.Request(API, data=json.dumps(body).encode(),
                                     headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                payload = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:400]
            if e.code == 429 and attempt < retries - 1:
                wait = _retry_after(detail, attempt)
                time.sleep(wait)
                continue
            if e.code == 400 and "json_schema" in detail:
                body["response_format"] = {"type": "json_object"}
                body["messages"][0]["content"] = SYSTEM + (
                    "\n\nReturn one JSON object matching this schema:\n"
                    + json.dumps(SCHEMA))
                continue
            return {"error": f"HTTP {e.code}: {detail}",
                    "latency": time.time() - t0}
        except Exception as e:  # noqa: BLE001
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            return {"error": f"{type(e).__name__}: {str(e)[:200]}",
                    "latency": time.time() - t0}
    else:
        return {"error": "retries exhausted"}

    latency = time.time() - t0
    try:
        obj = json.loads(payload["choices"][0]["message"]["content"])
    except Exception as e:  # noqa: BLE001
        return {"error": f"unparseable response: {type(e).__name__}",
                "latency": latency}
    return {"obj": obj, "latency": latency, "usage": payload.get("usage", {})}


def _retry_after(detail: str, attempt: int) -> float:
    m = re.search(r"try again in ([\d.]+)s", detail)
    if m:
        return min(float(m.group(1)) + 0.5, 60.0)
    return min(2 ** attempt * 3, 60.0)


# ------------------------------------------------------------ validate -----

def norm(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def validate(obj: dict, chunk: dict, fields: dict) -> dict:
    """The five mechanical checks. No judgement, no model involvement.

    chunk: {chunk_id, text, document, edition, year, section, pages, provisional}
    fields: the FIELDS vocabulary from decision-tables.js
    Returns {ok, rejected_by, problems, record}.
    """
    problems: list[str] = []

    # V2 - schema conformance
    for f in SCHEMA["required"]:
        if f not in obj:
            problems.append(f"V2 missing required field: {f}")
    for f in ("outcome", "applies_count", "selection_basis"):
        if f in obj and obj[f] not in SCHEMA["properties"][f]["enum"]:
            problems.append(f"V2 {f} not in enum: {obj.get(f)!r}")
    if problems:
        return {"ok": False, "rejected_by": "V2", "problems": problems}

    outcome = obj["outcome"]
    quote = obj.get("evidence_quote")

    # V1 - quote verification. The check that makes extraction safe.
    if outcome == "extracted":
        if not quote:
            problems.append("V1 outcome is 'extracted' but no quote was given")
        elif norm(quote) not in norm(chunk["text"]):
            problems.append("V1 quote does not appear in the cited passage")
    elif quote and norm(quote) not in norm(chunk["text"]):
        problems.append("V1 quote does not appear in the cited passage")
    if any(p.startswith("V1") for p in problems):
        return {"ok": False, "rejected_by": "V1", "problems": problems}

    # V3 - citation integrity. Never trust the model's memory of the source.
    if obj.get("source_chunk_id") != chunk["chunk_id"]:
        problems.append(
            f"V3 cited {obj.get('source_chunk_id')!r}, was given {chunk['chunk_id']!r}")
        return {"ok": False, "rejected_by": "V3", "problems": problems}

    # V4 - vocabulary. Unmapped inputs are a finding, not a rejection.
    mapped = []
    for raw in obj.get("inputs_verbatim", []):
        fid = _guess_field(raw, fields)
        mapped.append({"verbatim": raw, "field_id": fid,
                       "confident": fid is not None})
    unmapped = [m["verbatim"] for m in mapped if not m["confident"]]

    # V5 - provisional inherited from the store, never from the model
    record = {
        "outcome": outcome,
        "method_name_verbatim": obj.get("method_name_verbatim"),
        "applies_count": obj["applies_count"],
        "selection_basis": obj["selection_basis"],
        "inputs_verbatim": obj.get("inputs_verbatim", []),
        "inputs_mapped": mapped,
        "unmapped_inputs": unmapped,
        "ordering_relations": obj.get("ordering_relations", []),
        "evidence": {
            "quote": quote,
            "chunk_id": chunk["chunk_id"],
            "document": chunk["document"],
            "edition": chunk["edition"],
            "year": chunk["year"],
            "section": chunk["section"],
            "pages": chunk["pages"],
            "provisional": bool(chunk.get("provisional")),
        },
        "confidence": None,
        "confidence_signals": [],
    }
    record["confidence"], record["confidence_signals"] = _confidence(record)
    return {"ok": True, "rejected_by": None, "problems": problems,
            "record": record}


# Mapping document language onto our field ids is where a wrong guess becomes
# an authoritative-looking rule, so it is done with an explicit lexicon rather
# than word-overlap scoring. Fuzzy overlap mapped "Amount spent on purchased
# goods" to materialMass and marked it confident - precisely the failure this
# guards against. Anything not listed stays unmapped and gets reviewed.
FIELD_LEXICON = {
    "spend":             [r"spent", r"spend", r"economic value",
                          r"market value", r"monetary value", r"cost",
                          r"purchase price", r"expenditure"],
    "currency":          [r"currency", r"dollars?", r"euros?"],
    "distance":          [r"distance", r"kilometre", r"kilometer",
                          r"miles", r"passenger[- ]?km", r"tonne[- ]?km",
                          r"vehicle[- ]?km"],
    "mode":              [r"mode of transport", r"mode", r"transport mode",
                          r"vehicle type"],
    "fuelQuantity":      [r"fuel (?:consumed|consumption|use|used|quantity)",
                          r"(?:quantity|amount|volume) of fuel",
                          r"litres? of fuel", r"fuel data"],
    "fuelType":          [r"fuel type", r"type of fuel"],
    "energyConsumption": [r"electricity (?:consumed|consumption|use|used)",
                          r"energy (?:consumed|consumption|use|used)",
                          r"kwh", r"mwh"],
    "gridRegion":        [r"grid", r"grid region", r"balancing area",
                          r"location[- ]based"],
    "contractualInstrument": [r"contractual instrument", r"energy attribute",
                              r"certificate", r"rec", r"ppa",
                              r"guarantee of origin", r"green tariff"],
    "freightMass":       [r"mass of (?:goods|products) (?:transported|shipped)",
                          r"weight of (?:goods|freight|shipment)",
                          r"shipment weight"],
    "materialMass":      [r"mass (?:or number of units )?of purchased",
                          r"(?:quantity|mass|weight) of purchased",
                          r"units of purchased", r"quantity purchased"],
    "materialType":      [r"material type", r"product type", r"type of material"],
    "supplierData":      [r"supplier[- ]specific", r"supplier[- ]provided",
                          r"product[- ]level data", r"pcf",
                          r"cradle[- ]to[- ]gate.*supplier"],
    "sectorCode":        [r"eeio", r"input[- ]output", r"sector"],
    "wasteQuantity":     [r"(?:mass|quantity|amount|weight) of waste",
                          r"waste generated"],
    "wasteType":         [r"waste type", r"type of waste", r"waste stream"],
    "treatmentMethod":   [r"treatment method", r"disposal method",
                          r"waste treatment", r"landfill", r"incinerat",
                          r"recycl", r"compost"],
    "refrigerantType":   [r"refrigerant type", r"type of refrigerant"],
    "refrigerantRecharge": [r"refrigerant (?:added|recharged|top(?:ped)?[- ]up)",
                            r"quantity recharged"],
    "equipmentCharge":   [r"charge capacity", r"nameplate (?:charge|capacity)",
                          r"refrigerant capacity"],
    "leakRate":          [r"leak(?:age)? rate"],
    "employeeCount":     [r"number of employees", r"employee count", r"headcount"],
    "workingDays":       [r"working days", r"commuting days", r"days worked"],
    "nights":            [r"room nights", r"nights? (?:stayed|of accommodation)",
                          r"hotel nights"],
    "floorArea":         [r"floor area", r"square met", r"sq\.? ?ft",
                          r"area occupied"],
    "unitsSold":         [r"(?:number|units) of (?:products )?sold",
                          r"units sold", r"products sold"],
    "energyPerUse":      [r"energy (?:consumed )?per use", r"energy per cycle"],
    "usesPerLifetime":   [r"(?:uses|lifetime uses|number of uses) per",
                          r"expected lifetime"],
    "investeeEmissions": [r"investee(?:'s)? (?:scope [12] )?emissions",
                          r"emissions of the investee"],
    "ownershipShare":    [r"share of equity", r"equity share", r"ownership share",
                          r"proportion of equity"],
    "investmentValue":   [r"investment value", r"value of the investment",
                          r"outstanding amount"],
    "investeeRevenue":   [r"investee(?:'s)? revenue", r"revenue of the investee"],
    "waterVolume":       [r"volume of water", r"water (?:supplied|consumed|use)"],
    "processOutput":     [r"(?:mass|tonnes) of (?:clinker|product|output) produced",
                          r"production (?:volume|output)"],
    "processInput":      [r"raw material input", r"carbonate (?:input|consumed)",
                          r"feedstock"],
}
_COMPILED = {fid: [re.compile(p, re.I) for p in pats]
             for fid, pats in FIELD_LEXICON.items()}


def _guess_field(raw: str, fields: dict) -> str | None:
    """Map a document phrase to a field id, or None.

    Conservative by design: an unmapped input is visible and gets reviewed,
    a wrongly mapped one silently corrupts a governed rule. When two fields
    match, the longer (more specific) pattern wins; a genuine tie returns None.
    """
    best, best_len = None, 0
    ties = False
    for fid, pats in _COMPILED.items():
        if fid not in fields:
            continue
        for pat in pats:
            m = pat.search(raw or "")
            if not m:
                continue
            span = len(m.group(0))
            if span > best_len:
                best, best_len, ties = fid, span, False
            elif span == best_len and fid != best:
                ties = True
    return None if ties else best


def _confidence(rec: dict) -> tuple[str, list[str]]:
    """Computed from checkable signals. The model is never asked."""
    sig = []
    if rec["evidence"]["quote"]:
        sig.append("quote verified against the source passage")
    if rec["inputs_mapped"] and not rec["unmapped_inputs"]:
        sig.append("every input mapped to a known field")
    if not rec["evidence"]["provisional"]:
        sig.append("source is a published standard, not a draft")
    if not (rec["applies_count"] == "unstated"
            and rec["selection_basis"] == "unstated"):
        sig.append("selection semantics determined")
    if rec["unmapped_inputs"]:
        sig.append(f"{len(rec['unmapped_inputs'])} input(s) not in our vocabulary")
    if rec["evidence"]["provisional"]:
        sig.append("source is provisional")

    good = sum(1 for s in sig if not s.startswith(("0 ", "1 ", "2 ", "3 "))
               and "not in our vocabulary" not in s and "provisional" not in s)
    if rec["evidence"]["provisional"]:
        return "low", sig
    if good >= 4:
        return "high", sig
    if good >= 2:
        return "medium", sig
    return "low", sig
