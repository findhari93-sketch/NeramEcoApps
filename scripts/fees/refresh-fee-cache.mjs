#!/usr/bin/env node
/**
 * Bring every student's fee cache (student_profiles.total_fee, fee_paid, fee_due,
 * payment_status, next_payment_date) in line with the canonical rows.
 *
 * WHY THIS EXISTS. The cache drifted: old screens wrote it directly and never
 * wrote lead_profiles.final_fee, and nothing ever set next_payment_date. The
 * Financial Dashboard's revenue_by_year still reads the cache, so it should start
 * from correct numbers when the office fee form and Collections go live. After
 * that, every save through the office form keeps the cache right by itself.
 *
 * Canonical (see packages/database/src/utils/fee-plan.ts):
 *   lead_profiles.final_fee (agreed), paid payments (arrived),
 *   payment_installments (the second installment's date)
 *
 * It also reconciles installments to paid where payments already cover them.
 * Students with no fee on record are left alone and listed.
 *
 * USAGE (run with tsx, it imports the TypeScript helpers directly; tsx is not on
 * the root PATH, so call it from the pnpm store)
 *   node node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs scripts/fees/refresh-fee-cache.mjs --env staging
 *   ... --env prod
 *   ... --env prod --apply
 *
 * Dry run by default: it prints every student whose cache would change, with the
 * before and after, and writes nothing without --apply.
 *
 * Env, read from .env.production for prod (falling back to apps/nexus/.env.local,
 * which is STAGING): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// packages/database has no "type": "module", so tsx loads it as CommonJS and the
// named exports sit on the default export.
const feesModule = await import('../../packages/database/src/queries/office-fees.ts');
const { loadStudentFeeState, reconcileInstallments, refreshStudentFeeCache } =
  feesModule.loadStudentFeeState ? feesModule : feesModule.default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ENV = (() => {
  const i = args.indexOf('--env');
  return i >= 0 ? args[i + 1] : 'staging';
})();

function loadEnv() {
  const byEnv = {
    prod: ['.env.production'],
    production: ['.env.production'],
    staging: ['.env.staging', 'apps/nexus/.env.local'],
  };
  const out = {};
  for (const rel of [...(byEnv[ENV] || byEnv.staging), 'apps/nexus/.env.local']) {
    const file = path.join(ROOT, rel);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const key = line.slice(0, i).trim();
      if (out[key] === undefined) out[key] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
console.log(`Database: ${new URL(url).host}  (${ENV})  ${APPLY ? 'APPLYING' : 'dry run'}\n`);

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: profiles, error } = await supabase
  .from('student_profiles')
  .select('id, user_id, total_fee, fee_paid, fee_due, payment_status, next_payment_date');
if (error) throw error;

const near = (a, b) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 0.01;
let changed = 0;
const noFee = [];

for (const sp of profiles) {
  const state = await loadStudentFeeState(supabase, sp.user_id);
  const name = state.user?.name || sp.user_id;
  if (state.view.agreed === null) {
    noFee.push(name);
    continue;
  }
  const v = state.view;
  const next = {
    total_fee: v.agreed,
    fee_paid: v.paidTotal,
    fee_due: v.balance ?? 0,
    payment_status: (v.balance ?? 0) <= 0.01 ? 'paid' : 'pending',
    next_payment_date: v.nextDue?.dueDate ?? null,
  };
  const diff = Object.entries(next).filter(([k, val]) =>
    typeof val === 'number' ? !near(sp[k], val) : (sp[k] ?? null) !== val,
  );
  if (!diff.length) continue;
  changed += 1;
  console.log(`${name}`);
  for (const [k, val] of diff) console.log(`   ${k}: ${sp[k] ?? 'empty'}  ->  ${val ?? 'empty'}`);
  if (APPLY) {
    await reconcileInstallments(supabase, state);
    await refreshStudentFeeCache(supabase, await loadStudentFeeState(supabase, sp.user_id));
  }
}

console.log(`\n${profiles.length} students, ${changed} cache rows ${APPLY ? 'updated' : 'would change'}.`);
if (noFee.length) console.log(`${noFee.length} with no fee on record (left alone): ${noFee.join(', ')}`);
if (!APPLY && changed) console.log('\nNothing written. Re-run with --apply to write.');
