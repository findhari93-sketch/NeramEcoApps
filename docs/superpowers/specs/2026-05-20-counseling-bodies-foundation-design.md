# Seed 22 NATA-Based B.Arch Counseling Systems — Design Spec

**Date:** 2026-05-20
**Author:** Haribabu (via Claude Code brainstorming)
**Status:** Approved by user (rewritten after schema discovery)
**Source research:** `apps/app/Docs/compass_artifact_wf-255ed70a-4888-4d03-a4e2-bd9ac4d57372_text_markdown.md`

---

## Context

Neram Classes is building a NATA-based college and rank predictor at `app.neramclasses.com/tools/counseling`. The research document profiles 24 numbered entries for state B.Arch counseling bodies (NATA-based, TNEA excluded); two of those entries (#22 Assam and #24 Northeast states) are explicit "no state B.Arch counseling exists" callouts rather than real bodies. **The actionable body count is 22**, which is what this spec seeds.

**A counseling-intelligence schema already exists** on the Supabase project and is *not* recorded in the local `supabase/migrations/` folder (matches the project's MCP-only-apply pattern). The relevant live tables are:

- `counseling_systems` — master registry (currently 1 row: `TNEA_BARCH`)
- `college_counseling_participation` — year-scoped college↔system links with `branches` JSONB and `seat_matrix` JSONB
- `historical_cutoffs` — year × round × branch × category cutoffs
- `rank_list_entries` — anonymized rank list rows (score→rank prediction)
- `allotment_list_entries` — anonymized allotment rows (college-specific predictions)
- `rank_list_year_summary`, `allotment_year_summary` — derived summaries
- `counseling_audit_log`, `counseling_college_directory`, `prediction_logs`

Types + queries already exist in `packages/database/src/types/index.ts` and `packages/database/src/queries/counseling.ts` and consume these tables.

**Conclusion:** the foundation is already built. The gap is data — only TNEA is seeded. This spec covers inserting 24 new rows into the existing `counseling_systems` table from the doc's research.

## Goals

1. Insert 22 new `counseling_systems` rows for all NATA-based bodies in the doc that represent real counseling pipelines.
2. Idempotent (`ON CONFLICT (code) DO NOTHING`) so re-running is safe.
3. Faithfully translate the doc's data into the existing schema shape — especially `merit_formula` and `exams_accepted`.

## Non-goals

- No new tables, types, queries, schema changes (`ALTER TABLE`).
- No `college_counseling_participation` rows (needs per-body `college_code` and `branches` we don't have without scraping each body's PDFs).
- No `historical_cutoffs` data — out of scope, per-body work later.
- No predictor UI, no scraping, no `/tools/counseling/college-predictor` page.
- No reseeding/modifying the existing `TNEA_BARCH` row.
- `data_quality_score`, `body_type`, `domicile_required`, `home_state_quota_percent` — the existing schema has no columns for these; the signal is dropped from this slice. Domicile/state-quota info instead lives in `merit_formula.notes` and `special_reservations`.

---

## 1. Schema (reference — no changes)

The existing `counseling_systems` table columns:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| code | text UNIQUE NOT NULL | e.g. 'KEAM_BARCH' |
| name | text NOT NULL | full name |
| short_name | text | derived, e.g. 'KEAM' |
| slug | text NOT NULL | kebab-case, e.g. 'keam-barch' (for marketing URLs) |
| state | text NOT NULL | |
| conducting_body | text NOT NULL | short form, e.g. 'CEE Kerala' |
| conducting_body_full | text | full governing authority |
| official_website | text | |
| merit_formula | jsonb NOT NULL | `{method, components:[…], total_marks}` |
| exams_accepted | text[] NOT NULL | e.g. `['NATA']` or `['NATA','JEE_Main_Paper_2']` |
| categories | jsonb NOT NULL | array of `{code, name, description?}` |
| special_reservations | jsonb | array of `{code, name, percentage?}` or null |
| typical_counseling_months | text | e.g. 'July-August' |
| typical_rounds | integer | |
| is_active | boolean | default true |
| created_at, updated_at | timestamptz | |

No constraints on `merit_formula.method` value; treat as a free TEXT inside JSONB.

---

## 2. Field mapping (doc → schema)

| Doc field | Schema column | Mapping rule |
|---|---|---|
| `code` | `code` | direct (string ends in `_BARCH`) |
| `full_name` | `name` | direct |
| derived | `short_name` | code with the trailing `_BARCH` stripped, e.g. `KEAM_BARCH` → 'KEAM', `ACPC_GUJ_BARCH` → 'ACPC_GUJ'. For multi-token codes, replace `_` with space for readability if it makes a more natural label (judgment call per row — list of explicit short_names is in the implementation plan). |
| derived | `slug` | LOWER(REPLACE(code, '_', '-')), e.g. 'keam-barch' |
| `state` | `state` | direct |
| `governing_authority` (short) | `conducting_body` | direct; if long, abbreviate |
| `governing_authority` (full) | `conducting_body_full` | direct |
| `official_url` | `official_website` | direct |
| `merit_formula` (doc) | `merit_formula` | reshape, see §3 |
| `exam_required` | `exams_accepted` | map, see §4 |
| n/a | `categories` | generic 5-category placeholder, see §5 |
| derived | `special_reservations` | from doc's quota/reservation notes where explicit; else null. See §6 |
| derived | `typical_counseling_months` | from doc's 2025 timeline narrative, see §7 |
| `rounds_per_year` | `typical_rounds` | direct |
| always true | `is_active` | true |

## 3. `merit_formula` translation (per-strategy)

Following the TNEA precedent of `{method, components, total_marks}` with `max_marks=200` for each side of a 50:50 body.

### 3.1 Strategy: weighted 50:50 NATA + HSC (the majority)

Bodies: KEAM, MAHACET, ACPC, CEPT, REAP, MPDTE, HPTU, IKGPTU, JKBOPEE, BCECEB, HSTES, GGSIPU, DTEGOA, UTU, JMI.

```json
{
  "method": "raw_sum",
  "components": [
    {"key": "hsc_aggregate",  "name": "Class 12 Aggregate",  "source": "board_marks",   "max_marks": 200, "description": "HSC/Plus-Two aggregate, normalized to 200 per Council of Architecture guideline"},
    {"key": "entrance_score", "name": "NATA Score",          "source": "entrance_exam", "max_marks": 200, "description": "NATA score (or JEE Main Paper 2 if body accepts both — see exams_accepted)"}
  ],
  "total_marks": 400,
  "notes": "Council of Architecture 50:50 default formula"
}
```

For dual-stream bodies (MAHACET, ACPC, MPDTE, REAP, HSTES, BCECEB), append a `separate_lists: true` flag at the top level and update the `notes` to say "Separate inter-se merit lists prepared for NATA-stream and JEE-Main-Paper-2-stream candidates."

### 3.2 Strategy: NATA-only (entrance-only)

Bodies: KCET (Karnataka), UPTAC, WBJEEB.

```json
{
  "method": "entrance_only",
  "components": [
    {"key": "nata_score", "name": "NATA Score", "source": "entrance_exam", "max_marks": 200, "description": "Merit is NATA score directly; Class 12 with PCM is eligibility only. JEE Main Paper 2 also accepted by this body — see exams_accepted."}
  ],
  "total_marks": 200,
  "notes": "Class 12 PCM is eligibility threshold; not part of merit"
}
```

### 3.3 Strategy: SAR normalized composite (AP/Telangana)

Bodies: APSCHE_BARCH, TSCHE_BARCH.

```json
{
  "method": "normalized_composite",
  "components": [
    {"key": "nata_score",   "name": "NATA Score",                  "source": "entrance_exam", "max_marks": 200},
    {"key": "jee_p2_score", "name": "JEE Main Paper 2 Score",      "source": "entrance_exam", "max_marks": 200}
  ],
  "total_marks": 200,
  "notes": "State Architecture Rank (SAR) computed via APSCHE/TSCHE normalisation procedure; formula not publicly published. Historical rank-vs-score mapping required for predictions."
}
```

### 3.4 Strategy: JEE-led, NATA threshold (OJEE Odisha)

```json
{
  "method": "jee_rank_primary",
  "components": [
    {"key": "jee_p2_rank", "name": "JEE Main Paper 2 All-India Rank", "source": "entrance_exam", "max_marks": null, "description": "Final merit list ranks candidates by JEE Main 2025 rank; NATA serves as additional eligibility threshold per Council of Architecture mandate."}
  ],
  "total_marks": 0,
  "notes": "Per OJEE 2025 brochure: candidates must appear and qualify in JEE Main; NATA is additional eligibility for B.Arch."
}
```

`total_marks: 0` flags that this body uses rank, not score. UI/predictor logic later can branch on `method === 'jee_rank_primary'`.

### 3.5 Strategy: BCECEB (Bihar) — JEE OR NATA, candidate's choice

```json
{
  "method": "jee_or_nata_merit",
  "components": [
    {"key": "jee_p2_score_or_nata_score", "name": "JEE Main 2025 OR NATA 2025", "source": "entrance_exam", "max_marks": 200, "description": "Candidate's best of JEE Main Paper 2 or NATA score, Bihar domicile required."}
  ],
  "total_marks": 200,
  "notes": "GEC Gaya only college; B.Arch advertised separately after main UGEAC notification"
}
```

### 3.6 Strategy: CGDTE (Chhattisgarh)

Same as 3.5 (NATA or JEE-P2) but Chhattisgarh-specific. Use `method: 'nata_or_jee_p2'`, single-component formula similar to 3.5.

## 4. `exams_accepted` mapping

| Doc `exam_required` | `exams_accepted` array |
|---|---|
| `NATA` | `['NATA']` |
| `NATA_OR_JEE_P2` | `['NATA', 'JEE_Main_Paper_2']` |
| `NATA_AND_JEE_P2` | `['NATA', 'JEE_Main_Paper_2']` (semantically different but array shape same; the AND constraint is implied by merit_formula method='normalized_composite' which requires both) |
| `JEE_P2_PRIMARY_NATA_ELIGIBILITY` | `['JEE_Main_Paper_2', 'NATA']` (JEE first to signal primacy) |

Existing TNEA uses `['NATA']`. Some doc bodies are NATA-only too (KCET, CEPT, DTEGOA, JMI). Match the array order to convey precedence where it matters.

## 5. `categories` placeholder

Per user decision, seed a generic 5-category set for every new body:

```json
[
  {"code": "GEN", "name": "General Merit",       "description": "Open / Unreserved"},
  {"code": "OBC", "name": "Other Backward Class"},
  {"code": "SC",  "name": "Scheduled Caste"},
  {"code": "ST",  "name": "Scheduled Tribe"},
  {"code": "EWS", "name": "Economically Weaker Section"}
]
```

Each new row also gets a `categories_note` inside `special_reservations.notes` (or a top-level comment in the migration SQL) flagging that real state-specific categories (Gujarat SEBC, Maharashtra MS/AI, Karnataka A-O codes, J&K RBA/OSC/ALC, etc.) will land with cutoff ingestion per body.

The existing `TNEA_BARCH` row is **not modified** — its 7 real categories stay.

## 6. `special_reservations` — explicit-only

Seed only where the doc gives a number. Otherwise `null`. Examples:

- `ACPC_GUJ_BARCH`: `[{"code":"SEBC","name":"Socially & Economically Backward Class","percentage":27.0,"notes":"Creamy-layer-excluded"}, {"code":"HS","name":"Home-State (Gujarat / D&D / DNH)","percentage":null,"notes":"Home-state quota for school-qualified candidates"}]`
- `MPDTE_BARCH`: `[{"code":"DOM","name":"MP Domicile","percentage":90.0},{"code":"AI","name":"All India","percentage":5.0},{"code":"OTHER","name":"Other","percentage":5.0}]`
- `IKGPTU_BARCH`: `[{"code":"DOM","name":"Punjab Domicile","percentage":85.0},{"code":"AI","name":"All India","percentage":15.0}]`
- `GGSIPU_BARCH`: `[{"code":"DR","name":"Delhi Region","percentage":85.0},{"code":"OD","name":"Outside Delhi","percentage":15.0}]`
- `JKBOPEE_BARCH`: `null` — doc gives seat counts (40+40) but not reservation percentages.

All other bodies: `null`.

## 7. `typical_counseling_months`

Derived from each body's doc-cited 2025 timeline:

| Body | Months |
|---|---|
| KEAM | 'July-August' |
| MAHACET | 'August-September' |
| WBJEEB | 'August-September' |
| APSCHE | 'July-August' |
| TSCHE | 'June-August' |
| KCET | 'July-September' |
| CEPT | 'June-July' |
| ACPC | 'June-August' |
| UPTAC | 'June-August' |
| REAP | 'July-August' |
| MPDTE | 'July-August' |
| HSTES | 'June-August' |
| GGSIPU | 'July' |
| DTEGOA | 'July' |
| OJEE | 'July-August' |
| HPTU / IKGPTU / JKBOPEE / BCECEB / JMI / UTU / CGDTE | best-effort from doc, null if unclear |

When the doc doesn't give clear month info, leave `typical_counseling_months` as `NULL`.

---

## 8. Files touched

**New files:**
- `packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql` — single migration with 24 `INSERT … ON CONFLICT (code) DO NOTHING` statements.

**Modified files:** none.

**Not touched:** `packages/database/src/queries/counseling.ts` (already returns these rows once seeded), `counseling_systems` schema, `TNEA_BARCH` row.

The migration is also applied directly to staging via `mcp__supabase-staging__apply_migration` (the project convention), so the local migration file is the durable record of what was applied.

---

## 9. Verification

After applying:

1. **Row count:** `SELECT COUNT(*) FROM counseling_systems;` → expect 23 (TNEA + 22 new).
2. **Distinct states:** `SELECT DISTINCT state FROM counseling_systems ORDER BY state;` → expect 21 distinct states (Delhi appears twice for GGSIPU + JMI; Gujarat twice for CEPT + ACPC; TNEA is Tamil Nadu).
3. **Merit-formula methods distribution:** `SELECT merit_formula->>'method' AS method, COUNT(*) FROM counseling_systems GROUP BY method;` → expect counts roughly matching §3 (raw_sum dominant ~15, entrance_only ~3, others 1–2 each).
4. **Exams accepted:** `SELECT code, exams_accepted FROM counseling_systems WHERE 'JEE_Main_Paper_2' = ANY(exams_accepted) ORDER BY code;` → confirm dual-stream bodies appear.
5. **No accidental TNEA modification:** `SELECT short_name, name, categories FROM counseling_systems WHERE code = 'TNEA_BARCH';` → expect the 7-category TN list unchanged.
6. **Queries work end-to-end:** in a throwaway server component or via Supabase Studio, `SELECT * FROM counseling_systems WHERE is_active = true ORDER BY state, name;` returns 23 rows including all the new bodies.

No Playwright tests in this slice — no UI.

---

## 10. Rollout

1. Write the migration file locally.
2. Apply to **staging** via `mcp__supabase-staging__apply_migration`.
3. Run verification queries §9 on staging.
4. Commit the migration file to git (user decides when).
5. When user is ready, apply to **production** via `mcp__supabase-prod__apply_migration`. Migration is idempotent — safe to re-run.
6. Regenerate types: `pnpm supabase:gen:types` (optional; the schema didn't change, only data).

---

## 11. Open questions / risks

1. **Doc accuracy is human-research, not authoritative.** A few merit-formula details from the doc are inferences (e.g., HPTU 50:50 is per "getmyuni summaries", JMI may have shifted JEE-P2 vs NATA between years). Seeded values reflect the doc's best read; the `merit_formula.notes` field flags ambiguities so they can be revised when each body's 2026 prospectus is parsed.
2. **CEPT body_type.** Existing schema has no `body_type` column. CEPT is technically a state-act university and JMI is central. This information lives only in the `conducting_body_full` text on those rows. If the predictor UI later needs to filter "state-government only", a small ALTER migration adds a `body_type` enum column — out of scope here.
3. **AP/TG SAR opacity.** APSCHE/TSCHE State Architecture Rank's normalisation isn't public. Predictions for these states must rely on `rank_list_entries`/`allotment_list_entries` historical data once ingested, not analytical conversion. Documented in `merit_formula.notes`.
4. **Categories are placeholder.** UI consumers should not present the generic GEN/OBC/SC/ST/EWS categories as authoritative for any body other than TNEA. Replace per-body with real categories during cutoff ingestion. Add a UI-level "categories under verification" badge if shown before refinement.
5. **CGDTE category column.** Doc text says CG-PET does not include B.Arch; admission is on NATA or JEE-P2. Confirmed — `nata_or_jee_p2` method correct.
6. **JKBOPEE seat count drift.** Doc says 40+40=80 per 2024 notification; could change in 2026. `typical_rounds` and `typical_counseling_months` set conservatively / null where unclear.

---

## 12. Out-of-scope follow-ups

- Per-body PDF scraping → `historical_cutoffs`, `rank_list_entries`, `allotment_list_entries`. Start with the doc's Phase 1 ★★★★+ set (KEAM, MAHACET, ACPC, CEPT, KCET, MPDTE, WBJEEB, UPTAC, HSTES).
- `college_counseling_participation` rows per body × year (requires per-body college codes + branch lists from official seat matrices).
- Predictor UI at `/tools/counseling/college-predictor`.
- Real per-body categories (replace the generic 5-row placeholder).
- Optional ALTER to add `body_type`, `domicile_required`, `home_state_quota_percent`, `data_quality_score` columns if predictor UI later needs them.
- Per-body marketing landing pages (`/college-hub/maharashtra-counseling`, etc.) leveraging the `slug` field.

---

**End of spec.**
