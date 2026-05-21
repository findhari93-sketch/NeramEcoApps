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

// pdf-parse emits each candidate row as a single concatenated string with
// no whitespace between columns. Observed formats in KEAM 2025 PDF:
//
//   1. Full row:        "<SlNo><ApplNo><NATA>.XX<Qual>.XXXX<Rank>"
//                       e.g. "11100234118.00186.0000129"
//
//   2. NATA-only row:   "<SlNo><ApplNo><NATA>.XX<Rank>"
//                       (10+3 diploma route candidates with no Qual mark)
//                       e.g. "1921114814148.00557"
//
//   3. Withheld row:    "<SlNo><ApplNo>--Withheld"
//                       (results withheld administratively — no rank)
//
//   4. Not Qualified:   "<SlNo><ApplNo>--Not Qualified"
//                       (failed eligibility — no rank)
//
// SlNo/ApplNo boundary is ambiguous (both are digit runs). A single regex
// with lazy quantifier picks the FIRST syntactic match — which can yield
// NATA > 200 (impossible). Fix: try all SlNo widths 1..4 and pick the one
// where NATA and Qual are within valid bounds [0, 200].

const WITHHELD_RE = /^(\d{1,4})(\d{7})--Withheld$/;
const NOT_QUALIFIED_RE = /^(\d{1,4})(\d{7})--Not Qualified$/;

// Try a fixed-width SlNo split. Returns parsed row or null.
function tryFullRow(line, slWidth) {
  const re = new RegExp(
    `^(\\d{${slWidth}})(\\d{7})(\\d{1,3}\\.\\d{2})(\\d{1,3}\\.\\d{4})(\\d{1,5})$`,
  );
  const m = line.match(re);
  if (!m) return null;
  const nata = parseFloat(m[3]);
  const qual = parseFloat(m[4]);
  if (nata > 200 || qual > 200) return null;
  const rank = parseInt(m[5], 10);
  if (rank < 1 || rank > 50000) return null;
  return {
    serial_number: parseInt(m[1], 10),
    application_number: m[2],
    entrance_exam_mark: nata,
    hsc_aggregate_mark: qual,
    aggregate_mark: parseFloat((nata + qual).toFixed(4)),
    rank,
  };
}

function tryNataOnlyRow(line, slWidth) {
  const re = new RegExp(
    `^(\\d{${slWidth}})(\\d{7})(\\d{1,3}\\.\\d{2})(\\d{1,5})$`,
  );
  const m = line.match(re);
  if (!m) return null;
  const nata = parseFloat(m[3]);
  if (nata > 200) return null;
  const rank = parseInt(m[4], 10);
  if (rank < 1 || rank > 50000) return null;
  return {
    serial_number: parseInt(m[1], 10),
    application_number: m[2],
    entrance_exam_mark: nata,
    hsc_aggregate_mark: 0,
    aggregate_mark: nata,
    rank,
  };
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
  let withheld = 0;
  let notQualified = 0;
  let unmatchedDigitStart = 0;

  for (const line of lines) {
    // Try full-row format across all SlNo widths.
    let row = null;
    for (let w = 1; w <= 4; w++) {
      row = tryFullRow(line, w);
      if (row) break;
    }
    if (row) {
      rows.push(row);
      continue;
    }
    // Try NATA-only format across all SlNo widths.
    for (let w = 1; w <= 4; w++) {
      row = tryNataOnlyRow(line, w);
      if (row) break;
    }
    if (row) {
      rows.push(row);
      continue;
    }
    if (WITHHELD_RE.test(line)) {
      withheld++;
      continue;
    }
    if (NOT_QUALIFIED_RE.test(line)) {
      notQualified++;
      continue;
    }
    // Track lines that start with digits but didn't match anything — flag if many.
    if (/^\d{4,}/.test(line)) unmatchedDigitStart++;
  }

  console.log(`Parser breakdown:`);
  console.log(`  Ranked rows emitted:  ${rows.length}`);
  console.log(`  Withheld (skipped):   ${withheld}`);
  console.log(`  Not Qualified (skip): ${notQualified}`);
  console.log(`  Unexpected unmatched: ${unmatchedDigitStart}`);
  const seen = rows.length + withheld + notQualified;
  console.log(`  Total candidates seen: ${seen}`);

  // Hard gates:
  //   1. Every candidate in the PDF must be accounted for (1791 total).
  //   2. We must emit a reasonable number of ranked rows (> 1500).
  //   3. No unexpected lines that look like data but didn't match any format.
  const EXPECTED_TOTAL = 1791;
  if (seen !== EXPECTED_TOTAL) {
    console.error(
      `Total seen=${seen}, expected ${EXPECTED_TOTAL}. Some candidates fell through all patterns.`,
    );
    process.exit(1);
  }
  if (rows.length < 1500) {
    console.error(`Only ${rows.length} ranked rows; expected > 1500.`);
    process.exit(1);
  }
  if (unmatchedDigitStart > 5) {
    console.error(
      `${unmatchedDigitStart} digit-starting lines didn't match any known format. Investigate.`,
    );
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
