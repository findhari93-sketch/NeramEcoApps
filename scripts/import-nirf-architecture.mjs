#!/usr/bin/env node
/**
 * NIRF Architecture Rankings Matcher + Importer.
 *
 * Reads scraped JSON from scripts/data/nirf-architecture-all.json, fetches
 * the colleges table from Supabase, runs fuzzy matching, and writes:
 *   scripts/data/nirf-matched.json      — rows ready to upsert
 *   scripts/data/nirf-unmatched.csv     — rows for manual review
 *
 * Default is dry-run. Pass --apply to actually upsert into nirf_rankings.
 *
 * Usage:
 *   node import-nirf-architecture.mjs --env staging                # dry-run
 *   node import-nirf-architecture.mjs --env staging --apply        # upsert
 *   node import-nirf-architecture.mjs --env prod --apply
 *
 * Env vars (loaded from apps/marketing/.env.local by default):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { distance } from 'fastest-levenshtein';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { apply: false, env: 'staging', year: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--env' && argv[i + 1]) { args.env = argv[++i]; }
    else if (a === '--year' && argv[i + 1]) { args.year = parseInt(argv[++i], 10); }
  }
  return args;
}

// ── Env loader ─────────────────────────────────────────────────────────────
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
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
      : path.join(ROOT, 'apps', 'marketing', '.env.local');
  const e = loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      `Missing Supabase env. Looked in process.env and ${envFile}. ` +
        `Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.`,
    );
  }
  return { url, key, envFile };
}

// ── Normalization ──────────────────────────────────────────────────────────
const NAME_REPLACEMENTS = [
  // expand abbreviations
  [/\bnit\b/gi, 'national institute of technology'],
  [/\biit\b/gi, 'indian institute of technology'],
  [/\biiest\b/gi, 'indian institute of engineering science and technology'],
  [/\bspa\b/gi, 'school of planning and architecture'],
  [/\bcept\b/gi, 'centre for environmental planning and technology'],
  [/\bmahe\b/gi, 'manipal academy of higher education'],
  [/\baktu\b/gi, 'dr apj abdul kalam technical university'],
  [/\bgitam\b/gi, 'gandhi institute of technology and management'],
  // city aliases used inside names (Trichy and Tiruchirappalli are the same city)
  [/\btrichy\b/gi, 'tiruchirappalli'],
  [/\bbhu\b/gi, 'banaras hindu university'],
  // canonical city spellings
  [/\bbangalore\b/gi, 'bengaluru'],
  [/\bcalcutta\b/gi, 'kolkata'],
  [/\bbombay\b/gi, 'mumbai'],
  [/\bmadras\b/gi, 'chennai'],
  [/\btrivandrum\b/gi, 'thiruvananthapuram'],
  [/\bcalicut\b/gi, 'kozhikode'],
];

// City aliases for matching only (Shibpur is a neighborhood in Howrah, etc.)
const CITY_ALIASES = new Map([
  ['shibpur', 'howrah'],
  ['mahe', 'udupi'],
  ['kozhikode', 'kozhikode'],
]);
function normalizeCity(s) {
  const n = normalize(s);
  return CITY_ALIASES.get(n) || n;
}

const NOISE_TOKENS = new Set([
  'department', 'of', 'and', 'school', 'planning', 'architecture',
  'faculty', 'institute', 'college', 'engineering', 'technology',
  'university', 'department', 'centre', 'center', 'design',
]);

function normalize(s) {
  if (!s) return '';
  let out = String(s).toLowerCase();
  for (const [re, rep] of NAME_REPLACEMENTS) out = out.replace(re, rep);
  out = out
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out;
}

// "indian institute of technology roorkee" → set of meaningful tokens
function tokenSet(normalized) {
  return new Set(normalized.split(' ').filter((t) => t && !NOISE_TOKENS.has(t)));
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / new Set([...a, ...b]).size;
}

// ── Matching ───────────────────────────────────────────────────────────────
function matchScrapedRow(row, collegeIndex) {
  const nRow = normalize(row.source_name);
  const nCity = normalizeCity(row.source_city);
  const nState = normalize(row.source_state);
  const tRow = tokenSet(nRow);

  let best = null;

  for (const c of collegeIndex) {
    const sameCity = c.nCity && nCity && c.nCity === nCity;
    const sameState = c.nState && nState && c.nState === nState;

    // 1. Exact normalized name match
    if (c.nName === nRow || c.nShort === nRow) {
      return { college: c, score: 1.0, status: 'matched', reason: 'exact_name' };
    }

    // 2. Exact name with city match (substring either way)
    const containsName = c.nName.includes(nRow) || nRow.includes(c.nName);
    if (containsName && sameCity) {
      return { college: c, score: 0.99, status: 'matched', reason: 'name_substring_city' };
    }
    // Or substring without city when state matches and source is significantly long
    if (containsName && sameState && nRow.length >= 25) {
      const score = 0.95;
      if (!best || score > best.score) {
        best = { college: c, score, status: 'matched', reason: 'name_substring_state' };
      }
    }

    // 3. Levenshtein on full names, with shared city
    if (sameCity) {
      const d = distance(nRow, c.nName);
      const max = Math.max(nRow.length, c.nName.length);
      const sim = max > 0 ? 1 - d / max : 0;
      if (sim >= 0.85) {
        if (!best || sim > best.score) {
          best = { college: c, score: Number(sim.toFixed(3)), status: 'matched', reason: 'lev_city' };
        }
      }
    }

    // 4. Token jaccard with city = strong signal
    if (sameCity) {
      const jac = jaccard(tRow, c.tokens);
      if (jac >= 0.5) {
        if (!best || jac > best.score) {
          best = {
            college: c,
            score: Number(jac.toFixed(3)),
            status: jac >= 0.7 ? 'matched' : 'manual',
            reason: 'token_city',
          };
        }
      }
    }

    // 5. Token jaccard with same state
    if (sameState && !sameCity) {
      const jac = jaccard(tRow, c.tokens);
      if (jac >= 0.65) {
        if (!best || jac > best.score) {
          best = {
            college: c,
            score: Number(jac.toFixed(3)),
            status: jac >= 0.85 ? 'matched' : 'manual',
            reason: 'token_state',
          };
        }
      }
    }

    // 6. Last resort: high lev sim ignoring geo
    const d = distance(nRow, c.nName);
    const max = Math.max(nRow.length, c.nName.length);
    const sim = max > 0 ? 1 - d / max : 0;
    if (sim >= 0.9) {
      if (!best || sim > best.score) {
        best = { college: c, score: Number(sim.toFixed(3)), status: 'manual', reason: 'lev_no_geo' };
      }
    }
  }

  return best;
}

// ── CSV ────────────────────────────────────────────────────────────────────
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  console.log(`Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'} | Env: ${args.env}`);

  const allPath = path.join(DATA_DIR, 'nirf-architecture-all.json');
  if (!existsSync(allPath)) {
    throw new Error(`Missing ${allPath}. Run scrape-nirf-architecture.mjs first.`);
  }
  let scraped = JSON.parse(await readFile(allPath, 'utf8'));
  if (args.year) scraped = scraped.filter((r) => r.year === args.year);
  console.log(`Loaded ${scraped.length} scraped rows.`);

  const { url, key } = loadSupabaseConfig(args.env);
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (...a) => fetch(...a) },
  });

  console.log('Fetching colleges from Supabase ...');
  const { data: colleges, error } = await supabase
    .from('colleges')
    .select('id, slug, name, short_name, city, state, state_slug, type')
    .eq('is_active', true);
  if (error) throw new Error(`colleges fetch: ${error.message}`);
  console.log(`Loaded ${colleges.length} colleges.`);

  const collegeIndex = colleges.map((c) => {
    const nName = normalize(c.name);
    const nShort = normalize(c.short_name || '');
    return {
      ...c,
      nName,
      nShort,
      nCity: normalizeCity(c.city),
      nState: normalize(c.state),
      tokens: tokenSet(nName),
    };
  });

  const matched = [];
  const manual = [];
  const unmatched = [];

  for (const row of scraped) {
    const m = matchScrapedRow(row, collegeIndex);
    if (m && m.status === 'matched') {
      matched.push({ ...row, college_id: m.college.id, match_score: m.score, match_status: 'matched', match_reason: m.reason, college_name: m.college.name });
    } else if (m && m.status === 'manual') {
      manual.push({ ...row, college_id: m.college.id, match_score: m.score, match_status: 'manual', match_reason: m.reason, suggested_slug: m.college.slug, suggested_name: m.college.name });
    } else {
      unmatched.push({ ...row, college_id: null, match_score: null, match_status: 'unmatched', suggested_slug: null, suggested_name: null });
    }
  }

  console.log(`Match summary: matched=${matched.length}, manual=${manual.length}, unmatched=${unmatched.length}`);

  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    path.join(DATA_DIR, 'nirf-matched.json'),
    JSON.stringify([...matched, ...manual], null, 2),
    'utf8',
  );
  const csvHeaders = ['year', 'rank', 'source_name', 'source_city', 'source_state', 'score', 'suggested_slug', 'suggested_name', 'match_score', 'match_status', 'match_reason'];
  await writeFile(
    path.join(DATA_DIR, 'nirf-unmatched.csv'),
    toCsv([...manual, ...unmatched], csvHeaders),
    'utf8',
  );
  console.log(`Wrote nirf-matched.json and nirf-unmatched.csv to ${DATA_DIR}`);

  if (!args.apply) {
    console.log('\nDry run complete. Re-run with --apply to upsert into nirf_rankings.');
    return;
  }

  // Build upsert payloads for matched + manual (manual gets match_status='manual')
  const payloads = [
    ...matched.map((r) => buildPayload(r, 'matched')),
    ...manual.map((r) => buildPayload(r, 'manual')),
  ];

  // Idempotency: delete existing matched/manual rows for the years being
  // imported, then insert. Partial unique indexes are not usable as
  // ON CONFLICT targets in PostgREST.
  const years = Array.from(new Set(payloads.map((p) => p.year)));
  console.log(`Deleting existing matched/manual rows for years ${years.join(',')} ...`);
  const { error: delErr } = await supabase
    .from('nirf_rankings')
    .delete()
    .eq('category', 'architecture')
    .in('match_status', ['matched', 'manual'])
    .in('year', years);
  if (delErr) throw new Error(`delete: ${delErr.message}`);

  console.log(`Inserting ${payloads.length} rows into nirf_rankings ...`);
  const chunkSize = 100;
  let inserted = 0;
  for (let i = 0; i < payloads.length; i += chunkSize) {
    const chunk = payloads.slice(i, i + chunkSize);
    const { error: upErr } = await supabase
      .from('nirf_rankings')
      .insert(chunk);
    if (upErr) {
      console.error(`Chunk ${i}/${payloads.length} failed: ${upErr.message}`);
      throw upErr;
    }
    inserted += chunk.length;
    console.log(`  inserted ${inserted}/${payloads.length}`);
  }
  console.log('Done.');
}

function buildPayload(r, status) {
  return {
    college_id: r.college_id,
    category: 'architecture',
    year: r.year,
    rank: r.rank,
    rank_band: r.rank_band,
    score: r.score,
    tlr: r.tlr,
    rpc: r.rpc,
    go: r.go,
    oi: r.oi,
    pr: r.pr,
    source_name: r.source_name,
    source_city: r.source_city,
    source_state: r.source_state,
    source_url: r.source_url,
    match_status: status,
    match_score: r.match_score,
  };
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
