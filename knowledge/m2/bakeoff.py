"""M2 model bake-off.

Runs the same extraction prompt and JSON schema across candidate Groq models
over passages chosen to cover the shapes the corpus actually contains, then
scores each model on things that can be checked mechanically.

Nothing here is the extractor. This decides which model the extractor should
use, on evidence rather than reputation.

  set GROQ_API_KEY, then:
  python knowledge/m2/bakeoff.py
  python knowledge/m2/bakeoff.py --models openai/gpt-oss-120b --repeat 3

All output is written under the repository on D:. No C: paths are used.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "knowledge" / "ingest"))

from common import connect  # noqa: E402

API = "https://api.groq.com/openai/v1/chat/completions"

# Cloudflare in front of the API returns 403 code 1010 to the default
# "Python-urllib/3.x" agent. Identify properly.
HEADERS_BASE = {"Content-Type": "application/json",
                "User-Agent": "sustainghg-m2-bakeoff/1.0",
                "Accept": "application/json"}

CANDIDATES = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
    "qwen/qwen3.6-27b",
]

# ------------------------------------------------------------------ cases ---
# Each case names a real chunk and what a correct reading of it looks like.
# `expect` is deliberately loose: we are scoring grounding and instruction
# following, not demanding one exact phrasing.

CASES = [
    {"id": "straightforward", "chunk": "scope3-calculation-guidance-0#c00050",
     "ask": "business travel",
     "expect": {"outcome": "extracted", "semantics": ["first_match", "conditional", "unclear"]},
     "why": "A plainly-stated method with named activity data."},

    {"id": "method-list", "chunk": "scope3-calculation-guidance-0#c00011",
     "ask": "purchased goods and services",
     "expect": {"outcome": "extracted", "semantics": ["first_match", "unclear"]},
     "why": "Several methods in one passage. Must pick one and not blend them."},

    {"id": "fallback-order", "chunk": "scope3-calculation-guidance-0#c00032",
     "ask": "the spend-based method for purchased goods and services",
     "expect": {"outcome": "extracted", "semantics": ["first_match"],
                "wants_ordering": True},
     "why": "States an explicit fallback relation that must be captured as a relation."},

    {"id": "tier-selection", "chunk": "v2-2-ch2-stationary-combustion#c00002",
     "ask": "stationary combustion", "expect": {"semantics": ["tier_selection", "unclear"]},
     "why": "IPCC tiers are chosen against a decision tree, not our priority order."},

    {"id": "no-change", "chunk": "19r-v2-2-ch02-stationary-combustion#c00003",
     "ask": "stationary combustion choice of method",
     "expect": {"outcome": "no_change"},
     "why": "Says 'No refinement'. Inventing a method here is the failure mode."},

    {"id": "dual-reporting", "chunk": "ghg-protocol-scope-2-guidance-final-2015#c00003",
     "ask": "scope 2 electricity",
     "expect": {"semantics": ["multi_applicable", "unclear"]},
     "why": "Dual reporting: both figures required. Must not collapse to one."},
]

# ----------------------------------------------------------------- schema ---

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["outcome", "method_name_verbatim", "selection_semantics",
                 "inputs_verbatim", "ordering_relations", "evidence_quote",
                 "source_chunk_id"],
    "properties": {
        "outcome": {"type": "string",
                    "enum": ["extracted", "no_change", "insufficient_evidence"]},
        "method_name_verbatim": {"type": ["string", "null"]},
        "selection_semantics": {"type": "string",
                                "enum": ["first_match", "multi_applicable",
                                         "tier_selection", "conditional", "unclear"]},
        "inputs_verbatim": {"type": "array", "items": {"type": "string"}},
        "ordering_relations": {
            "type": "array",
            "items": {"type": "object", "additionalProperties": False,
                      "required": ["type", "other_method_verbatim", "condition_verbatim"],
                      "properties": {
                          "type": {"type": "string",
                                   "enum": ["fallback_of", "preferred_over", "alternative_to"]},
                          "other_method_verbatim": {"type": "string"},
                          "condition_verbatim": {"type": "string"}}}},
        "evidence_quote": {"type": ["string", "null"]},
        "source_chunk_id": {"type": "string"},
    },
}

SYSTEM = """You are a methodology analyst. You read one passage from a GHG \
accounting standard and report only what that passage says.

Hard rules:
1. Use ONLY the passage supplied. Your own knowledge of the GHG Protocol or IPCC \
is inadmissible and must not influence the answer.
2. evidence_quote must be copied VERBATIM from the passage, character for \
character. It is checked automatically against the source text. Do not \
paraphrase, do not tidy up, do not join separated sentences.
3. If the passage states that nothing changed (for example "No refinement"), \
return outcome "no_change" and do not invent a method.
4. If the passage does not establish a method, return outcome \
"insufficient_evidence". This is a correct and expected answer, not a failure.
5. Do not assign priority numbers, tiers, or internal codes. Report ordering \
only as relations the passage itself states.
6. selection_semantics: use "multi_applicable" when the passage requires more \
than one method to be reported; "tier_selection" when a tier is chosen against \
a decision tree; "first_match" when methods fall back in order; "conditional" \
when a method applies only under a stated condition; "unclear" if the passage \
does not say."""


def user_prompt(chunk_id: str, section: str, text: str, ask: str) -> str:
    return (f"Passage id: {chunk_id}\n"
            f"Section: {section}\n"
            f"Activity in question: {ask}\n\n"
            f"--- BEGIN PASSAGE ---\n{text}\n--- END PASSAGE ---\n\n"
            f"Report the calculation method this passage describes for the "
            f"activity in question. Set source_chunk_id to exactly "
            f"\"{chunk_id}\".")


# ------------------------------------------------------------------- call ---

def call(model: str, system: str, prompt: str, key: str, timeout: int = 120) -> dict:
    body = {
        "model": model, "temperature": 0, "max_tokens": 1600,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": prompt}],
        "response_format": {"type": "json_schema", "json_schema": {
            "name": "methodology_extraction", "strict": True, "schema": SCHEMA}},
    }
    hdrs = dict(HEADERS_BASE, Authorization=f"Bearer {key}")
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers=hdrs)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = json.loads(r.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:300]
        # some models reject json_schema; retry in plain json mode
        if "json_schema" in detail or e.code == 400:
            body["response_format"] = {"type": "json_object"}
            body["messages"][0]["content"] += (
                "\n\nReturn a single JSON object matching this schema:\n"
                + json.dumps(SCHEMA))
            req = urllib.request.Request(
                API, data=json.dumps(body).encode(), headers=hdrs)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    payload = json.loads(r.read())
            except Exception as e2:
                return {"error": f"{type(e2).__name__}: {str(e2)[:160]}",
                        "latency": time.time() - t0}
        else:
            return {"error": f"HTTP {e.code}: {detail}", "latency": time.time() - t0}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:160]}",
                "latency": time.time() - t0}

    latency = time.time() - t0
    try:
        content = payload["choices"][0]["message"]["content"]
        obj = json.loads(content)
    except Exception as e:
        return {"error": f"unparseable: {type(e).__name__}", "latency": latency,
                "raw": str(payload)[:300]}
    return {"obj": obj, "latency": latency, "usage": payload.get("usage", {})}


# ---------------------------------------------------------------- scoring ---

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def score(case: dict, obj: dict, source_text: str) -> dict:
    """Every check here is mechanical. None of it asks the model anything."""
    out = {"schema_ok": True, "quote_ok": None, "cite_ok": None,
           "outcome_ok": None, "semantics_ok": None, "ordering_ok": None,
           "invented": False}

    for f in SCHEMA["required"]:
        if f not in obj:
            out["schema_ok"] = False
    if obj.get("selection_semantics") not in SCHEMA["properties"]["selection_semantics"]["enum"]:
        out["schema_ok"] = False
    if not out["schema_ok"]:
        return out

    outcome = obj.get("outcome")
    exp = case["expect"]

    # V1 - the quote must exist in the passage it claims to come from
    q = obj.get("evidence_quote")
    if outcome == "extracted":
        out["quote_ok"] = bool(q) and norm(q) in norm(source_text)
        out["invented"] = not out["quote_ok"]
    else:
        out["quote_ok"] = True if not q else norm(q) in norm(source_text)

    # V3 - cited its own source
    out["cite_ok"] = obj.get("source_chunk_id") == case["chunk"]

    if "outcome" in exp:
        out["outcome_ok"] = outcome == exp["outcome"]
    if "semantics" in exp:
        out["semantics_ok"] = obj.get("selection_semantics") in exp["semantics"]
    if exp.get("wants_ordering"):
        out["ordering_ok"] = len(obj.get("ordering_relations") or []) > 0
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="*", default=CANDIDATES)
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--out", default=str(HERE / "bakeoff-results.json"))
    a = ap.parse_args()

    key = os.environ.get("GROQ_API_KEY")
    if not key:
        print("GROQ_API_KEY is not set.", file=sys.stderr)
        return 2

    con = connect()
    passages = {}
    for c in CASES:
        r = con.execute(
            "SELECT c.text, c.chunk_id, s.path FROM chunks c "
            "LEFT JOIN sections s ON s.section_id=c.section_id "
            "WHERE c.chunk_id=?", (c["chunk"],)).fetchone()
        if not r:
            print(f"missing chunk {c['chunk']}", file=sys.stderr)
            return 1
        passages[c["chunk"]] = {"text": r["text"], "section": r["path"] or ""}

    results = []
    for model in a.models:
        print(f"\n=== {model} ===", flush=True)
        for c in CASES:
            p = passages[c["chunk"]]
            for run in range(a.repeat):
                res = call(model, SYSTEM,
                           user_prompt(c["chunk"], p["section"], p["text"], c["ask"]),
                           key)
                row = {"model": model, "case": c["id"], "run": run,
                       "latency": round(res.get("latency", 0), 2)}
                if "error" in res:
                    row["error"] = res["error"]
                    print(f"  {c['id']:<16} ERROR {res['error'][:90]}", flush=True)
                else:
                    sc = score(c, res["obj"], p["text"])
                    row["scores"] = sc
                    row["obj"] = res["obj"]
                    row["usage"] = res.get("usage", {})
                    marks = "".join(
                        "." if sc[k] is None else ("Y" if sc[k] else "n")
                        for k in ("schema_ok", "quote_ok", "cite_ok",
                                  "outcome_ok", "semantics_ok", "ordering_ok"))
                    print(f"  {c['id']:<16} [{marks}] {row['latency']:>5.1f}s  "
                          f"{res['obj'].get('outcome','?'):<20} "
                          f"{str(res['obj'].get('selection_semantics','?'))}", flush=True)
                results.append(row)

    Path(a.out).write_text(json.dumps(results, indent=2), encoding="utf-8")

    # ---- summary -----------------------------------------------------------
    print("\n" + "=" * 84)
    print(f"{'model':<26} {'ok':>5} {'quote':>6} {'cite':>5} {'outc':>5} "
          f"{'sem':>5} {'ord':>4} {'invent':>7} {'lat':>6}")
    print("-" * 84)
    for model in a.models:
        rows = [r for r in results if r["model"] == model and "scores" in r]
        errs = [r for r in results if r["model"] == model and "error" in r]
        if not rows:
            print(f"{model:<26}  all calls failed ({len(errs)} errors)")
            continue

        def rate(k):
            vals = [r["scores"][k] for r in rows if r["scores"][k] is not None]
            return f"{sum(vals)}/{len(vals)}" if vals else "-"

        inv = sum(1 for r in rows if r["scores"]["invented"])
        lat = sum(r["latency"] for r in rows) / len(rows)
        print(f"{model:<26} {rate('schema_ok'):>5} {rate('quote_ok'):>6} "
              f"{rate('cite_ok'):>5} {rate('outcome_ok'):>5} "
              f"{rate('semantics_ok'):>5} {rate('ordering_ok'):>4} "
              f"{inv:>7} {lat:>5.1f}s"
              + (f"   ({len(errs)} err)" if errs else ""))
    print("\nY pass  n fail  . not applicable to this case")
    print(f"detail: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
