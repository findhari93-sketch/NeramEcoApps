#!/usr/bin/env node
/**
 * JoSAA B.Arch + B.Plan rank importer.
 *
 * Reads all JoSAA JSON files from
 *   apps/app/Docs/Counselling_datas/JOSAA/JoSAA_Architecture_*.json
 * (or any single file via --file, or a CSV via --csv) and loads them
 * into josaa_institutes / josaa_programs / josaa_or_cr.
 *
 * JSON shape (per record):
 *   { year, round, institute, academic_program, quota, seat_type, gender,
 *     opening_rank, closing_rank }
 *   Records may live at the root array OR under a `records` key alongside
 *   a `metadata` block.
 *
 * CSV header (legacy):
 *   year,round_no,institute_type,institute,program,quota,seat_type,gender,opening_rank,closing_rank
 *
 * `institute_type` is auto-derived from the institute name when not present
 * (NIT / IIT / IIIT / SPA / GFTI).
 *
 * After the fact-table import, applies metadata backfill from
 *   scripts/data/josaa-institutes-metadata.json
 * per short_name.
 *
 * Idempotent: re-running upserts on the natural unique key.
 *
 * Usage:
 *   node import-josaa-barch.mjs --env staging
 *   node import-josaa-barch.mjs --env prod
 *   node import-josaa-barch.mjs --env staging --file /custom/path.json
 *   node import-josaa-barch.mjs --env staging --csv /custom/path.csv
 *   node import-josaa-barch.mjs --env staging --skip-backfill
 *
 * Env vars (loaded from apps/app/.env.local for staging, .env.production for prod):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const JOSAA_JSON_DIR = path.join(ROOT, 'apps', 'app', 'Docs', 'Counselling_datas', 'JOSAA');
const DEFAULT_CSV = path.join(DATA_DIR, 'josaa-rank-data.csv');
const METADATA_PATH = path.join(DATA_DIR, 'josaa-institutes-metadata.json');

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { env: 'staging', csv: null, file: null, skipBackfill: false, batchSize: 1000 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env' && argv[i + 1]) { args.env = argv[++i]; }
    else if (a === '--csv' && argv[i + 1]) { args.csv = argv[++i]; }
    else if (a === '--file' && argv[i + 1]) { args.file = argv[++i]; }
    else if (a === '--skip-backfill') { args.skipBackfill = true; }
    else if (a === '--batch' && argv[i + 1]) { args.batchSize = parseInt(argv[++i], 10); }
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
      : path.join(ROOT, 'apps', 'app', '.env.local');
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

// ── CSV parser (RFC 4180-ish, handles quoted fields with commas/newlines) ──
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    for (let i = 0; i < headers.length; i++) o[headers[i]] = (r[i] ?? '').trim();
    return o;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
// JoSAA writes preparatory ranks as "1234P". Return [int|null, isPrep].
function rankToInt(raw) {
  const s = (raw || '').trim();
  if (!s) return [null, false];
  const isP = s.endsWith('P');
  const digits = s.replace(/\D/g, '');
  return [digits ? parseInt(digits, 10) : null, isP];
}

// Map full official institute name → short name for display.
// JoSAA writes commas inconsistently across years; include both variants where
// they actually appear in 2023-2025 archive data.
const SHORT_NAME_OVERRIDES = {
  // NITs
  'National Institute of Technology, Tiruchirappalli': 'NIT Trichy',
  'National Institute of Technology Tiruchirappalli': 'NIT Trichy',
  'National Institute of Technology Calicut': 'NIT Calicut',
  'National Institute of Technology Hamirpur': 'NIT Hamirpur',
  'National Institute of Technology, Hamirpur': 'NIT Hamirpur',
  'National Institute of Technology Patna': 'NIT Patna',
  'National Institute of Technology Raipur': 'NIT Raipur',
  'National Institute of Technology, Rourkela': 'NIT Rourkela',
  'National Institute of Technology, Srinagar': 'NIT Srinagar',
  'National Institute of Technology, Kurukshetra': 'NIT Kurukshetra',
  'Malaviya National Institute of Technology Jaipur': 'MNIT Jaipur',
  'Maulana Azad National Institute of Technology Bhopal': 'MANIT Bhopal',
  'Visvesvaraya National Institute of Technology, Nagpur': 'VNIT Nagpur',
  // IITs
  'Indian Institute of Technology Kharagpur': 'IIT Kharagpur',
  'Indian Institute of Technology Roorkee': 'IIT Roorkee',
  'Indian Institute of Technology (BHU) Varanasi': 'IIT BHU',
  // GFTIs
  'Indian Institute of Engineering Science and Technology, Shibpur': 'IIEST Shibpur',
  'Birla Institute of Technology, Mesra, Ranchi': 'BIT Mesra',
  'Mizoram University, Aizawl': 'Mizoram University',
  'Shri Mata Vaishno Devi University, Katra, Jammu & Kashmir': 'SMVDU',
  'Islamic University of Science and Technology Kashmir': 'IUST Kashmir',
  // SPAs
  'School of Planning & Architecture, New Delhi': 'SPA Delhi',
  'School of Planning & Architecture, Bhopal': 'SPA Bhopal',
  'School of Planning & Architecture: Vijayawada': 'SPA Vijayawada',
};

function shortNameFor(fullName) {
  return SHORT_NAME_OVERRIDES[fullName] || fullName;
}

function programShort(name) {
  const n = name.toLowerCase();
  if (n.includes('planning')) return 'B.Plan';
  if (n.includes('architecture') || n.includes('b.arch')) return 'B.Arch';
  return name.slice(0, 30);
}

// JoSAA's institute_type column can be e.g. "NIT" or "NIT+" or with trailing
// whitespace. Take the first whitespace-separated token, uppercase.
function normalizeInstituteType(raw) {
  const s = (raw || '').trim().split(/\s+/)[0].toUpperCase();
  if (['NIT', 'IIT', 'IIIT', 'SPA', 'GFTI'].includes(s)) return s;
  return s || 'NIT';
}

// Derive institute_type from full name when the source CSV/JSON doesn't carry it.
function inferInstituteType(name) {
  const n = (name || '').toLowerCase();
  if (n.startsWith('indian institute of technology')) return 'IIT';
  if (n.includes('indian institute of engineering science and technology')) return 'GFTI';
  if (n.startsWith('national institute of technology') ||
      n.startsWith('malaviya national institute') ||
      n.startsWith('maulana azad national institute') ||
      n.startsWith('visvesvaraya national institute')) return 'NIT';
  if (n.startsWith('indian institute of information technology')) return 'IIIT';
  if (n.startsWith('school of planning')) return 'SPA';
  return 'GFTI';
}

// Map a raw record (from JSON or CSV) to the canonical shape the importer uses.
// Handles aliases:
//   round / Round / round_no
//   institute / Institute
//   academic_program / AcademicProgram / program
//   quota / Quota   seat_type / SeatType   gender / Gender
//   opening_rank / OpeningRank   closing_rank / ClosingRank
// `defaultYear` covers files where the year isn't carried per-record (only in filename).
function normalizeRecord(raw, defaultYear = null) {
  const pick = (...keys) => {
    for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) return raw[k];
    return '';
  };
  const institute = String(pick('institute', 'Institute')).trim();
  const program = String(pick('academic_program', 'AcademicProgram', 'program')).trim();
  const yearRaw = pick('year', 'Year');
  const yearNum = yearRaw === '' ? defaultYear : parseInt(yearRaw, 10);
  const roundNum = parseInt(pick('round_no', 'round', 'Round'), 10);
  return {
    year: Number.isFinite(yearNum) ? yearNum : null,
    round_no: Number.isFinite(roundNum) ? roundNum : null,
    institute,
    program,
    institute_type: raw.institute_type
      ? normalizeInstituteType(raw.institute_type)
      : inferInstituteType(institute),
    quota: String(pick('quota', 'Quota')).trim(),
    seat_type: String(pick('seat_type', 'SeatType')).trim(),
    gender: String(pick('gender', 'Gender')).trim(),
    opening_rank: pick('opening_rank', 'OpeningRank'),
    closing_rank: pick('closing_rank', 'ClosingRank'),
  };
}

// Extract a year from a JoSAA filename like "JoSAA_Architecture_AllRounds_2025.json".
function yearFromFilename(filePath) {
  const m = path.basename(filePath).match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

async function loadFromJsonFile(filePath) {
  const text = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(text);
  const recs = Array.isArray(parsed)
    ? parsed
    : (parsed && Array.isArray(parsed.records) ? parsed.records : null);
  if (!recs) {
    throw new Error(`Unrecognized JSON shape in ${filePath} — expected an array or { records: [...] }`);
  }
  return { records: recs, defaultYear: yearFromFilename(filePath) };
}

async function resolveSource(args) {
  // Priority: explicit --file or --csv, then default JOSAA folder, then default CSV path.
  if (args.file) {
    if (!existsSync(args.file)) throw new Error(`Missing --file: ${args.file}`);
    return { kind: 'json-list', files: [args.file] };
  }
  if (args.csv) {
    if (!existsSync(args.csv)) throw new Error(`Missing --csv: ${args.csv}`);
    return { kind: 'csv', path: args.csv };
  }
  if (existsSync(JOSAA_JSON_DIR)) {
    const entries = await readdir(JOSAA_JSON_DIR);
    const files = entries
      .filter((f) => /^JoSAA_Architecture_.*\.json$/i.test(f))
      .map((f) => path.join(JOSAA_JSON_DIR, f))
      .sort();
    if (files.length) return { kind: 'json-list', files };
  }
  if (existsSync(DEFAULT_CSV)) return { kind: 'csv', path: DEFAULT_CSV };
  throw new Error(
    `No JoSAA source found. Tried:\n` +
      `  ${JOSAA_JSON_DIR} (JoSAA_Architecture_*.json)\n` +
      `  ${DEFAULT_CSV}\n` +
      `Or pass --file <json> or --csv <csv>.`,
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  console.log(`Env: ${args.env}`);

  const source = await resolveSource(args);
  let rows = [];
  if (source.kind === 'csv') {
    console.log(`Source: CSV ${source.path}`);
    const csvText = await readFile(source.path, 'utf8');
    rows = parseCsv(csvText).map((r) => normalizeRecord(r, null));
  } else {
    console.log(`Source: ${source.files.length} JSON file(s)`);
    for (const f of source.files) {
      const { records, defaultYear } = await loadFromJsonFile(f);
      console.log(`  ${path.basename(f)}: ${records.length.toLocaleString()} records (year fallback ${defaultYear ?? 'none'})`);
      for (const r of records) rows.push(normalizeRecord(r, defaultYear));
    }
  }
  console.log(`Total rows: ${rows.length.toLocaleString()}`);

  const { url, key } = loadSupabaseConfig(args.env);
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (...a) => fetch(...a) },
  });

  // ── Pass 1: institutes ────────────────────────────────────────────────
  const instituteMap = new Map(); // name → { short_name, institute_type }
  for (const r of rows) {
    const name = r.institute;
    if (!name || instituteMap.has(name)) continue;
    instituteMap.set(name, {
      name,
      short_name: shortNameFor(name),
      institute_type: r.institute_type,
    });
  }
  const institutePayload = Array.from(instituteMap.values());
  console.log(`Unique institutes: ${institutePayload.length}`);

  console.log('Upserting institutes ...');
  const { error: instErr } = await supabase
    .from('josaa_institutes')
    .upsert(institutePayload, { onConflict: 'name', ignoreDuplicates: false });
  if (instErr) throw new Error(`institutes upsert: ${instErr.message}`);

  const { data: instRows, error: instSelErr } = await supabase
    .from('josaa_institutes')
    .select('id, name');
  if (instSelErr) throw new Error(`institutes select: ${instSelErr.message}`);
  const instIdByName = new Map(instRows.map((r) => [r.name, r.id]));
  console.log(`Institutes in DB: ${instIdByName.size}`);

  // ── Pass 2: programs ──────────────────────────────────────────────────
  const programMap = new Map();
  for (const r of rows) {
    const name = r.program;
    if (!name || programMap.has(name)) continue;
    programMap.set(name, { name, short_name: programShort(name) });
  }
  const programPayload = Array.from(programMap.values());
  console.log(`Unique programs: ${programPayload.length}`);

  console.log('Upserting programs ...');
  const { error: progErr } = await supabase
    .from('josaa_programs')
    .upsert(programPayload, { onConflict: 'name', ignoreDuplicates: false });
  if (progErr) throw new Error(`programs upsert: ${progErr.message}`);

  const { data: progRows, error: progSelErr } = await supabase
    .from('josaa_programs')
    .select('id, name');
  if (progSelErr) throw new Error(`programs select: ${progSelErr.message}`);
  const progIdByName = new Map(progRows.map((r) => [r.name, r.id]));
  console.log(`Programs in DB: ${progIdByName.size}`);

  // ── Pass 3: facts ─────────────────────────────────────────────────────
  const facts = [];
  let skipped = 0;
  for (const r of rows) {
    if (!r.institute || !r.program) { skipped++; continue; }
    const institute_id = instIdByName.get(r.institute);
    const program_id = progIdByName.get(r.program);
    if (!institute_id || !program_id) { skipped++; continue; }
    if (!Number.isFinite(r.year) || !Number.isFinite(r.round_no)) { skipped++; continue; }

    const [opening_rank, opening_rank_p] = rankToInt(String(r.opening_rank));
    const [closing_rank, closing_rank_p] = rankToInt(String(r.closing_rank));

    facts.push({
      year: r.year,
      round_no: r.round_no,
      institute_id,
      program_id,
      quota: r.quota,
      seat_type: r.seat_type,
      gender: r.gender,
      opening_rank,
      closing_rank,
      opening_rank_p,
      closing_rank_p,
    });
  }
  console.log(`Staged ${facts.length.toLocaleString()} fact rows (skipped ${skipped}).`);

  console.log(`Upserting fact rows in batches of ${args.batchSize} ...`);
  const onConflict = 'year,round_no,institute_id,program_id,quota,seat_type,gender';
  let inserted = 0;
  for (let i = 0; i < facts.length; i += args.batchSize) {
    const chunk = facts.slice(i, i + args.batchSize);
    const { error } = await supabase
      .from('josaa_or_cr')
      .upsert(chunk, { onConflict, ignoreDuplicates: false });
    if (error) {
      console.error(`Chunk starting at ${i} failed: ${error.message}`);
      throw error;
    }
    inserted += chunk.length;
    console.log(`  ${inserted.toLocaleString()} / ${facts.length.toLocaleString()}`);
  }

  // ── Pass 4: metadata backfill ─────────────────────────────────────────
  if (args.skipBackfill) {
    console.log('Skipping metadata backfill (--skip-backfill).');
  } else if (!existsSync(METADATA_PATH)) {
    console.log(`No metadata file at ${METADATA_PATH}; skipping backfill.`);
  } else {
    console.log('Applying institute metadata backfill ...');
    const meta = JSON.parse(await readFile(METADATA_PATH, 'utf8'));
    const instByShort = new Map(instRows.map((r) => [SHORT_NAME_OVERRIDES[r.name] || r.name, r]));

    let updated = 0;
    const missing = [];
    for (const m of meta) {
      const row = instByShort.get(m.short_name);
      if (!row) { missing.push(m.short_name); continue; }
      const patch = {};
      if (m.short_name) patch.short_name = m.short_name;
      if (m.state !== undefined) patch.state = m.state;
      if (m.city !== undefined) patch.city = m.city;
      if (m.nirf_rank !== undefined) patch.nirf_rank = m.nirf_rank;
      if (m.is_nirf_top20 !== undefined) patch.is_nirf_top20 = m.is_nirf_top20;
      if (m.established !== undefined) patch.established = m.established;
      const { error } = await supabase
        .from('josaa_institutes')
        .update(patch)
        .eq('id', row.id);
      if (error) {
        console.error(`Backfill failed for ${m.short_name}: ${error.message}`);
        continue;
      }
      updated++;
    }
    console.log(`Backfill complete: updated ${updated}, missing in DB: ${missing.length}`);
    if (missing.length) {
      console.log(`  Missing short_names: ${missing.join(', ')}`);
    }
  }

  // ── Verify ────────────────────────────────────────────────────────────
  const { count: totalFacts } = await supabase
    .from('josaa_or_cr')
    .select('id', { count: 'exact', head: true });
  const { count: instCount } = await supabase
    .from('josaa_institutes')
    .select('id', { count: 'exact', head: true });
  const { count: progCount } = await supabase
    .from('josaa_programs')
    .select('id', { count: 'exact', head: true });
  console.log('---');
  console.log(`josaa_institutes : ${instCount}`);
  console.log(`josaa_programs   : ${progCount}`);
  console.log(`josaa_or_cr      : ${totalFacts}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
