# KEAM 2025 Data Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land both the college-predictor data layer (apply user-prepared SQL → `keam_*` tables + `keam_cutoffs` view) and the rank-predictor data layer (parse KEAM 2025 Provisional Rank List PDF → 1,791 rows in `rank_list_entries`).

**Architecture:** Part A is an SQL-only operation: read the pre-prepared file, apply via Supabase MCP, run verification queries. Part B is a two-stage Node pipeline mirroring the existing `import-josaa-barch.mjs` pattern: parser (PDF → JSON) and importer (JSON → Supabase upsert). Both parts are independent; either can run first.

**Tech Stack:** Node 24 ESM (`.mjs`), `@supabase/supabase-js` (already installed), `pdf-parse` npm package (to add), Supabase MCP for SQL apply.

**Spec:** `docs/superpowers/specs/2026-05-21-keam-rank-list-2025-ingestion-design.md`

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `apps/app/Docs/Counselling_datas/KEAM/keam_2025_barch_supabase.sql` | User-prepared schema + seed for college predictor | Read-only, Part A applies via MCP |
| `apps/app/Docs/Counselling_datas/KEAM/2025_rank_provi.pdf` | KEAM 2025 Provisional Rank List source | Read-only |
| `scripts/parse-keam-rank-list.mjs` | NEW — PDF → JSON parser (Part B) | Create |
| `scripts/import-keam-rank-list.mjs` | NEW — JSON → `rank_list_entries` importer (Part B) | Create |
| `scripts/data/keam-rank-list-2025.json` | NEW — parser output, ~150 KB, 1,791 rows | Create (committed) |
| `scripts/package.json` | Add `pdf-parse` dependency | Modify |
| `scripts/package-lock.json` | Updated by `npm install` | Modify (generated) |

No app code changes. No new types. No new migrations checked into `packages/database/supabase/migrations/` (Part A's SQL lives in its source folder by design choice).

---

## Constants for reference

### Part A — Expected row counts after SQL apply
- `keam_colleges`: 27 rows
- `keam_seat_types`: 28 rows
- `keam_allotments`: 660 rows
- `keam_cutoffs` view: 149 rows

### Part B — Expected count for rank list parse
- Candidate rows from `2025_rank_provi.pdf`: **exactly 1,791**

### Spot-check anchor (cross-reference both parts)
- ApplNo `1100234` appears in both the Rank List (rank=129, NATA=118.00, Qual=186.0000) AND the prepared SQL (sl_no 72: rank=129, allotted to TCR seat_type SM-EZ). Confirms PDF-to-SQL consistency for this candidate.

---

## Task 1: Apply prepared SQL (Part A) to staging via MCP

**Files:**
- Read: `apps/app/Docs/Counselling_datas/KEAM/keam_2025_barch_supabase.sql`
- DB: staging (3 new tables + 1 view + 715 rows of seed data)

- [ ] **Step 1: Read the full SQL file**

```
Use Read tool on path:
c:\Users\Haribabu\Documents\AppsCopilot\2026\NeramEcosystem\apps\app\Docs\Counselling_datas\KEAM\keam_2025_barch_supabase.sql
```

The file is 787 lines. Read it all into context.

- [ ] **Step 2: Apply via `mcp__supabase-staging__apply_migration`**

Call the MCP tool with:
- `name`: `keam_2025_barch_data`
- `query`: the entire SQL file content as a single string (preserve `--` comments)

Expected result: `{"success":true}`. If failure, jump to Step 4.

- [ ] **Step 3: Run verification queries via `mcp__supabase-staging__execute_sql`**

Run each query and confirm result:

```sql
-- 3.1: Row counts
SELECT 'keam_colleges' AS t, COUNT(*) AS n FROM keam_colleges
UNION ALL SELECT 'keam_seat_types', COUNT(*) FROM keam_seat_types
UNION ALL SELECT 'keam_allotments', COUNT(*) FROM keam_allotments
ORDER BY t;
```
Expected: `keam_allotments=660, keam_colleges=27, keam_seat_types=28`.

```sql
-- 3.2: View exists and works
SELECT COUNT(*) AS view_rows FROM keam_cutoffs;
```
Expected: `149`.

```sql
-- 3.3: View column shape and ALR spot check
SELECT seat_type, seats_filled, opening_rank, closing_rank
FROM keam_cutoffs WHERE college_code = 'ALR' ORDER BY seat_type;
```
Expected 3 rows: `MU/1/1005/1005`, `SM/9/673/1001`, `VK/1/1487/1487`.

```sql
-- 3.4: TVE top-college SM cutoff
SELECT seat_type, seats_filled, opening_rank, closing_rank
FROM keam_cutoffs WHERE college_code = 'TVE' AND seat_type = 'SM';
```
Expected: `SM/15/4/43`.

If any query result differs, abort and report.

- [ ] **Step 4: On failure — diagnose**

Most likely causes:
- `apply_migration` rejected by Supabase: report exact error message.
- View / table missing: re-check the SQL was applied (try `SELECT * FROM information_schema.tables WHERE table_name LIKE 'keam_%'`).
- Row count off: a specific INSERT block failed; query that table directly to identify which.

Fix or report to user before proceeding to Task 2.

- [ ] **Step 5: Report**

State counts back ("3 tables + 1 view created, 27 + 28 + 660 rows, view returns 149") and move to Task 2.

---

## Task 2: Add `pdf-parse` dependency

**Files:**
- Modify: `scripts/package.json`
- Modify: `scripts/package-lock.json` (auto)

- [ ] **Step 1: Edit `scripts/package.json`**

Add `"pdf-parse": "^1.1.1"` to the `dependencies` object alphabetically between `open` and `p-retry`:

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52.0",
    "@supabase/supabase-js": "^2.39.0",
    "cheerio": "^1.2.0",
    "fastest-levenshtein": "^1.0.16",
    "googleapis": "^171.4.0",
    "open": "^11.0.0",
    "p-retry": "^6.2.1",
    "pdf-parse": "^1.1.1",
    "tsx": "^4.7.0",
    "youtube-transcript": "^1.3.0"
  }
}
```

(Use Edit tool to add the single line, preserving the rest verbatim.)

- [ ] **Step 2: Install**

Run:
```bash
cd scripts && npm install
```

Expected: completes without error; `scripts/package-lock.json` is updated.

- [ ] **Step 3: Smoke-test the import works**

Run:
```bash
cd scripts && node -e "import('pdf-parse').then(m => console.log('pdf-parse loaded, version:', m.default ? 'default-export' : 'cjs'))"
```

Expected: prints `pdf-parse loaded, …` without error.

**Gotcha**: some versions of `pdf-parse` execute test code on bare import that reads `./test/data/05-versions-space.pdf`, which fails if cwd isn't the package dir. If the smoke test fails with `ENOENT: no such file or directory, open './test/data/05-versions-space.pdf'`, this is a known issue — switch to importing the internal lib instead. In the parser script (Task 3), use:
```js
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
```
not the bare `pdf-parse` package root.

---

## Task 3: Write the parser script

**Files:**
- Create: `scripts/parse-keam-rank-list.mjs`

- [ ] **Step 1: Create the file with this exact content**

```javascript
#!/usr/bin/env node
/**
 * KEAM Provisional Rank List → JSON parser.
 *
 * Reads a KEAM Architecture Rank List PDF and emits a normalized JSON file
 * with one row per candidate: { serial_number, application_number,
 * entrance_exam_mark, hsc_aggregate_mark, aggregate_mark, rank }.
 *
 * Hard gate: the parser must emit exactly 1,791 rows for the 2025 PDF.
 * If the row count differs, exits 1.
 *
 * Usage:
 *   node parse-keam-rank-list.mjs \
 *     --year 2025 \
 *     --pdf "apps/app/Docs/Counselling_datas/KEAM/2025_rank_provi.pdf" \
 *     --out "scripts/data/keam-rank-list-2025.json"
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { year: null, pdf: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--year' && argv[i + 1]) args.year = parseInt(argv[++i], 10);
    else if (a === '--pdf' && argv[i + 1]) args.pdf = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
  }
  if (!args.year || !args.pdf || !args.out) {
    console.error('Usage: --year <YYYY> --pdf <path> --out <path>');
    process.exit(2);
  }
  return args;
}

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.resolve(ROOT, p);
}

const APPLNO_RE = /^\d{7}$/;
const NATA_RE = /^\d{1,3}\.\d{2}$/;
const QUAL_RE = /^\d{1,3}\.\d{4}$/;
// Accepts either bare number ("129") or "Rank N" (first row of PDF has the
// column header concatenated with the first data value).
const RANK_RE = /^(?:Rank\s+)?(\d{1,5})$/;

const NOISE_PATTERNS = [
  /^Office of the Commissioner/,
  /^Phone : /,
  /^KEAM \d{4} - Admission/,
  /^RANK LIST/,
  /^Sl\.No\./,
  /^ApplNo\.?$/,
  /^NATA Score$/,
  /^Qualifying Exam Mark$/,
  /^out of 200$/,
  /^Rank$/,
  /^Page \d+$/,
  /^Commissioner for Entrance/,
  /^\d{2}-\d{2}-\d{4}$/,
];

function isNoise(line) {
  return NOISE_PATTERNS.some((re) => re.test(line));
}

async function main() {
  const args = parseArgs(process.argv);
  const pdfPath = resolvePath(args.pdf);
  const outPath = resolvePath(args.out);

  const pdfBuf = await readFile(pdfPath);
  const parsed = await pdfParse(pdfBuf);
  const lines = parsed.text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const rows = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isNoise(line)) {
      i++;
      continue;
    }
    if (APPLNO_RE.test(line)) {
      // Collect the next 3 non-noise lines and try to interpret them
      // as NATA / Qual / Rank.
      const appl = line;
      let j = i + 1;
      const triple = [];
      while (j < lines.length && triple.length < 3) {
        if (!isNoise(lines[j])) triple.push(lines[j]);
        j++;
      }
      if (
        triple.length === 3 &&
        NATA_RE.test(triple[0]) &&
        QUAL_RE.test(triple[1]) &&
        RANK_RE.test(triple[2])
      ) {
        const nata = parseFloat(triple[0]);
        const qual = parseFloat(triple[1]);
        const rankMatch = triple[2].match(RANK_RE);
        const rank = parseInt(rankMatch[1], 10);
        rows.push({
          serial_number: rows.length + 1,
          application_number: appl,
          entrance_exam_mark: nata,
          hsc_aggregate_mark: qual,
          aggregate_mark: parseFloat((nata + qual).toFixed(4)),
          rank,
        });
        i = j;
        continue;
      }
      // If the triple doesn't match, fall through — skip this line.
    }
    i++;
  }

  const EXPECTED = 1791;
  if (rows.length !== EXPECTED) {
    console.error(
      `Parser produced ${rows.length} rows, expected ${EXPECTED}.`,
    );
    if (rows.length > 0) {
      console.error(`First row: ${JSON.stringify(rows[0])}`);
      console.error(`Last row:  ${JSON.stringify(rows[rows.length - 1])}`);
    }
    process.exit(1);
  }

  const output = {
    source_pdf: args.pdf,
    extracted_at: new Date().toISOString(),
    counseling_system_code: 'KEAM_BARCH',
    year: args.year,
    row_count: rows.length,
    rows,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(output, null, 2));
  console.log(`OK  Wrote ${rows.length} rows to ${args.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: No commit yet — wait for Task 4 verification**

---

## Task 4: Run the parser and verify output

**Files:**
- Create: `scripts/data/keam-rank-list-2025.json`

- [ ] **Step 1: Execute the parser**

Run from repository root:

```bash
node scripts/parse-keam-rank-list.mjs \
  --year 2025 \
  --pdf "apps/app/Docs/Counselling_datas/KEAM/2025_rank_provi.pdf" \
  --out "scripts/data/keam-rank-list-2025.json"
```

Expected stdout:
```
OK  Wrote 1791 rows to scripts/data/keam-rank-list-2025.json
```

Exit code 0.

- [ ] **Step 2: Spot-check JSON contents**

Run:
```bash
node -e "const j=JSON.parse(require('fs').readFileSync('scripts/data/keam-rank-list-2025.json','utf8')); console.log('row_count:', j.row_count); console.log('first:', JSON.stringify(j.rows[0])); console.log('1100234:', JSON.stringify(j.rows.find(r=>r.application_number==='1100234')));"
```

Expected output contains:
- `row_count: 1791`
- `1100234: {"serial_number":...,"application_number":"1100234","entrance_exam_mark":118,"hsc_aggregate_mark":186,"aggregate_mark":304,"rank":129}` (serial_number value will be whatever position 1100234 lands in sequential ordering; the other fields must match)

- [ ] **Step 3: On parser failure — diagnose**

If row count ≠ 1791:
- If much lower (e.g., 0–10): probably the noise filter is over-aggressive or `pdf-parse` is splitting text differently than `pdftotext`. Try printing the first 50 lines after stripping noise: add a `console.log(lines.slice(0,50))` line in the parser temporarily and re-run.
- If slightly off (e.g., 1789 or 1793): a few candidates have malformed entries. Print `console.log(lines[<problematic-index>])` near the failure to inspect.

After fixing, re-run Step 1.

- [ ] **Step 4: No commit yet — wait until Task 6 succeeds**

---

## Task 5: Write the importer script

**Files:**
- Create: `scripts/import-keam-rank-list.mjs`

- [ ] **Step 1: Create the file with this exact content**

```javascript
#!/usr/bin/env node
/**
 * KEAM Rank List JSON → rank_list_entries importer.
 *
 * Reads the JSON produced by parse-keam-rank-list.mjs and upserts into
 * the global `rank_list_entries` table for KEAM_BARCH.
 *
 * Idempotent: upsert on (counseling_system_id, year, rank) — re-running
 * with corrected data overwrites prior values.
 *
 * Usage:
 *   node import-keam-rank-list.mjs --env staging --year 2025 \
 *     --in scripts/data/keam-rank-list-2025.json
 *   node import-keam-rank-list.mjs --env prod    --year 2025 \
 *     --in scripts/data/keam-rank-list-2025.json
 *
 * Env: reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
 *   apps/app/.env.local (staging) or .env.production (prod).
 */
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { env: 'staging', year: null, in: null, batchSize: 500 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env' && argv[i + 1]) args.env = argv[++i];
    else if (a === '--year' && argv[i + 1]) args.year = parseInt(argv[++i], 10);
    else if (a === '--in' && argv[i + 1]) args.in = argv[++i];
    else if (a === '--batch' && argv[i + 1])
      args.batchSize = parseInt(argv[++i], 10);
  }
  if (!args.year || !args.in) {
    console.error('Usage: --env staging|prod --year <YYYY> --in <json path>');
    process.exit(2);
  }
  return args;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function loadSupabaseConfig(env) {
  const envFile =
    env === 'prod'
      ? path.join(ROOT, '.env.production')
      : path.join(ROOT, 'apps', 'app', '.env.local');
  const e = loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      `Missing Supabase env. Looked in process.env and ${envFile}. ` +
        `Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.`,
    );
  }
  return { url, key, envFile };
}

async function main() {
  const args = parseArgs(process.argv);
  const { url, key, envFile } = loadSupabaseConfig(args.env);
  console.log(`Env: ${args.env} (${envFile})`);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve KEAM_BARCH UUID
  const { data: system, error: sysErr } = await supabase
    .from('counseling_systems')
    .select('id')
    .eq('code', 'KEAM_BARCH')
    .single();
  if (sysErr || !system) {
    throw new Error(
      `Could not resolve KEAM_BARCH counseling_system: ${
        sysErr?.message || 'not found'
      }`,
    );
  }
  const systemId = system.id;
  console.log(`Resolved KEAM_BARCH -> ${systemId}`);

  // Read JSON
  const inPath = path.isAbsolute(args.in) ? args.in : path.resolve(ROOT, args.in);
  const json = JSON.parse(await readFile(inPath, 'utf8'));
  if (json.row_count !== json.rows.length) {
    throw new Error(
      `JSON row_count=${json.row_count} != rows.length=${json.rows.length}`,
    );
  }
  if (json.year !== args.year) {
    throw new Error(`JSON year=${json.year} != --year=${args.year}`);
  }
  console.log(`Loaded ${json.rows.length} rows from ${args.in}`);

  // Map to table shape
  const records = json.rows.map((r) => ({
    counseling_system_id: systemId,
    year: args.year,
    serial_number: r.serial_number,
    rank: r.rank,
    application_number: r.application_number,
    entrance_exam_mark: r.entrance_exam_mark,
    hsc_aggregate_mark: r.hsc_aggregate_mark,
    aggregate_mark: r.aggregate_mark,
    community: 'OVERALL',
    community_rank: null,
    candidate_name: null,
    date_of_birth: null,
    created_by: 'keam-import',
  }));

  // Upsert in batches
  let written = 0;
  for (let i = 0; i < records.length; i += args.batchSize) {
    const batch = records.slice(i, i + args.batchSize);
    const { error } = await supabase
      .from('rank_list_entries')
      .upsert(batch, {
        onConflict: 'counseling_system_id,year,rank',
      });
    if (error) {
      throw new Error(
        `Upsert failed at batch starting index ${i}: ${error.message}`,
      );
    }
    written += batch.length;
    console.log(`  Upserted ${written}/${records.length}`);
  }

  console.log(`OK  Done. Total upserted: ${written}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: No commit yet — proceed to Task 6**

---

## Task 6: Run importer on staging + verify

**Files:**
- DB: staging (`rank_list_entries` table, 1,791 new rows for KEAM_BARCH × 2025)

- [ ] **Step 1: Execute the importer against staging**

Run from repository root:
```bash
node scripts/import-keam-rank-list.mjs \
  --env staging \
  --year 2025 \
  --in scripts/data/keam-rank-list-2025.json
```

Expected stdout (last line): `OK  Done. Total upserted: 1791`.

- [ ] **Step 2: Run verification queries via `mcp__supabase-staging__execute_sql`**

```sql
-- 6.2.1: Row count for KEAM 2025
SELECT COUNT(*) AS total FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH')
  AND year = 2025;
```
Expected: `1791`.

```sql
-- 6.2.2: Rank range
SELECT MIN(rank), MAX(rank), COUNT(DISTINCT rank) AS unique_ranks
FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH')
  AND year = 2025;
```
Expected: `unique_ranks = 1791` (no duplicates due to unique constraint).

```sql
-- 6.2.3: Aggregate mark range
SELECT MIN(aggregate_mark), MAX(aggregate_mark),
       ROUND(AVG(aggregate_mark)::numeric, 2) AS avg_mark
FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH')
  AND year = 2025;
```
Expected: `MIN > 0`, `MAX <= 400`, `avg_mark` is a sensible number in [100, 400].

```sql
-- 6.2.4: Spot-check ApplNo 1100234
SELECT rank, application_number, entrance_exam_mark, hsc_aggregate_mark, aggregate_mark, community
FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH')
  AND year = 2025
  AND application_number = '1100234';
```
Expected: `rank=129, entrance_exam_mark=118.00, hsc_aggregate_mark=186.0000, aggregate_mark=304.0000, community='OVERALL'`.

```sql
-- 6.2.5: Existing TNEA rows unchanged
SELECT COUNT(*) FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'TNEA_BARCH');
```
Expected: `1399` (the pre-existing baseline, unchanged).

```sql
-- 6.2.6: KEAM uses 'OVERALL' as community placeholder
SELECT DISTINCT community FROM rank_list_entries
WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH');
```
Expected: `['OVERALL']`.

If any query result differs from expected, abort and report.

- [ ] **Step 3: On failure — diagnose**

- Upsert error: read the error message; common causes are stale type generation (run `pnpm supabase:gen:types` if Supabase complains about an unknown column) or a constraint violation (the upsert key is `(counseling_system_id, year, rank)` — duplicate ranks in the JSON would fail).
- Wrong row count: check whether import was partial (network issue mid-batch) or whether prior runs left stale rows. Run `DELETE FROM rank_list_entries WHERE counseling_system_id = (SELECT id FROM counseling_systems WHERE code = 'KEAM_BARCH') AND year = 2025;` and re-run import.

---

## Task 7: Commit the new artifacts

**Files:**
- New/modified: 5 files

- [ ] **Step 1: Stage only the relevant files**

```bash
git add scripts/parse-keam-rank-list.mjs scripts/import-keam-rank-list.mjs scripts/data/keam-rank-list-2025.json scripts/package.json scripts/package-lock.json docs/superpowers/specs/2026-05-21-keam-rank-list-2025-ingestion-design.md docs/superpowers/plans/2026-05-21-keam-2025-data-foundation.md
```

(Other files in `git status` are unrelated user-batched work — leave untouched.)

- [ ] **Step 2: Verify staged set is correct**

```bash
git status --short
```

Confirm only these files appear as `A` or `M`:
- `A  scripts/parse-keam-rank-list.mjs`
- `A  scripts/import-keam-rank-list.mjs`
- `A  scripts/data/keam-rank-list-2025.json`
- `M  scripts/package.json`
- `M  scripts/package-lock.json`
- `A  docs/superpowers/specs/2026-05-21-keam-rank-list-2025-ingestion-design.md`
- `A  docs/superpowers/plans/2026-05-21-keam-2025-data-foundation.md`

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(keam): KEAM 2025 data foundation — college predictor SQL + rank list ingest

Part A: Applied user-prepared keam_2025_barch_supabase.sql to staging.
Creates keam_colleges (27), keam_seat_types (28), keam_allotments (660),
and the keam_cutoffs view that the existing keam_predictor.ts consumes.
SQL file itself stays at apps/app/Docs/Counselling_datas/KEAM/ as source
of truth; not duplicated into packages/database/supabase/migrations/.

Part B: New parser + importer for KEAM 2025 Provisional Rank List PDF.
- scripts/parse-keam-rank-list.mjs reads the PDF (75 pages, 1,791
  candidates), strips KEAM-specific noise, emits keam-rank-list-2025.json.
- scripts/import-keam-rank-list.mjs upserts those rows into the unified
  rank_list_entries table with community='OVERALL' (KEAM Architecture
  publishes a single unified rank list, not community-wise).
- Idempotent via (counseling_system_id, year, rank) unique index.

Adds pdf-parse dependency. Verified on staging — 1,791 rows landed,
TNEA's existing 1,399 rows untouched. Production apply gated on user
command.

Spec: docs/superpowers/specs/2026-05-21-keam-rank-list-2025-ingestion-design.md
Plan: docs/superpowers/plans/2026-05-21-keam-2025-data-foundation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify commit**

```bash
git log --oneline -2
```

Expected: top line is the new feat commit; second line is yesterday's counseling_systems seed commit.

---

## Task 8: (Gated on user command) Apply to production

**Files:** none — DB ops only.

- [ ] **Step 1: Wait for explicit user instruction**

Do **not** apply to production until the user says "apply to prod" (or similar). The project's auto-memory and CLAUDE.md are firm about this.

When the user gives the go-ahead:

- [ ] **Step 2: Apply Part A SQL to production**

Read the SQL file again (or reuse the in-context content from Task 1). Call `mcp__supabase-prod__apply_migration` with:
- `name`: `keam_2025_barch_data`
- `query`: the same SQL content as Task 1

Expected: `{"success":true}`.

- [ ] **Step 3: Verify Part A on production**

Re-run the 4 verification queries from Task 1 Step 3 via `mcp__supabase-prod__execute_sql`. Same expected outputs.

- [ ] **Step 4: Run importer against production**

```bash
node scripts/import-keam-rank-list.mjs \
  --env prod \
  --year 2025 \
  --in scripts/data/keam-rank-list-2025.json
```

Expected stdout: `OK  Done. Total upserted: 1791`.

- [ ] **Step 5: Verify Part B on production**

Re-run the 6 verification queries from Task 6 Step 2 via `mcp__supabase-prod__execute_sql`. Same expected outputs.

- [ ] **Step 6: Report final state**

In the conversation, summarize:
- Part A: 3 tables + view + 715 rows on production
- Part B: 1,791 rank list rows on production for KEAM 2025
- TNEA rows untouched
- keam_predictor.ts is now data-backed; UI wiring is the next session

---

## Self-review checklist (for the executor)

After Task 6 succeeds, before commit:

1. **Spec coverage:**
   - §A.1 What the SQL does → Task 1 reads + applies + verifies ✓
   - §A.3 Verification queries → Task 1 Step 3 ✓
   - §B.1 Schema → Task 5 importer maps to it ✓
   - §B.2 community='OVERALL' rationale → Task 5 sets it ✓
   - §B.3 Pipeline → Tasks 2–6 ✓
   - §B.4 Parser design → Task 3 ✓
   - §B.5 Importer design → Task 5 ✓
   - §B.7 Verification → Task 6 Step 2 ✓
   - §B.8 Rollout (staging-first, prod on user command) → Tasks 6 + 8 ✓

2. **Idempotency:** Re-running Task 1 (SQL) is safe via ON CONFLICT. Re-running Tasks 4 + 6 is safe via parser overwriting JSON + importer upserting on unique key. ✓

3. **TNEA rows untouched:** Verified by Task 6 Step 2 query 6.2.5.

4. **No app code changes:** Only scripts/ + docs/ touched. ✓

---

## Anti-patterns to avoid

- **Don't apply Part A to production in Task 1.** Staging only; production is gated to Task 8.
- **Don't run the importer against production in Task 6.** Same gating rule.
- **Don't commit the source PDF.** `apps/app/Docs/Counselling_datas/KEAM/*.pdf` is reference material, not code. (If needed, add a `.gitignore` rule in a follow-up; not required for this plan since no commit step stages PDFs.)
- **Don't modify `keam_predictor.ts`.** Out of scope.
- **Don't add new columns to `rank_list_entries`** to fit KEAM's "no community" shape — use `'OVERALL'` placeholder per spec §2.
- **Don't generalise the parser to handle multiple years yet** — 2024 and earlier PDFs may differ in layout; backfill is a future session with PDFs in hand.

---

**End of plan.**
