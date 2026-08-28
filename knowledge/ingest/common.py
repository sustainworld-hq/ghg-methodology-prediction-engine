"""Shared plumbing for the M1 ingestion pipeline.

Holds the store schema, paths, and the document registry. The registry is
written out explicitly rather than inferred from filenames: there are only 23
files, a governance reviewer must be able to see exactly what each one is, and
a wrong edition label would poison every citation downstream.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE = ROOT / "knowledge"
CORPUS = KNOWLEDGE / "corpus"
STORE = KNOWLEDGE / "store"
DB_PATH = STORE / "knowledge.db"

# ---------------------------------------------------------------- registry --

# publisher | title | edition | year | family
# `family` groups editions of the same work so supersession can be reasoned
# about per section (see M1 plan, finding F2).
REGISTRY = {
    "ghg-protocol-revised.pdf": (
        "GHG Protocol", "Corporate Accounting and Reporting Standard",
        "Revised Edition", 2004, "ghgp-corporate"),
    "ghg-protocol-revised (1).pdf": (
        "GHG Protocol", "Corporate Accounting and Reporting Standard",
        "Revised Edition", 2004, "ghgp-corporate"),
    "Corporate-Value-Chain-Accounting-Reporing-Standard_041613_2.pdf": (
        "GHG Protocol", "Corporate Value Chain (Scope 3) Standard",
        "First Edition", 2011, "ghgp-scope3-standard"),
    "Scope3_Calculation_Guidance_0.pdf": (
        "GHG Protocol", "Technical Guidance for Calculating Scope 3 Emissions",
        "Version 1.0", 2013, "ghgp-scope3-guidance"),
    # VERIFIED DRAFT: all 87 pages carry "DRAFT FOR PUBLIC COMMENT", dated
    # March 2014. The final Scope 2 Guidance was published January 2015. This
    # file is NOT the published standard and must never be cited as one.
    "GHG Protocol Scope 2 Guidance.pdf": (
        "GHG Protocol", "Scope 2 Guidance",
        "Draft for Public Comment", 2014, "ghgp-scope2"),
    "Simplified_Guide_GHG_Management_Organizations.pdf": (
        "GHG Protocol", "Simplified Guide to GHG Management for Organizations",
        "First Edition", 2015, "ghgp-simplified"),

    # IPCC 2006 Guidelines
    "V1_3_Ch3_Uncertainties.pdf": (
        "IPCC", "2006 Guidelines V1 Ch3 Uncertainties", "2006", 2006, "ipcc-v1-ch3"),
    "V1_4_Ch4_MethodChoice.pdf": (
        "IPCC", "2006 Guidelines V1 Ch4 Methodological Choice and Identification of Key Categories",
        "2006", 2006, "ipcc-v1-ch4"),
    "V1_5_Ch5_Timeseries.pdf": (
        "IPCC", "2006 Guidelines V1 Ch5 Time Series Consistency", "2006", 2006, "ipcc-v1-ch5"),
    "V1_6_Ch6_QA_QC.pdf": (
        "IPCC", "2006 Guidelines V1 Ch6 QA/QC and Verification", "2006", 2006, "ipcc-v1-ch6"),
    "V1_8_Ch8_Reporting_Guidance.pdf": (
        "IPCC", "2006 Guidelines V1 Ch8 Reporting Guidance and Tables", "2006", 2006, "ipcc-v1-ch8"),
    "V2_2_Ch2_Stationary_Combustion.pdf": (
        "IPCC", "2006 Guidelines V2 Ch2 Stationary Combustion", "2006", 2006, "ipcc-v2-ch2"),
    "V2_3_Ch3_Mobile_Combustion.pdf": (
        "IPCC", "2006 Guidelines V2 Ch3 Mobile Combustion", "2006", 2006, "ipcc-v2-ch3"),
    "V2_4_Ch4_Fugitive_Emissions.pdf": (
        "IPCC", "2006 Guidelines V2 Ch4 Fugitive Emissions", "2006", 2006, "ipcc-v2-ch4"),
    "V2_5_Ch5_CCS.pdf": (
        "IPCC", "2006 Guidelines V2 Ch5 Carbon Dioxide Transport, Injection and Geological Storage",
        "2006", 2006, "ipcc-v2-ch5"),

    # IPCC 2019 Refinement — amendments, not replacements
    "19R_V1_Ch02_DataCollection.pdf": (
        "IPCC", "2019 Refinement V1 Ch2 Approaches to Data Collection",
        "2019 Refinement", 2019, "ipcc-v1-ch2"),
    "19R_V1_Ch03_Uncertainties.pdf": (
        "IPCC", "2019 Refinement V1 Ch3 Uncertainties", "2019 Refinement", 2019, "ipcc-v1-ch3"),
    "19R_V1_Ch04_MethodChoice.pdf": (
        "IPCC", "2019 Refinement V1 Ch4 Methodological Choice and Identification of Key Categories",
        "2019 Refinement", 2019, "ipcc-v1-ch4"),
    "19R_V1_Ch05_Timeseries.pdf": (
        "IPCC", "2019 Refinement V1 Ch5 Time Series Consistency",
        "2019 Refinement", 2019, "ipcc-v1-ch5"),
    "19R_V1_Ch06_QA_QC.pdf": (
        "IPCC", "2019 Refinement V1 Ch6 QA/QC and Verification",
        "2019 Refinement", 2019, "ipcc-v1-ch6"),
    "19R_V1_Ch07_Precursors_Indirect.pdf": (
        "IPCC", "2019 Refinement V1 Ch7 Precursors and Indirect Emissions",
        "2019 Refinement", 2019, "ipcc-v1-ch7"),
    "19R_V2_2_Ch02_Stationary_Combustion.pdf": (
        "IPCC", "2019 Refinement V2 Ch2 Stationary Combustion",
        "2019 Refinement", 2019, "ipcc-v2-ch2"),

    "2026-GHG-conversion-factors-methodology-report.pdf": (
        "DEFRA", "GHG Conversion Factors Methodology Report", "2026", 2026, "defra-methodology"),
}

# Publishers lay out headings differently; 03_segment reads these profiles.
# Documents that are drafts or consultations. Anything extracted from these
# carries provisional status through to governance and can never be published
# as a citation to the final standard.
PROVISIONAL = {"GHG Protocol Scope 2 Guidance.pdf"}

HEADING_PROFILES = {
    "GHG Protocol": {"size_ratio": 1.12, "max_words": 14, "allow_allcaps": True},
    "IPCC":         {"size_ratio": 1.10, "max_words": 16, "allow_allcaps": True},
    "DEFRA":        {"size_ratio": 1.12, "max_words": 16, "allow_allcaps": True},
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    doc_id            TEXT PRIMARY KEY,
    filename          TEXT NOT NULL,
    sha256            TEXT NOT NULL,
    publisher         TEXT,
    title             TEXT,
    edition           TEXT,
    year              INTEGER,
    family            TEXT,
    page_count        INTEGER,
    char_count        INTEGER,
    status            TEXT,             -- active | duplicate
    duplicate_of      TEXT,
    provisional       INTEGER DEFAULT 0 -- 1 = draft/consultation, not final
);

CREATE TABLE IF NOT EXISTS pages (
    doc_id     TEXT NOT NULL,
    page_no    INTEGER NOT NULL,
    text       TEXT,
    spans      TEXT,                    -- JSON: line-level font metrics
    PRIMARY KEY (doc_id, page_no)
);

CREATE TABLE IF NOT EXISTS sections (
    section_id  TEXT PRIMARY KEY,
    doc_id      TEXT NOT NULL,
    ordinal     INTEGER,
    path        TEXT,                   -- "Chapter 6 > 6.2 > Method 1"
    heading     TEXT,
    level       INTEGER,
    page_start  INTEGER,
    page_end    INTEGER,
    char_count  INTEGER
);

CREATE TABLE IF NOT EXISTS chunks (
    chunk_id     TEXT PRIMARY KEY,
    doc_id       TEXT NOT NULL,
    section_id   TEXT,
    ordinal      INTEGER,
    text         TEXT NOT NULL,
    token_count  INTEGER,
    page_start   INTEGER,
    page_end     INTEGER,
    scope_tag    TEXT,
    category_tag TEXT
);

CREATE INDEX IF NOT EXISTS idx_sections_doc ON sections(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc   ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_sec   ON chunks(section_id);
"""


def connect() -> sqlite3.Connection:
    STORE.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def doc_id_for(filename: str) -> str:
    """Stable, readable id derived from the filename."""
    stem = Path(filename).stem
    keep = [c.lower() if c.isalnum() else "-" for c in stem]
    out = "".join(keep)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def jdump(obj) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
