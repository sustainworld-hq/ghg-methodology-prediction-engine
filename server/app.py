"""SustainGHG — Methodology Prediction Engine, backed by the knowledge base.

Two things this serves:

  1. Upload a methodology PDF, index it, and make it searchable.
  2. Give it an activity, and it CONSULTS THE INDEXED STANDARDS to decide the
     calculation method — returning the method, the passage that justifies it,
     and the page it came from.

The selection itself stays deterministic. The knowledge base supplies which
methods exist for an activity and how the standard ranks them; the engine then
picks by the same presence-based, first-match rule as before. The model reports
what documents say. It never decides what we do.

Answers are cached per (activity, model). Asking twice gives the same answer
from the same evidence, which is the property that makes this auditable.

  set GROQ_API_KEY
  python server/app.py          ->  http://127.0.0.1:5000
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "knowledge"))
sys.path.insert(0, str(ROOT / "knowledge" / "ingest"))
sys.path.insert(0, str(ROOT / "knowledge" / "m2"))

import contract  # noqa: E402
from common import CORPUS, connect, doc_id_for, register_upload  # noqa: E402

app = Flask(__name__, template_folder=str(HERE / "templates"),
            static_folder=str(HERE / "static"))
app.config["MAX_CONTENT_LENGTH"] = 80 * 1024 * 1024

CACHE_DIR = ROOT / "knowledge" / "candidates"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


def set_job(jid: str, **kw):
    with JOBS_LOCK:
        JOBS.setdefault(jid, {"log": []})
        if "log_line" in kw:
            JOBS[jid]["log"].append(kw.pop("log_line"))
        JOBS[jid].update(kw)


# ------------------------------------------------------------------ corpus --

def corpus_summary() -> dict:
    con = connect()
    docs = [dict(r) for r in con.execute(
        "SELECT doc_id, title, publisher, edition, year, page_count, provisional "
        "FROM documents WHERE status='active' ORDER BY publisher, year")]
    n_chunks = con.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    n_sections = con.execute("SELECT COUNT(*) FROM sections").fetchone()[0]
    return {"documents": docs, "chunks": n_chunks, "sections": n_sections}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/corpus")
def api_corpus():
    return jsonify(corpus_summary())


# ------------------------------------------------------------------ upload --

@app.route("/api/upload", methods=["POST"])
def api_upload():
    f = request.files.get("pdf")
    if not f or not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Attach a PDF."}), 400

    meta = {k: (request.form.get(k) or "").strip()
            for k in ("publisher", "title", "edition", "year")}
    missing = [k for k, v in meta.items() if not v]
    if missing:
        return jsonify({"error": "Missing: " + ", ".join(missing) +
                        ". These become the citation, so they are required."}), 400
    try:
        year = int(meta["year"])
    except ValueError:
        return jsonify({"error": "Year must be a number."}), 400

    safe = re.sub(r"[^A-Za-z0-9._ -]", "_", Path(f.filename).name)
    dest = CORPUS / safe
    if dest.exists():
        return jsonify({"error": f"{safe} is already in the corpus."}), 409
    CORPUS.mkdir(parents=True, exist_ok=True)
    f.save(dest)

    # reject anything we cannot read text from, before it pollutes the index
    try:
        import fitz
        with fitz.open(dest) as doc:
            pages = doc.page_count
            chars = sum(len(p.get_text("text")) for p in doc)
    except Exception as e:  # noqa: BLE001
        dest.unlink(missing_ok=True)
        return jsonify({"error": f"Could not read that PDF: {e}"}), 400
    if chars < 200 * max(pages, 1) / 10:
        dest.unlink(missing_ok=True)
        return jsonify({"error": "That PDF has almost no extractable text — it is "
                                 "probably a scan. This pipeline has no OCR."}), 400

    family = re.sub(r"[^a-z0-9]+", "-", meta["title"].lower()).strip("-")[:40]
    register_upload(safe, meta["publisher"], meta["title"], meta["edition"],
                    year, family or doc_id_for(safe))

    jid = uuid.uuid4().hex[:12]
    set_job(jid, status="running", kind="ingest", file=safe,
            log_line=f"saved {safe} — {pages} pages, {chars:,} characters")
    threading.Thread(target=_ingest_job, args=(jid, safe), daemon=True).start()
    return jsonify({"job": jid, "file": safe, "pages": pages})


def _ingest_job(jid: str, filename: str):
    """Re-runs the pipeline so the new document is registered, chunked, indexed."""
    try:
        set_job(jid, log_line="running the ingestion pipeline (this rebuilds the index)")
        env = dict(os.environ, HF_HUB_OFFLINE="1",
                   TMPDIR=str(ROOT / ".work"), TEMP=str(ROOT / ".work"),
                   TMP=str(ROOT / ".work"))
        (ROOT / ".work").mkdir(exist_ok=True)
        proc = subprocess.Popen(
            [sys.executable, "-u", "run_all.py"],
            cwd=str(ROOT / "knowledge" / "ingest"), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            encoding="utf-8", errors="replace")
        for line in proc.stdout:
            line = line.rstrip()
            if line and not line.startswith(("WARNING", "2026-", "I tensorflow")):
                set_job(jid, log_line=line[:160])
        proc.wait()
        if proc.returncode != 0:
            set_job(jid, status="error", log_line=f"pipeline exited {proc.returncode}")
            return
        s = corpus_summary()
        set_job(jid, status="done",
                log_line=f"indexed — {len(s['documents'])} documents, {s['chunks']} passages")
    except Exception as e:  # noqa: BLE001
        set_job(jid, status="error", log_line=f"{type(e).__name__}: {e}")


# ----------------------------------------------------------------- predict --

def cache_path(activity: str, model: str) -> Path:
    slug = re.sub(r"[^a-z0-9]+", "-", activity.lower()).strip("-")[:60]
    mslug = re.sub(r"[^a-z0-9]+", "-", model.lower()).strip("-")
    return CACHE_DIR / f"{slug}__{mslug}.json"


def order_methods(cands: list[dict]) -> list[dict]:
    """Rank candidates using ONLY what the documents said.

    A method that the standard says ranks below another is pushed down. This is
    the standard's own ordering, recovered from ordering_relations - not a
    preference of ours and not the model's opinion.
    """
    names = {c["method_name_verbatim"]: i for i, c in enumerate(cands)
             if c.get("method_name_verbatim")}

    def below_count(c):
        n = 0
        for rel in c.get("ordering_relations", []):
            if rel.get("relation") == "ranks_below":
                n += 1
        return n

    for c in cands:
        c["_below"] = below_count(c)
    # fewer "ranks_below" relations = the standard treats it as more preferred
    ordered = sorted(cands, key=lambda c: (c["_below"],
                                           0 if c.get("confidence") == "high" else 1))
    for i, c in enumerate(ordered, 1):
        c["derived_priority"] = i
        c.pop("_below", None)
    return ordered


@app.route("/api/predict", methods=["POST"])
def api_predict():
    body = request.get_json(force=True) or {}
    activity = (body.get("activity") or "").strip()
    have = {k for k, v in (body.get("inputs") or {}).items()
            if str(v).strip() not in ("", "0")}
    if not activity:
        return jsonify({"error": "Describe the activity."}), 400

    jid = uuid.uuid4().hex[:12]
    set_job(jid, status="running", kind="predict", activity=activity,
            log_line=f"activity: {activity}")
    threading.Thread(target=_predict_job, args=(jid, activity, sorted(have)),
                     daemon=True).start()
    return jsonify({"job": jid})


def _predict_job(jid: str, activity: str, have: list[str]):
    try:
        model = contract.DEFAULT_MODEL
        cp = cache_path(activity, model)

        if cp.exists():
            set_job(jid, log_line="found a cached reading of the standards for this activity")
            data = json.loads(cp.read_text(encoding="utf-8"))
        else:
            set_job(jid, log_line="searching the indexed standards for this activity")
            from extract import extract
            data = extract(activity=activity, limit=6, model=model, pause=1.5,
                           progress=lambda s, d: set_job(jid, log_line=f"{s}: {d}"))
            cp.write_text(json.dumps(data, indent=2, ensure_ascii=False),
                          encoding="utf-8")

        cands = order_methods(data.get("candidates", []))
        if not cands:
            set_job(jid, status="done", result={
                "verdict": "no_methods_found", "activity": activity,
                "candidates": [], "rejected": data.get("rejected", []),
                "considered": data.get("passages_considered", 0)})
            return

        set_job(jid, log_line=f"{len(cands)} method(s) found in the standards; "
                              f"matching against the data you have")

        have_set = set(have)
        evaluations = []
        chosen = None
        for c in cands:
            need = [m["field_id"] for m in c.get("inputs_mapped", [])
                    if m.get("field_id")]
            need_u = sorted(set(need))
            missing = [f for f in need_u if f not in have_set]
            ok = bool(need_u) and not missing
            ev = {"method": c["method_name_verbatim"],
                  "priority": c["derived_priority"],
                  "requires": need_u, "missing": missing,
                  "unmapped": c.get("unmapped_inputs", []),
                  "satisfied": ok,
                  "applies_count": c.get("applies_count"),
                  "selection_basis": c.get("selection_basis"),
                  "evidence": c.get("evidence"),
                  "confidence": c.get("confidence"),
                  "confidence_signals": c.get("confidence_signals", []),
                  "status": "pending"}
            if ok and chosen is None:
                ev["status"] = "selected"
                chosen = ev
            elif ok:
                ev["status"] = "outranked"
            else:
                ev["status"] = "not_enough_data"
            evaluations.append(ev)

        dual = [e for e in evaluations if e["applies_count"] == "all_of"]
        set_job(jid, status="done", result={
            "verdict": "selected" if chosen else "insufficient_data",
            "activity": activity, "chosen": chosen, "evaluations": evaluations,
            "dual_reporting": [e["method"] for e in dual],
            "considered": data.get("passages_considered", 0),
            "rejected": data.get("rejected", []),
            "model": model, "cached": cp.exists()})
    except Exception as e:  # noqa: BLE001
        import traceback
        set_job(jid, status="error",
                log_line=f"{type(e).__name__}: {e}",
                trace=traceback.format_exc()[-800:])


@app.route("/api/job/<jid>")
def api_job(jid):
    with JOBS_LOCK:
        j = JOBS.get(jid)
    if not j:
        return jsonify({"error": "unknown job"}), 404
    return jsonify(j)


@app.route("/api/fields")
def api_fields():
    from extract import fields_vocab
    return jsonify(fields_vocab())


if __name__ == "__main__":
    print("=" * 72)
    print("  AUTHORING SERVICE — not for production prediction.")
    print("  This process calls a language model, parses PDFs and reads the")
    print("  corpus. It is for reading standards and proposing rules.")
    print()
    print("  The production prediction service is:  node service/server.js")
    print("  It has no model, no parser and no index, and is held to that by")
    print("  service/boundary.test.js.")
    print("=" * 72)
    print()
    if not os.environ.get("GROQ_API_KEY"):
        print("WARNING: GROQ_API_KEY is not set — prediction will fail.\n",
              file=sys.stderr)
    print("  http://127.0.0.1:5000\n")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
