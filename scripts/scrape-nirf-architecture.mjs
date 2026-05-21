#!/usr/bin/env node
/**
 * NIRF Architecture Rankings Scraper.
 *
 * Scrapes nirfindia.org Architecture rankings for a range of years and writes
 * one normalized JSON file per year into scripts/data/.
 *
 * Usage:
 *   node scrape-nirf-architecture.mjs                 # all years 2020-2025
 *   node scrape-nirf-architecture.mjs --year 2024     # one year
 *   node scrape-nirf-architecture.mjs --years 2022,2023,2024
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import pRetry from 'p-retry';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

const DEFAULT_YEARS = [2020, 2021, 2022, 2023, 2024, 2025];
const BASE_URL = (year) =>
  `https://www.nirfindia.org/Rankings/${year}/ArchitectureRanking.html`;

const USER_AGENT =
  'NeramBot/1.0 (+https://neramclasses.com; data ingest for public college rankings)';

const DELAY_BETWEEN_YEARS_MS = 1500;

function parseArgs(argv) {
  const args = { years: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--year' && argv[i + 1]) {
      args.years = [parseInt(argv[i + 1], 10)];
      i++;
    } else if (a === '--years' && argv[i + 1]) {
      args.years = argv[i + 1].split(',').map((s) => parseInt(s.trim(), 10));
      i++;
    }
  }
  return args;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchYearHtml(year) {
  const url = BASE_URL(year);
  return pRetry(
    async () => {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          err.name = 'AbortError';
        }
        throw err;
      }
      return res.text();
    },
    {
      retries: 3,
      minTimeout: 2000,
      factor: 2,
      onFailedAttempt: (e) => {
        console.warn(`  retry ${e.attemptNumber}/${e.retriesLeft + e.attemptNumber}: ${e.message}`);
      },
    },
  );
}

// Header keys we care about. Each pattern is checked against the trimmed
// header cell text in order; first match wins. Order matters because
// "name" is more permissive than "institute id".
const HEADER_MAP = [
  { key: 'institute_id', patterns: [/institute\s*id/i, /^id$/i] },
  { key: 'name', patterns: [/institute\s*name/i, /name of institute/i, /^name$/i] },
  { key: 'city', patterns: [/^city$/i] },
  { key: 'state', patterns: [/^state$/i] },
  { key: 'score', patterns: [/^score/i, /total\s*score/i] },
  { key: 'rank', patterns: [/^rank$/i, /\brank\b/i] },
];

function mapHeaders($, $headerRow) {
  const headerCells = $headerRow.children('th, td');
  const map = {};
  headerCells.each((idx, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    for (const def of HEADER_MAP) {
      if (def.patterns.some((re) => re.test(text))) {
        if (map[def.key] === undefined) map[def.key] = idx;
        break;
      }
    }
  });
  return map;
}

function parseNumeric(s) {
  if (!s) return null;
  const cleaned = String(s).trim().replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseRankCell(s) {
  if (!s) return { rank: null, rank_band: null };
  const trimmed = String(s).trim();
  // Bands like "26-50" or "51-100" in older years
  if (/^\d+\s*[-–]\s*\d+$/.test(trimmed)) {
    const m = trimmed.match(/^(\d+)/);
    return { rank: m ? parseInt(m[1], 10) : null, rank_band: trimmed };
  }
  const n = parseInt(trimmed.replace(/[^0-9]/g, ''), 10);
  return { rank: Number.isFinite(n) ? n : null, rank_band: null };
}

// Extract institute name from a cell. NIRF wraps the name plus a "More Details"
// link plus a hidden nested table inside one <td>. The clean name is the
// text node sibling of those child elements.
function extractName($, cell) {
  // Clone the cell, remove all element children (which carry the noise), then
  // read remaining text content.
  const $cell = $(cell).clone();
  $cell.children().remove();
  const name = $cell.text().trim().replace(/\s+/g, ' ');
  return name;
}

// Extract TLR/RPC/GO/OI/PR from the hidden nested table inside the name cell.
function extractMetrics($, cell) {
  const $cell = $(cell);
  const inner = $cell.find('table tbody tr').first();
  if (!inner.length) {
    return { tlr: null, rpc: null, go: null, oi: null, pr: null };
  }
  const values = inner
    .children('td')
    .map((_, td) => parseNumeric($(td).text()))
    .get();
  return {
    tlr: values[0] ?? null,
    rpc: values[1] ?? null,
    go: values[2] ?? null,
    oi: values[3] ?? null,
    pr: values[4] ?? null,
  };
}

function extractFromTable($, table, year, url) {
  const $table = $(table);
  // Header row lives in thead, or in the first tr if no thead.
  let $headerRow = $table.find('thead tr').first();
  if (!$headerRow.length) $headerRow = $table.find('tr').first();
  const headerMap = mapHeaders($, $headerRow);

  // Require at minimum: name + rank
  if (headerMap.name === undefined || headerMap.rank === undefined) {
    console.warn(`  header map incomplete:`, headerMap);
    return [];
  }

  const bodyRows = $table.find('tbody tr');
  const rows = bodyRows.length ? bodyRows : $table.find('tr').slice(1);

  const out = [];
  rows.each((_, tr) => {
    // Use direct child <td>s only so we don't descend into the hidden
    // metrics table inside the name cell.
    const cells = $(tr).children('td');
    if (cells.length === 0) return;
    const text = (i) => (i === undefined ? '' : $(cells[i]).text().trim());

    const nameCell = cells[headerMap.name];
    const name = nameCell ? extractName($, nameCell) : '';
    if (!name) return;

    const { rank, rank_band } = parseRankCell(text(headerMap.rank));
    if (!rank && !rank_band) return;

    const metrics = nameCell
      ? extractMetrics($, nameCell)
      : { tlr: null, rpc: null, go: null, oi: null, pr: null };

    out.push({
      year,
      rank,
      rank_band,
      source_name: name,
      source_city: text(headerMap.city) || null,
      source_state: text(headerMap.state) || null,
      score: parseNumeric(text(headerMap.score)),
      ...metrics,
      source_url: url,
    });
  });

  return out;
}

function findRankingTables($) {
  // NIRF has historically used these selectors. We try them in order.
  const candidates = [
    'table#tbl_overall',
    'table.overall',
    'table#tblmain',
    'table.table-bordered',
    'table',
  ];
  for (const sel of candidates) {
    const tables = $(sel);
    for (let i = 0; i < tables.length; i++) {
      const $t = $(tables[i]);
      const headerText = $t.find('tr').first().text().toLowerCase();
      if (
        headerText.includes('institute') &&
        (headerText.includes('rank') || headerText.includes('score'))
      ) {
        return $t;
      }
    }
  }
  return null;
}

async function scrapeYear(year) {
  const url = BASE_URL(year);
  console.log(`\n[${year}] GET ${url}`);
  const html = await fetchYearHtml(year);
  const $ = cheerio.load(html);

  const table = findRankingTables($);
  if (!table) {
    console.warn(`[${year}] no ranking table found in HTML (${html.length} bytes)`);
    return { year, url, rows: [], rawHtmlBytes: html.length };
  }

  const rows = extractFromTable($, table, year, url);
  console.log(`[${year}] parsed ${rows.length} rows`);
  return { year, url, rows };
}

async function main() {
  const args = parseArgs(process.argv);
  const years = args.years ?? DEFAULT_YEARS;

  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  const combined = [];
  for (const year of years) {
    try {
      const result = await scrapeYear(year);
      const outPath = path.join(DATA_DIR, `nirf-architecture-${year}.json`);
      await writeFile(outPath, JSON.stringify(result.rows, null, 2), 'utf8');
      console.log(`[${year}] wrote ${outPath} (${result.rows.length} rows)`);
      combined.push(...result.rows);
    } catch (err) {
      console.error(`[${year}] FAILED: ${err.message}`);
    }
    if (year !== years[years.length - 1]) {
      await sleep(DELAY_BETWEEN_YEARS_MS);
    }
  }

  const combinedPath = path.join(DATA_DIR, 'nirf-architecture-all.json');
  await writeFile(combinedPath, JSON.stringify(combined, null, 2), 'utf8');
  console.log(`\nWrote combined file: ${combinedPath} (${combined.length} rows)`);
  console.log(
    'Summary:',
    years.map((y) => `${y}=${combined.filter((r) => r.year === y).length}`).join(', '),
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
