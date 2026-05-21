#!/usr/bin/env node
/**
 * Dump KEAM allotments from Supabase into a combined JSON file.
 *
 * Produces the same shape as the user-shared keam_2025_arch_allotment_combined.json:
 *   { exam, course, phases: { phase_1: {...}, phase_2: {...} } }
 *
 * Reads from prod by default (this is reference data, public). Pass --env staging
 * to dump from staging instead.
 *
 * Usage:
 *   node scripts/dump-keam-allotments.mjs                     # dumps prod to default output
 *   node scripts/dump-keam-allotments.mjs --env staging       # dumps staging
 *   node scripts/dump-keam-allotments.mjs --year 2025 --out custom/path.json
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    env: 'prod',
    year: 2025,
    out: path.join(ROOT, 'apps', 'app', 'Docs', 'Counselling_datas', 'KEAM', 'keam_2025_arch_allotment_combined.json'),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env' && argv[i + 1]) args.env = argv[++i];
    else if (a === '--year' && argv[i + 1]) args.year = parseInt(argv[++i], 10);
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function loadSupabase(env) {
  const envFile = env === 'prod'
    ? path.join(ROOT, '.env.production')
    : path.join(ROOT, 'apps', 'app', '.env.local');
  const e = loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`Missing Supabase env in ${envFile}`);
  return { url, key, envFile };
}

const PHASE_META = {
  Phase1: { allotment: 'First Phase', status: 'Provisional', date: '29-07-2025' },
  Phase2: { allotment: 'Second Phase', status: 'Final', date: '09-08-2025' },
};

async function main() {
  const args = parseArgs(process.argv);
  const { url, key, envFile } = loadSupabase(args.env);
  console.log(`Env: ${args.env} (${envFile})`);
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Fetch college name map (small table, 27 rows)
  const { data: colleges, error: colErr } = await supabase
    .from('keam_colleges')
    .select('code, name');
  if (colErr) throw colErr;
  const collegeNameByCode = new Map((colleges || []).map((c) => [c.code, c.name]));

  // Fetch per-phase (Supabase REST has a default 1000-row cap; split keeps us safe).
  async function fetchPhase(phase) {
    const { data, error: e } = await supabase
      .from('keam_allotments')
      .select('phase, sl_no, appl_no, rank, college_code, seat_type, candidate_category, course')
      .eq('year', args.year)
      .eq('course', 'Architecture')
      .eq('phase', phase)
      .order('sl_no', { ascending: true })
      .range(0, 9999);
    if (e) throw e;
    return data || [];
  }

  const [p1Rows, p2Rows] = await Promise.all([fetchPhase('Phase1'), fetchPhase('Phase2')]);

  const phases = { phase_1: { ...PHASE_META.Phase1, total_records: 0, allotments: [] }, phase_2: { ...PHASE_META.Phase2, total_records: 0, allotments: [] } };

  function toEntry(r) {
    const fullName = collegeNameByCode.get(r.college_code) || '';
    const college_name = fullName ? `${r.college_code}- ${fullName}` : r.college_code;
    return {
      sl_no: r.sl_no,
      application_number: parseInt(r.appl_no, 10),
      rank: r.rank,
      ...(r.candidate_category ? { candidate_category: r.candidate_category } : {}),
      college_name,
      course_name: r.course,
      seat_type: r.seat_type,
    };
  }

  for (const r of p1Rows) phases.phase_1.allotments.push(toEntry(r));
  for (const r of p2Rows) phases.phase_2.allotments.push(toEntry(r));

  phases.phase_1.total_records = phases.phase_1.allotments.length;
  phases.phase_2.total_records = phases.phase_2.allotments.length;

  const out = {
    exam: 'KEAM 2025',
    course: 'Architecture',
    note: 'Phase 1 does not include candidate_category; Phase 2 includes candidate_category. Use rank + seat_type for predictor logic.',
    generated_at: new Date().toISOString(),
    generated_from_env: args.env,
    phases,
  };

  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(out, null, 2));
  console.log(`OK  Phase 1: ${phases.phase_1.total_records}, Phase 2: ${phases.phase_2.total_records}`);
  console.log(`OK  Wrote ${args.out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
