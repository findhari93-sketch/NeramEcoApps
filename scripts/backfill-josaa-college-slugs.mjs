#!/usr/bin/env node
/**
 * Backfill josaa_institutes.college_slug by fuzzy-matching against the
 * `colleges` table.
 *
 * Strategy:
 *   1. Fetch all josaa_institutes rows.
 *   2. Fetch all B.Arch-offering colleges from `colleges`.
 *   3. For each institute, find the best slug match using normalized name + city.
 *   4. Dry-run prints proposed mapping. --apply writes UPDATEs.
 *
 * Orphans (no confident match) are written to
 *   scripts/data/josaa-orphan-institutes.json
 * for manual review.
 *
 * Usage:
 *   node backfill-josaa-college-slugs.mjs --env staging
 *   node backfill-josaa-college-slugs.mjs --env staging --apply
 *   node backfill-josaa-college-slugs.mjs --env prod    --apply
 *
 * Env vars (from apps/app/.env.local for staging, .env.production for prod):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { distance } from 'fastest-levenshtein';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const ORPHAN_PATH = path.join(DATA_DIR, 'josaa-orphan-institutes.json');

const MIN_CONFIDENT_SCORE = 0.78;

// Explicit overrides for cases where fuzzy matching is unreliable (e.g. BHU
// expansion inside parens, BIT Mesra long official name). Key = JoSAA name as
// it appears in josaa_institutes.name. Value = colleges.slug.
const EXPLICIT_OVERRIDES = {
  'Indian Institute of Technology (BHU) Varanasi': 'iit-bhu-architecture',
  'Birla Institute of Technology, Mesra, Ranchi': 'bit-mesra-architecture',
};

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { env: 'staging', apply: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env' && argv[i + 1]) { args.env = argv[++i]; }
    else if (a === '--apply') { args.apply = true; }
  }
  return args;
}

// ── Env loader (same shape as scripts/import-josaa-barch.mjs) ──────────────
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
  return { url, key };
}

// ── Normalization (mirrors scripts/import-nirf-architecture.mjs) ───────────
const NAME_REPLACEMENTS = [
  [/\bnit\b/gi, 'national institute of technology'],
  [/\biit\b/gi, 'indian institute of technology'],
  [/\biiest\b/gi, 'indian institute of engineering science and technology'],
  [/\bspa\b/gi, 'school of planning and architecture'],
  [/\bmnit\b/gi, 'malaviya national institute of technology'],
  [/\bmanit\b/gi, 'maulana azad national institute of technology'],
  [/\bvnit\b/gi, 'visvesvaraya national institute of technology'],
  [/\bbit\b/gi, 'birla institute of technology'],
  [/\bsmvdu\b/gi, 'shri mata vaishno devi university'],
  [/\biust\b/gi, 'islamic university of science and technology'],
  [/\btrichy\b/gi, 'tiruchirappalli'],
  [/\bbhu\b/gi, 'banaras hindu university'],
  [/\bbangalore\b/gi, 'bengaluru'],
  [/\bcalcutta\b/gi, 'kolkata'],
  [/\bbombay\b/gi, 'mumbai'],
  [/\bmadras\b/gi, 'chennai'],
  [/\btrivandrum\b/gi, 'thiruvananthapuram'],
  [/\bcalicut\b/gi, 'kozhikode'],
];

const NOISE_TOKENS = new Set([
  'department', 'of', 'and', 'the', 'school', 'planning', 'architecture',
  'faculty', 'institute', 'college', 'engineering', 'technology',
  'university', 'centre', 'center', 'design',
]);

function normalize(s) {
  if (!s) return '';
  let out = String(s).toLowerCase();
  for (const [re, rep] of NAME_REPLACEMENTS) out = out.replace(re, rep);
  out = out
    .replace(/&/g, 'and')
    .replace(/\([^)]*\)/g, ' ')      // drop parens like "(BHU)"
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out;
}

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
function bestMatch(institute, colleges) {
  const nInst = normalize(institute.name);
  const nState = normalize(institute.state || '');
  const tInst = tokenSet(nInst);

  let best = null;
  for (const c of colleges) {
    const nCollege = normalize(c.name);
    const tCollege = tokenSet(nCollege);
    const sameState = nState && c.state && nState === normalize(c.state);

    // 1. Exact normalized name match
    if (nInst === nCollege) {
      return { college: c, score: 1.0, reason: 'exact_name' };
    }

    // 2. Substring + same state
    const contains = nInst.includes(nCollege) || nCollege.includes(nInst);
    if (contains && sameState) {
      const s = 0.95;
      if (!best || s > best.score) best = { college: c, score: s, reason: 'substring_state' };
      continue;
    }

    // 3. Token jaccard + same state
    if (sameState) {
      const j = jaccard(tInst, tCollege);
      if (j >= 0.55) {
        const s = Number(j.toFixed(3));
        if (!best || s > best.score) best = { college: c, score: s, reason: 'tokens_state' };
        continue;
      }
    }

    // 4. Levenshtein on full names, with state
    if (sameState) {
      const d = distance(nInst, nCollege);
      const max = Math.max(nInst.length, nCollege.length);
      const sim = max > 0 ? 1 - d / max : 0;
      if (sim >= 0.78) {
        const s = Number(sim.toFixed(3));
        if (!best || s > best.score) best = { college: c, score: s, reason: 'lev_state' };
      }
    }

    // 5. High Levenshtein ignoring state (last resort)
    const d = distance(nInst, nCollege);
    const max = Math.max(nInst.length, nCollege.length);
    const sim = max > 0 ? 1 - d / max : 0;
    if (sim >= 0.9) {
      const s = Number(sim.toFixed(3));
      if (!best || s > best.score) best = { college: c, score: s, reason: 'lev_no_state' };
    }
  }
  return best;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  console.log(`Env: ${args.env} | Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);

  const { url, key } = loadSupabaseConfig(args.env);
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (...a) => fetch(...a) },
  });

  console.log('Fetching josaa_institutes ...');
  const { data: institutes, error: instErr } = await supabase
    .from('josaa_institutes')
    .select('id, name, short_name, state, college_slug')
    .order('id');
  if (instErr) throw new Error(`josaa_institutes fetch: ${instErr.message}`);
  console.log(`  ${institutes.length} institutes`);

  console.log('Fetching B.Arch-offering colleges ...');
  // courses_offered is a text array — filter by contains 'B.Arch'.
  const { data: colleges, error: colErr } = await supabase
    .from('colleges')
    .select('id, slug, name, state, state_slug, city, city_slug, courses_offered, is_active')
    .contains('courses_offered', ['B.Arch']);
  if (colErr) throw new Error(`colleges fetch: ${colErr.message}`);
  console.log(`  ${colleges.length} B.Arch colleges`);

  const matched = [];
  const orphans = [];
  const collegeBySlug = new Map(colleges.map((c) => [c.slug, c]));
  for (const inst of institutes) {
    // Explicit override first.
    const overrideSlug = EXPLICIT_OVERRIDES[inst.name];
    if (overrideSlug && collegeBySlug.has(overrideSlug)) {
      matched.push({
        josaa_id: inst.id,
        josaa_name: inst.name,
        josaa_short: inst.short_name,
        slug: overrideSlug,
        college_name: collegeBySlug.get(overrideSlug).name,
        score: 1.0,
        reason: 'override',
      });
      continue;
    }
    const m = bestMatch(inst, colleges);
    if (m && m.score >= MIN_CONFIDENT_SCORE) {
      matched.push({
        josaa_id: inst.id,
        josaa_name: inst.name,
        josaa_short: inst.short_name,
        slug: m.college.slug,
        college_name: m.college.name,
        score: m.score,
        reason: m.reason,
      });
    } else {
      orphans.push({
        josaa_id: inst.id,
        name: inst.name,
        short_name: inst.short_name,
        state: inst.state,
        best_candidate: m
          ? { slug: m.college.slug, name: m.college.name, score: m.score, reason: m.reason }
          : null,
      });
    }
  }

  console.log('\n── Matched ────────────────────────────────────────────');
  for (const m of matched) {
    const status = institutes.find((i) => i.id === m.josaa_id)?.college_slug === m.slug
      ? '(already set)'
      : '(NEW)';
    console.log(
      `  [${m.score.toFixed(2)} ${m.reason.padEnd(16)}] ${m.josaa_short.padEnd(20)} → ${m.slug} ${status}`,
    );
  }
  console.log(`  Matched: ${matched.length}/${institutes.length}`);

  console.log('\n── Orphans (need manual review) ───────────────────────');
  for (const o of orphans) {
    const hint = o.best_candidate
      ? `(best guess: ${o.best_candidate.slug} @ ${o.best_candidate.score.toFixed(2)} ${o.best_candidate.reason})`
      : '(no candidates)';
    console.log(`  ${o.short_name?.padEnd(20) || o.name.padEnd(40)} ${hint}`);
  }
  console.log(`  Orphans: ${orphans.length}/${institutes.length}`);

  // Write orphans file for follow-up.
  if (orphans.length > 0) {
    await writeFile(ORPHAN_PATH, JSON.stringify(orphans, null, 2), 'utf8');
    console.log(`\nWrote ${ORPHAN_PATH}`);
  }

  if (!args.apply) {
    console.log('\nDry-run complete. Re-run with --apply to write UPDATEs.');
    return;
  }

  console.log('\n── Applying UPDATEs ───────────────────────────────────');
  let applied = 0;
  for (const m of matched) {
    const { error } = await supabase
      .from('josaa_institutes')
      .update({ college_slug: m.slug })
      .eq('id', m.josaa_id);
    if (error) {
      console.error(`  FAIL  ${m.josaa_short}: ${error.message}`);
      continue;
    }
    applied++;
  }
  console.log(`\nApplied ${applied}/${matched.length} updates.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
