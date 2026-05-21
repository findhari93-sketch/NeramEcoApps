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
