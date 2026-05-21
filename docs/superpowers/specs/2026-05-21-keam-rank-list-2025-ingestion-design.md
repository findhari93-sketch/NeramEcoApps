# KEAM 2025 Data Foundation — Design Spec

**Date:** 2026-05-21
**Author:** Haribabu (via Claude Code brainstorming)
**Status:** Approved by user (design confirmed; scope expanded to cover both Part A and Part B)
**Source materials in `apps/app/Docs/Counselling_datas/KEAM/`:**
- `keam_2025_barch_supabase.sql` (787 lines, user-prepared: schema + 27 colleges + 28 seat types + 660 Phase 1 allotments + `keam_cutoffs` view)
- `keam_predictor.ts` (existing reference TypeScript college predictor that reads `keam_cutoffs`)
- `2025_rank_provi.pdf` (162 KB, 75 pages, 1,791 candidates, KEAM 2025 Provisional Rank List)
- (Other prepared CSV/JSON files: `keam_2025_barch_phase1_allotments.csv|json`, `keam_2025_barch_cutoffs_by_seat_type.csv`, `keam_2025_barch_college_cutoffs.json` — derived from the SQL, kept as reference, not directly imported)

This spec covers **two independent deliverables** that together unlock both KEAM predictors:
- **Part A — College predictor data layer:** Apply the user-prepared `keam_2025_barch_supabase.sql` to Supabase. Creates `keam_colleges`, `keam_seat_types`, `keam_allotments`, and the `keam_cutoffs` view. After this, `keam_predictor.ts` becomes functional end-to-end (when wired into the app, separate session).
- **Part B — Rank predictor data layer:** Parse `2025_rank_provi.pdf` and import the 1,791 candidate rows into the existing global `rank_list_entries` table.

The two deliverables share zero code paths (different tables, different scripts) and can land in either order. Combining them in one spec because they share PDF/SQL discovery and verification flow.

---

## Context

`counseling_systems` now has 23 rows including `KEAM_BARCH` (seeded yesterday). The eventual KEAM tooling has two distinct predictor surfaces:

1. **Rank predictor**: input (NATA + 12th marks) → predicted KEAM rank. Data source: KEAM Rank List PDFs → `rank_list_entries` table.
2. **College predictor**: input (rank, category) → list of colleges with Safe/Likely/Borderline/Unlikely classifications. Data source: KEAM Phase 1 Allotment data → `keam_cutoffs` view. Reference TypeScript implementation at `apps/app/Docs/Counselling_datas/KEAM/keam_predictor.ts`.

The user has pre-prepared the **entire college predictor data layer** as `keam_2025_barch_supabase.sql` (this is Part A; we just apply it). Their offline work also produced derived JSON/CSV artifacts in the same folder for spot-checking.

The **rank predictor data layer** (Part B) still needs a parser/importer for the `2025_rank_provi.pdf` rank list — 1,791 candidates, NATA + Qualifying marks → rank. No community/category breakdown; no college info; just every candidate's rank.

UI/API wiring for either predictor is **out of scope** for this session and tracked as the next session.

## Goals

### Part A — College predictor data layer (apply prepared SQL)
1. Apply `keam_2025_barch_supabase.sql` to staging (then prod on user command). The SQL is self-contained, idempotent (`ON CONFLICT (code) DO UPDATE` for reference data, `UNIQUE(year, phase, course, sl_no)` for allotments), and creates 3 tables + 1 view + 4 indexes + 715 rows of seed data (27 colleges, 28 seat types, 660 allotments).
2. Verify counts and that the `keam_cutoffs` view returns expected ~149 rows (matching the prepared `keam_2025_barch_cutoffs_by_seat_type.csv`).
3. Don't modify the user's SQL except for trivial path adjustments if any are needed for Supabase MCP.

### Part B — Rank predictor data layer (parse + import PDF)
1. Parse 1,791 candidates from `2025_rank_provi.pdf` into a JSON file.
2. Import those rows into the existing `rank_list_entries` table on staging (then prod on user command).
3. Idempotent: re-running parse + import is safe and converges.
4. Establish a script pattern reusable for future KEAM years (2020–2024).

## Non-goals

- No `historical_cutoffs` data, no `allotment_list_entries` rows in the global cross-body tables for KEAM (KEAM's allotment data lives in its isolated `keam_allotments` table per the prepared SQL, by user's design choice).
- No `college_counseling_participation` rows for KEAM.
- No reconciliation between `keam_colleges` and the unified `colleges` table.
- No UI changes. No predictor wiring. No API routes. Just the data layers.
- No backfill for KEAM 2020–2024 (need their PDFs and/or prepared SQL files).
- No web scraping. PDFs are placed manually under `apps/app/Docs/Counselling_datas/<body>/<year>_*.pdf` by the user.
- No modifications to `keam_predictor.ts`.

---

---

# Part A — College predictor data layer (apply prepared SQL)

## A.1 What the SQL does

The user-prepared `apps/app/Docs/Counselling_datas/KEAM/keam_2025_barch_supabase.sql` is 787 lines:

- Lines 7–13: `CREATE TABLE IF NOT EXISTS keam_colleges` (code PK, name, town, district, college_type)
- Lines 15–18: `CREATE TABLE IF NOT EXISTS keam_seat_types` (code PK, meaning)
- Lines 20–31: `CREATE TABLE IF NOT EXISTS keam_allotments` (year, phase, course, sl_no, appl_no, rank, college_code FK, seat_type FK; UNIQUE(year, phase, course, sl_no))
- Lines 33–36: 4 indexes on `keam_allotments` (rank, college_code, seat_type, year+phase)
- Lines 39–57: `CREATE OR REPLACE VIEW keam_cutoffs` — aggregates allotments via `MIN(rank)` and `MAX(rank)` per (college, seat_type, year, phase, course); this is the view `keam_predictor.ts` reads
- Lines 62–90: 27 `INSERT INTO keam_colleges` rows with `ON CONFLICT (code) DO UPDATE`
- Lines 92–121: 28 `INSERT INTO keam_seat_types` rows with `ON CONFLICT (code) DO UPDATE`
- Lines 126–787: 660 `INSERT INTO keam_allotments` rows for (2025, 'Phase1', 'Architecture')

The SQL is **fully idempotent**: re-running upserts reference data and re-inserts allotments are protected by `UNIQUE(year, phase, course, sl_no)`. Safe to apply multiple times.

## A.2 Apply path

Via Supabase MCP — the project pattern from yesterday's counseling_systems work:

1. Read full file content.
2. `mcp__supabase-staging__apply_migration` with `name = 'keam_2025_barch_data'` and `query = <full SQL>`.
3. Verify (§A.3 below).
4. On explicit user command: `mcp__supabase-prod__apply_migration` with same name/query.

The SQL itself isn't checked into `packages/database/supabase/migrations/` because it creates KEAM-specific tables outside the unified migration history. Instead, the canonical artifact is the file at `apps/app/Docs/Counselling_datas/KEAM/keam_2025_barch_supabase.sql` — that's the source of truth. (If we wanted unified migration tracking later, we could copy it; out of scope here.)

## A.3 Verification queries (run on staging after apply)

```sql
-- A.3.1: Tables exist with expected row counts
SELECT 'keam_colleges' AS t, COUNT(*) AS n FROM keam_colleges
UNION ALL SELECT 'keam_seat_types', COUNT(*) FROM keam_seat_types
UNION ALL SELECT 'keam_allotments', COUNT(*) FROM keam_allotments
ORDER BY t;
-- Expected: keam_allotments=660, keam_colleges=27, keam_seat_types=28

-- A.3.2: View exists and returns expected row count
SELECT COUNT(*) AS view_rows FROM keam_cutoffs;
-- Expected: 149 (matches keam_2025_barch_cutoffs_by_seat_type.csv = 149 data rows + header)

-- A.3.3: View column shape matches predictor expectation
SELECT * FROM keam_cutoffs WHERE college_code = 'ALR' ORDER BY seat_type;
-- Expected 3 rows: ALR/MU(1005-1005), ALR/SM(673-1001), ALR/VK(1487-1487)
-- Columns must include: year, phase, course, college_code, college_name, town, district, college_type, seat_type, seat_type_meaning, seats_filled, opening_rank, closing_rank

-- A.3.4: Specific predictor sanity — TVE (top college) SM should have rank 4 opening, ~30+ closing
SELECT * FROM keam_cutoffs WHERE college_code = 'TVE' AND seat_type = 'SM';
-- Expected: opening_rank=4, closing_rank=43, seats_filled=15
```

## A.4 Files touched in Part A

- `apps/app/Docs/Counselling_datas/KEAM/keam_2025_barch_supabase.sql` — read only, not modified
- No new files
- No app code changes
- Staging DB: 3 new tables + 1 view + 715 rows
- Production DB: same, on explicit user command

---

# Part B — Rank predictor data layer (parse + import Rank List PDF)

## 1. Schema (reference — no changes)

The existing `rank_list_entries` table:

| Column | Type | Nullable | Source for KEAM rows |
|---|---|---|---|
| id | uuid PK | NO | `gen_random_uuid()` |
| counseling_system_id | uuid | NO | resolved from `counseling_systems.code = 'KEAM_BARCH'` |
| year | integer | NO | 2025 |
| serial_number | integer | YES | parsed PDF Sl.No (1–1791) |
| rank | integer | NO | parsed PDF Rank |
| application_number | text | YES | parsed PDF ApplNo (7-digit string) |
| candidate_name | text | YES | NULL (PDF has no names) |
| date_of_birth | text | YES | NULL (PDF has no DOB) |
| hsc_aggregate_mark | numeric | YES | parsed PDF Qualifying Mark (/200) |
| entrance_exam_mark | numeric | YES | parsed PDF NATA Score (/200) |
| aggregate_mark | numeric | NO | derived: `hsc_aggregate_mark + entrance_exam_mark` (/400) |
| community | text | NO | hardcoded `'OVERALL'` (see §2 rationale) |
| community_rank | integer | YES | NULL (not present in this PDF) |
| created_at | timestamptz | YES | `now()` |
| created_by | text | YES | `'keam-import'` |

**Unique constraint:** `(counseling_system_id, year, rank)` — already exists per `rank_list_entries_counseling_system_id_year_rank_key`. Drives the upsert in §5.

## 2. `community = 'OVERALL'` rationale

The schema requires `community NOT NULL`. KEAM's Architecture rank list is a single unified ranking — there is no community/category split inside this PDF (TNEA publishes separate community rank lists; KEAM Architecture does not). Seeding `'OVERALL'` is a semantic placeholder meaning "this row is from the unified overall ranking, not a community sublist." TNEA's existing rows use real community codes (BC, OC, SC, etc.) because TNEA publishes community-wise lists; the two patterns coexist cleanly because queries filter by `counseling_system_id` first.

If KEAM ever publishes community-wise rank lists in the future, those would be ingested as additional rows with real community values (BX, EZ, MU, SC, ST, etc.) — the `'OVERALL'` rows would remain unchanged.

## 3. Pipeline

Two-stage to keep parsing iteration off the database:

```
apps/app/Docs/Counselling_datas/KEAM/2025_rank_provi.pdf
   │
   │  scripts/parse-keam-rank-list.mjs --year 2025 --pdf <path> --out <path>
   ▼
scripts/data/keam-rank-list-2025.json    (committed, ~150 KB, 1791 rows)
   │
   │  scripts/import-keam-rank-list.mjs --year 2025 --env staging|prod --in <path>
   ▼
rank_list_entries  (1791 new rows for KEAM_BARCH × year 2025)
```

The JSON file is the audit trail and the contract between parser and importer. Parser failure is debugged offline. Importer is environment-aware.

## 4. Parser design — `scripts/parse-keam-rank-list.mjs`

### 4.1 Dependencies

- `pdf-parse` (npm) — text extraction from PDF. Confirmed earlier via `pdftotext` that the PDF is text-based (not scanned), so `pdf-parse` will work.
- Standard Node 24+ built-ins (`fs/promises`, `path`, `url`).

`scripts/package.json` gains `pdf-parse` as a dependency.

### 4.2 Algorithm

1. Read the PDF buffer.
2. Run `pdf-parse` to get the full extracted text, reading-order (no `-layout`).
3. Split into lines, trim, drop empty.
4. Strip noise lines matching any of these patterns:
   - `/^Office of the Commissioner/`
   - `/^Phone : /`
   - `/^KEAM 2025 - Admission/`
   - `/^RANK LIST/`
   - `/^Sl\.No\./`
   - `/^ApplNo\.?$/`, `/^NATA Score$/`, `/^Qualifying Exam Mark$/`, `/^out of 200$/`, `/^Rank$/`
   - `/^Page \d+$/`
   - `/^Commissioner for Entrance/`
   - `/^\d{2}-\d{2}-\d{4}$/` (footer date `18-07-2025`)
   - Pure Sl.No clusters: lines that are a single 1-3 digit number unaccompanied by ApplNo/NATA/Qual context (these come from the "Sl.No 1 2 3 ... 24" header artifact)
5. Walk the remaining lines using a state machine: the parser locks onto each `^\d{7}$` (ApplNo) and reads the next 3 non-noise lines as NATA / Qualifying / Rank. Any line not matching the expected position is skipped (with a debug log) rather than aborted, EXCEPT the final row count gate (step 7) is the source of truth.

   - **L1**: ApplNo — exactly 7 digits, regex `/^\d{7}$/`
   - **L2**: NATA Score — `/^\d{1,3}\.\d{2}$/`, expect value in [0, 200]
   - **L3**: Qualifying Mark — `/^\d{1,3}\.\d{4}$/`, expect value in [0, 200]
   - **L4**: Rank — `/^\d{1,5}$/` OR `/^Rank\s+(\d{1,5})$/` (see edge case A below). Expect value in [1, 50000].

   **Observed edge cases in the 2025 PDF (confirmed by `pdftotext` extraction):**

   - **Edge case A — "Rank N" first-row collision:** The PDF column header "Rank" text appears on the same line as the FIRST data row's rank value, producing a line like `Rank 129` instead of just `129`. The L4 regex must accept both forms; if the `Rank ` prefix is present, extract the trailing digits.

   - **Edge case B — Sl.No clusters per page:** Each page begins with a Sl.No column-header cluster that pdftotext renders as a row of bare numbers (e.g. `Sl.No. 1 2 3 4 ... 24`). These appear once per page (75 pages → ~75 such clusters). The noise filter in step 4 strips them via the `/^Sl\.No\./` regex on the first line of the cluster, plus a heuristic: any sequence of single-number lines (1–3 digits each) that doesn't follow an ApplNo is treated as Sl.No-cluster noise.

   - **Edge case C — Page-break repetition of column headers:** "Office of the Commissioner...", "KEAM 2025...", "RANK LIST...", "ApplNo.", "NATA Score", "Qualifying Exam Mark out of 200", "Rank" — these appear once per page. The noise filter in step 4 handles all of them.
6. Assign `serial_number` sequentially in the order rows are emitted (1, 2, 3 …).
7. **Hard gate**: after walking the entire PDF, the parser must have emitted **exactly 1,791 rows**. Cross-checked against `pdftotext | grep -c '^[0-9]{7}$'` = 1791. If count differs, the parser fails with an error showing actual count and probable cause.
8. Emit JSON with shape:

```json
{
  "source_pdf": "apps/app/Docs/Counselling_datas/KEAM/2025_rank_provi.pdf",
  "extracted_at": "2026-05-21T...",
  "counseling_system_code": "KEAM_BARCH",
  "year": 2025,
  "row_count": 1791,
  "rows": [
    { "serial_number": 1, "application_number": "1100234", "entrance_exam_mark": 118.00, "hsc_aggregate_mark": 186.0000, "aggregate_mark": 304.0000, "rank": 129 },
    …
  ]
}
```

### 4.3 CLI

```bash
node scripts/parse-keam-rank-list.mjs \
  --year 2025 \
  --pdf "apps/app/Docs/Counselling_datas/KEAM/2025_rank_provi.pdf" \
  --out "scripts/data/keam-rank-list-2025.json"
```

All arguments required; no defaults (forces explicit invocation). If `--out` file exists, overwrite without prompt.

## 5. Importer design — `scripts/import-keam-rank-list.mjs`

### 5.1 Dependencies

- `@supabase/supabase-js` (already in `scripts/package.json`)
- `dotenv` or equivalent — match whatever `import-josaa-barch.mjs` uses for env loading

### 5.2 Algorithm

1. Parse CLI args: `--env staging|prod --in <json path> --year 2025 [--batch-size 500]`.
2. Load env vars from `apps/app/.env.local` (staging) or `apps/app/.env.production` (prod) — mirroring `import-josaa-barch.mjs` pattern. Required: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Create Supabase admin client.
4. Resolve `KEAM_BARCH` UUID:
   ```js
   const { data: system, error } = await supabase
     .from('counseling_systems')
     .select('id')
     .eq('code', 'KEAM_BARCH')
     .single();
   ```
   Abort if not found.
5. Read JSON file. Validate `row_count === rows.length`. Validate `year === 2025`.
6. Map each row to the table shape, adding:
   - `counseling_system_id: system.id`
   - `year: 2025`
   - `community: 'OVERALL'`
   - `community_rank: null`
   - `candidate_name: null`
   - `date_of_birth: null`
   - `created_by: 'keam-import'`
7. Upsert in batches of 500:
   ```js
   await supabase.from('rank_list_entries')
     .upsert(batch, { onConflict: 'counseling_system_id,year,rank' });
   ```
   This relies on the existing `rank_list_entries_counseling_system_id_year_rank_key` unique index. On conflict, update non-key fields (so re-runs with corrected data overwrite).
8. After all batches, print a summary:
   - inserts attempted, rows written, distinct ranks, min/max rank, min/max aggregate_mark.

### 5.3 CLI

```bash
# Staging dry-run printout (optional flag)
node scripts/import-keam-rank-list.mjs --env staging --in scripts/data/keam-rank-list-2025.json --year 2025

# Production (only run after user confirms)
node scripts/import-keam-rank-list.mjs --env prod --in scripts/data/keam-rank-list-2025.json --year 2025
```

## 6. Files touched

**New files:**
- `scripts/parse-keam-rank-list.mjs` — PDF → JSON parser
- `scripts/import-keam-rank-list.mjs` — JSON → Supabase importer
- `scripts/data/keam-rank-list-2025.json` — parsed output (committed)

**Modified files:**
- `scripts/package.json` and `scripts/package-lock.json` — adds `pdf-parse` dependency
- `.gitignore` — ensure `apps/app/Docs/Counselling_datas/**/*.pdf` is ignored (user-provided source materials, not redistributable)

**Not modified:**
- `rank_list_entries` schema (data-only)
- Any app code, query files, types
- The existing `keam_predictor.ts` reference file (not active in app yet)
- The `TNEA_BARCH` rank list rows (different counseling_system_id)

## 7. Verification

After staging import, run via `mcp__supabase-staging__execute_sql`:

```sql
-- 7.1: Row count
SELECT COUNT(*) AS total
FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH')
  AND year = 2025;
-- Expected: 1791

-- 7.2: Rank range
SELECT MIN(rank), MAX(rank), COUNT(DISTINCT rank) AS unique_ranks
FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH')
  AND year = 2025;
-- Expected: MIN ~= 1, MAX <= 1791, unique_ranks = 1791 (no duplicate ranks per the unique index)

-- 7.3: Aggregate mark range
SELECT MIN(aggregate_mark), MAX(aggregate_mark), AVG(aggregate_mark)::numeric(6,2)
FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH')
  AND year = 2025;
-- Expected: MIN > 0, MAX <= 400, AVG sensible

-- 7.4: Spot check one known row
SELECT rank, application_number, entrance_exam_mark, hsc_aggregate_mark, aggregate_mark
FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH')
  AND year = 2025
  AND application_number = '1100234';
-- Expected (from PDF text extraction): rank=129, entrance=118.00, hsc=186.0000, aggregate=304.0000

-- 7.5: Existing TNEA rows not affected
SELECT COUNT(*) FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'TNEA_BARCH');
-- Expected: 1399 (unchanged from pre-import baseline)

-- 7.6: Community placeholder
SELECT DISTINCT community FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH');
-- Expected: ['OVERALL']
```

All six queries must pass before committing.

## 8. Rollout

1. Add `pdf-parse` to `scripts/package.json` and `pnpm install` in `scripts/`.
2. Write parser. Run locally: `node scripts/parse-keam-rank-list.mjs --year 2025 --pdf … --out …`. Confirm output file has `row_count === 1791`.
3. Write importer.
4. Apply to **staging**: `node scripts/import-keam-rank-list.mjs --env staging …`.
5. Run all six verification queries on staging.
6. Commit (only the 4 new/modified files; not the unrelated uncommitted work).
7. On explicit user command, apply to **prod** with same command + `--env prod` and re-verify.

No web scraping, no Playwright tests (data-only ingest, no UI surface).

## 9. Risks / open questions

1. **`pdf-parse` library output structure.** I've inspected via `pdftotext`; `pdf-parse` should produce equivalent text in reading order. If it diverges materially (e.g., includes positional whitespace differently), the parser regex set will need adjustment. Mitigation: parser has a hard 1,791-row gate and aborts loudly on mismatch.
2. **PDF version variance.** This is the 2025 *Provisional* rank list dated 18-07-2025. KEAM may publish a *Final* rank list later that's slightly different (rank corrections after grievances). The script is designed for re-runs — a final-list ingest re-uses the same parser/importer with the new PDF, and upsert handles updates. Out-of-scope to handle automatically; user re-runs explicitly.
3. **Year-over-year format drift.** 2020–2024 PDFs may use a different layout. The parser hardcodes the 4-line group pattern from 2025; older years may need adjustments. Out-of-scope for this session; we handle as part of backfill session(s) with PDFs in hand.
4. **`community = 'OVERALL'` semantics.** New value not currently in any other row. UI that filters by community must be aware that KEAM uses 'OVERALL' as a meta-value. Acceptable since no UI consumes this data yet.
5. **PDF placement in repo.** `apps/app/Docs/Counselling_datas/KEAM/` is currently not gitignored. The 162 KB PDF should not be committed (user-provided reference material, not part of source). Spec adds an explicit `.gitignore` entry.
6. **The `keam_cutoffs` table referenced by `keam_predictor.ts` does not exist.** Out of scope for this session — building it is the next session's work, requires the Phase 1 Allotment PDF.

## 10. Out-of-scope follow-ups (deliberately deferred)

- **Phase 0a (next session):** Design + build `keam_cutoffs` table/view + ingestion from KEAM 2025 Phase 1 Allotment PDF → wires up the existing `keam_predictor.ts`. Needs the user to upload the allotment PDF.
- KEAM rank lists for 2020–2024.
- KEAM allotment lists for 2020–2024.
- Score-to-rank API route exposing the rank predictor.
- A `keam_rank_predictor.ts` reference implementation (peer of `keam_predictor.ts`).
- Extending the parser to handle KEAM *Final* rank lists when KEAM publishes them.
- Generalising the pattern to other counseling bodies (MAHACET, ACPC, etc.) that publish similar rank lists.

---

**End of spec.**
