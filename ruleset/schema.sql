-- Governed methodology ruleset — the source of truth for the execution plane.
--
-- Written to run on SQLite for the prototype while staying portable to
-- PostgreSQL: no SQLite-only types, no AUTOINCREMENT, CHECK constraints only.
-- Swap TEXT timestamps for TIMESTAMPTZ and INTEGER PRIMARY KEY for BIGSERIAL
-- and this is the production DDL.
--
-- Two rules the schema enforces rather than documents:
--   * a rule cannot be APPROVED without a named approver and a timestamp
--   * a preference rank cannot exist without saying where it came from

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- versions --

CREATE TABLE IF NOT EXISTS ruleset_version (
  version         TEXT PRIMARY KEY,          -- 2026.09.01
  framework       TEXT NOT NULL,             -- GHG_PROTOCOL | ISO_14064 | DEFRA
  status          TEXT NOT NULL,             -- DRAFT | PUBLISHED | RETIRED
  created_at      TEXT NOT NULL,
  published_at    TEXT,
  published_by    TEXT,
  snapshot_sha256 TEXT,                      -- set at publish; proves immutability
  notes           TEXT,
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  CHECK (status <> 'PUBLISHED' OR
         (published_at IS NOT NULL AND published_by IS NOT NULL
          AND snapshot_sha256 IS NOT NULL))
);

-- ------------------------------------------------------------- categories --

CREATE TABLE IF NOT EXISTS rule_category (
  ruleset_version TEXT NOT NULL,
  category        TEXT NOT NULL,             -- PURCHASED_GOODS_SERVICES
  legacy_id       TEXT,                      -- identifier before formalisation;
                                             -- kept so records written against
                                             -- the old id still resolve
  framework       TEXT NOT NULL,
  label           TEXT NOT NULL,
  scope           TEXT,                      -- Scope 1 | Scope 2 | Scope 3
  framework_ref   TEXT,                      -- "Category 1"
  templates       TEXT NOT NULL DEFAULT '[]',
  form_fields     TEXT NOT NULL DEFAULT '[]',
  field_options   TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (ruleset_version, category),
  FOREIGN KEY (ruleset_version) REFERENCES ruleset_version(version)
);

-- ------------------------------------------------------------ methodology --

CREATE TABLE IF NOT EXISTS methodology (
  ruleset_version TEXT NOT NULL,
  code            TEXT NOT NULL,             -- SPEND_BASED
  name            TEXT NOT NULL,
  data_tier       TEXT,                      -- Primary | Secondary | Proxy
  confidence      TEXT,
  description     TEXT,
  source_ref      TEXT,                      -- free-text citation, may be null
  source_verified INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ruleset_version, code),
  FOREIGN KEY (ruleset_version) REFERENCES ruleset_version(version)
);

-- ------------------------------------------------------- field dictionary --

CREATE TABLE IF NOT EXISTS field_definition (
  ruleset_version TEXT NOT NULL,
  field_id        TEXT NOT NULL,
  label           TEXT NOT NULL,
  short_label     TEXT,
  kind            TEXT NOT NULL,             -- number | text | select
  unit_field      TEXT,
  dimension       TEXT,
  options         TEXT NOT NULL DEFAULT '[]',
  definition      TEXT,
  is_context      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ruleset_version, field_id),
  FOREIGN KEY (ruleset_version) REFERENCES ruleset_version(version)
);

-- ------------------------------------------------------------------ rules --

CREATE TABLE IF NOT EXISTS methodology_rule (
  ruleset_version     TEXT NOT NULL,
  rule_id             TEXT NOT NULL,         -- PGS_SPEND_001
  framework           TEXT NOT NULL,
  category            TEXT NOT NULL,
  methodology         TEXT NOT NULL,

  -- APPLICABILITY: can this method be used at all?
  required_inputs     TEXT NOT NULL,         -- JSON array of field ids
  optional_inputs     TEXT NOT NULL DEFAULT '[]',
  preconditions       TEXT NOT NULL DEFAULT '[]',

  -- PREFERENCE: should it be preferred? Deliberately separate.
  -- NULL rank is a true statement: the framework does not order these.
  preference_rank     INTEGER,
  preference_basis    TEXT,
  preference_evidence TEXT,

  -- how many results the framework wants for this activity
  applies_count       TEXT NOT NULL DEFAULT 'one_of',
  selection_basis     TEXT NOT NULL DEFAULT 'unstated',

  -- PROVENANCE travels with the rule, it is not a footnote
  source_document     TEXT,
  source_edition      TEXT,
  source_year         INTEGER,
  source_page         TEXT,
  source_chunk_id     TEXT,
  evidence_quote      TEXT,

  -- GOVERNANCE
  status              TEXT NOT NULL,
  approved_by         TEXT,
  approved_at         TEXT,
  supersedes_rule_id  TEXT,
  note                TEXT,

  -- reconstruction of an authoring decision
  extraction_model    TEXT,
  extraction_prompt   TEXT,
  extraction_schema   TEXT,

  PRIMARY KEY (ruleset_version, rule_id),
  FOREIGN KEY (ruleset_version) REFERENCES ruleset_version(version),
  FOREIGN KEY (ruleset_version, category)
    REFERENCES rule_category(ruleset_version, category),
  FOREIGN KEY (ruleset_version, methodology)
    REFERENCES methodology(ruleset_version, code),

  CHECK (status IN ('DRAFT', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN')),

  -- an unapproved rule is unpublishable, at the schema level
  CHECK (status <> 'APPROVED' OR
         (approved_by IS NOT NULL AND approved_at IS NOT NULL)),

  -- a rank without a stated basis is exactly the failure mode to prevent
  CHECK (preference_rank IS NULL OR preference_basis IS NOT NULL),

  CHECK (preference_basis IS NULL OR preference_basis IN (
    'EXPLICIT_STANDARD_GUIDANCE',   -- the document states the order
    'ORGANISATION_POLICY',          -- our choice, declared as ours
    'LEGACY_TABLE_ORDER',           -- inherited, unverified. Debt to retire.
    'NONE')),

  CHECK (applies_count IN ('one_of', 'all_of', 'unstated')),
  CHECK (selection_basis IN ('other_method_availability',
                             'published_decision_tree',
                             'activity_condition', 'unstated'))
);

CREATE INDEX IF NOT EXISTS idx_rule_lookup
  ON methodology_rule (ruleset_version, framework, category, status);
CREATE INDEX IF NOT EXISTS idx_rule_pref
  ON methodology_rule (ruleset_version, category, preference_rank);

-- ------------------------------------------------------------ audit trail --
-- Stores what is needed to REPLAY a decision, not a prose trace per record.
-- The trace is a pure function of (input_snapshot, ruleset_version,
-- engine_version), so it is regenerated on demand instead of stored 10,000
-- times per batch.

CREATE TABLE IF NOT EXISTS prediction_audit (
  prediction_id     INTEGER PRIMARY KEY,
  batch_id          TEXT NOT NULL,
  record_id         TEXT NOT NULL,
  ruleset_version   TEXT NOT NULL,
  engine_version    TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  input_snapshot    TEXT NOT NULL,
  status            TEXT NOT NULL,
  methodology       TEXT,
  matched_rule      TEXT,
  decided_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_batch ON prediction_audit (batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_idem
  ON prediction_audit (batch_id, record_id);
