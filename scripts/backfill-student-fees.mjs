#!/usr/bin/env node
/**
 * Set the fees for students who were enrolled without an application form.
 *
 * WHY THIS EXISTS. Between 19 March and 31 August 2026, 38 active students were
 * created by staff without a direct enrolment link and without an application
 * form. On prod they hold no fee figure of any kind: no lead_profiles row, no
 * payment rows, no instalments. Their teachers are already teaching them. The
 * numbers exist only in the office's own records, so someone has to supply them
 * once, and this is the safe way to take them.
 *
 * It refuses to guess. Every row is matched, checked and shown to you before a
 * single rupee is written, and nothing is written at all without --apply.
 *
 * USAGE
 *   node scripts/backfill-student-fees.mjs --env prod --template fees.csv
 *   node scripts/backfill-student-fees.mjs --env prod --file fees.csv
 *   node scripts/backfill-student-fees.mjs --env prod --file fees.csv --apply
 *
 * --template writes a sheet with one row per student who has no fee on record,
 * already carrying their user id and name, and already filled in wherever the
 * database does know something (a direct enrolment link, for instance). Fill in
 * the blanks and hand it straight back to --file. Starting from the real ids is
 * what stops two students with similar names being confused for each other.
 *
 * Dry run by default. The dry run prints, per student, the exact before and
 * after for every field that would move, and lists every row it could not match
 * to a person. Fix those and re-run: it is safe to run as many times as you like
 * because an already-recorded payment is recognised and never counted twice.
 *
 * THE SPREADSHEET. Save as CSV with a header row. Only `student` is required;
 * every other column may be left blank, and a blank column is LEFT ALONE rather
 * than cleared, so a partly filled sheet cannot wipe a fee set elsewhere.
 *
 *   student            name, email, or the user id. The id is safest.
 *   assigned_fee       list price agreed
 *   discount_amount    reduction given
 *   final_fee          THE CONTRACTED TOTAL. Every balance derives from this.
 *   full_payment_discount
 *   allowed_payment_modes    full_only | full_and_installment
 *   payment_scheme           full | installment
 *   installment_1_amount
 *   installment_2_amount
 *   installment_2_due_days   defaults to 45
 *   payment_deadline         YYYY-MM-DD
 *   coupon_code
 *   collected          money already received, becomes a paid payment row
 *   collected_on       YYYY-MM-DD, when it was received
 *   collected_method   bank_transfer | upi_direct | cash | manual
 *   collected_ref      UTR or transaction reference
 *
 * Rupee formatting is tolerated: "45,000" and "Rs 45000" both read as 45000.
 *
 * Env, read from .env.production for prod (falling back to apps/nexus/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { setStudentFees, validateFees } from '../packages/database/src/queries/student-fees.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ENV = valueOf('--env') || 'staging';
const FILE = valueOf('--file');
const TEMPLATE = valueOf('--template');
const ADMIN_ID = valueOf('--admin') || null;

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

/**
 * apps/nexus/.env.local points at STAGING, so it is only ever the fallback.
 * Backfilling the wrong database with real money figures is the worst outcome
 * here, which is why the resolved host is printed before anything happens.
 */
function loadEnv() {
  const byEnv = {
    prod: ['.env.production'],
    production: ['.env.production'],
    staging: ['.env.staging', 'apps/nexus/.env.local'],
    local: ['apps/nexus/.env.local'],
  };
  const candidates = (byEnv[ENV] || byEnv.staging).map((f) => path.join(ROOT, f));
  const out = {};
  for (const file of [...candidates, path.join(ROOT, 'apps/nexus/.env.local')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const key = line.slice(0, i).trim();
      if (out[key] !== undefined) continue;
      out[key] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

// ─── CSV ────────────────────────────────────────────────────────────────────

/** Minimal RFC4180 reader: quoted fields, embedded commas, doubled quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function money(v) {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}
function text(v) {
  return v === undefined || String(v).trim() === '' ? undefined : String(v).trim();
}

/** Blank stays undefined (leave alone); a literal "-" means clear the field. */
function feesFromRow(r) {
  const f = {};
  for (const k of ['assigned_fee', 'discount_amount', 'final_fee', 'full_payment_discount',
                   'installment_1_amount', 'installment_2_amount', 'installment_2_due_days']) {
    if (r[k] === '-') { f[k] = null; continue; }
    const v = money(r[k]);
    if (v !== undefined) f[k] = v;
  }
  for (const k of ['allowed_payment_modes', 'payment_scheme', 'payment_deadline', 'coupon_code']) {
    if (r[k] === '-') { f[k] = null; continue; }
    const v = text(r[k]);
    if (v !== undefined) f[k] = v;
  }
  return f;
}

// ─── matching ───────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Match a spreadsheet row to one person, or to nobody.
 *
 * Never returns a guess. A name that matches two students is reported as
 * ambiguous and skipped, because writing a fee onto the wrong student is worse
 * than leaving a row for a human to resolve.
 */
function matchStudent(value, students) {
  const raw = String(value || '').trim();
  if (!raw) return { error: 'No student given.' };
  if (UUID.test(raw)) {
    const byId = students.find((s) => s.id.toLowerCase() === raw.toLowerCase());
    return byId ? { student: byId } : { error: `No student with id ${raw}.` };
  }
  if (raw.includes('@')) {
    const hit = students.filter((s) =>
      [s.email, s.personal_email, s.linked_classroom_email]
        .some((e) => e && e.toLowerCase() === raw.toLowerCase()));
    if (hit.length === 1) return { student: hit[0] };
    if (hit.length > 1) return { error: `${raw} matches ${hit.length} students.` };
    return { error: `No student with email ${raw}.` };
  }
  const n = norm(raw);
  let hit = students.filter((s) => norm(s.name) === n);
  if (hit.length === 1) return { student: hit[0] };
  if (hit.length > 1) return { error: `"${raw}" matches ${hit.length} students. Use the email or id.` };
  hit = students.filter((s) => norm(s.name).startsWith(n) || n.startsWith(norm(s.name)));
  if (hit.length === 1) return { student: hit[0], fuzzy: true };
  if (hit.length > 1) return { error: `"${raw}" partly matches ${hit.length} students. Use the email or id.` };
  return { error: `No student called "${raw}".` };
}

// ─── run ────────────────────────────────────────────────────────────────────

const rupees = (v) =>
  v === null || v === undefined ? '(empty)' : typeof v === 'number' ? v.toLocaleString('en-IN') : String(v);

const TEMPLATE_COLUMNS = [
  'student', 'student_name', 'assigned_fee', 'discount_amount', 'final_fee',
  'full_payment_discount', 'allowed_payment_modes', 'payment_scheme',
  'installment_1_amount', 'installment_2_amount', 'installment_2_due_days',
  'payment_deadline', 'coupon_code',
  'collected', 'collected_on', 'collected_method', 'collected_ref',
];

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  const needsQuoting = s.includes(',') || s.includes('"') || /[\r\n]/.test(s);
  return needsQuoting ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Write a sheet of everyone who needs a fee, pre-filled with whatever is known.
 *
 * "Needs a fee" means an active, non-graduated student with no final_fee on
 * record. Anyone already carrying a contracted total is left out, so re-running
 * this after a partial backfill gives you only what is still outstanding.
 */
async function writeTemplate(supabase, outPath) {
  const { data: students, error } = await supabase
    .from('users')
    .select('id, name, email, created_at, is_alumni, user_type')
    .eq('user_type', 'student')
    .or('is_alumni.is.null,is_alumni.eq.false')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const ids = students.map((s) => s.id);
  // Newest first, because a student can hold several application rows and
  // setStudentFees writes to the newest. Reading an older one here would list a
  // student as having no fee when their current record already carries one.
  const { data: leads, error: leadError } = await supabase
    .from('lead_profiles')
    .select('user_id, created_at, final_fee, assigned_fee, discount_amount')
    .in('user_id', ids)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (leadError) throw leadError;
  const leadBy = new Map();
  for (const l of leads || []) if (!leadBy.has(l.user_id)) leadBy.set(l.user_id, l);

  // Anything already known from a direct enrolment link: the admin typed these
  // figures once already, so asking for them a second time invites a mismatch.
  const { data: links, error: linkError } = await supabase
    .from('direct_enrollment_links')
    .select('used_by, student_name, student_email, total_fee, discount_amount, final_fee, amount_paid, payment_method, payment_date, transaction_reference');
  if (linkError) throw linkError;
  const linkBy = new Map();
  for (const l of links || []) if (l.used_by && !linkBy.has(l.used_by)) linkBy.set(l.used_by, l);

  const rows = [];
  let prefilled = 0;
  for (const st of students) {
    const lead = leadBy.get(st.id);
    if (lead && Number(lead.final_fee) > 0) continue; // already has a contracted total
    const link = linkBy.get(st.id);
    if (link) prefilled++;
    rows.push({
      student: st.id,
      student_name: st.name || st.email || '',
      assigned_fee: link ? link.total_fee : lead?.assigned_fee ?? '',
      discount_amount: link ? link.discount_amount : lead?.discount_amount ?? '',
      final_fee: link ? link.final_fee : '',
      full_payment_discount: '', allowed_payment_modes: '', payment_scheme: '',
      installment_1_amount: '', installment_2_amount: '', installment_2_due_days: '',
      payment_deadline: '', coupon_code: '',
      collected: link ? link.amount_paid : '',
      collected_on: link?.payment_date || '',
      collected_method: link?.payment_method || '',
      collected_ref: link?.transaction_reference || '',
    });
  }

  const csv = [
    TEMPLATE_COLUMNS.join(','),
    ...rows.map((r) => TEMPLATE_COLUMNS.map((c) => csvCell(r[c])).join(',')),
  ].join('\n');
  writeFileSync(outPath, csv, 'utf8');

  console.log(`  Wrote ${rows.length} student(s) to ${outPath}`);
  console.log(`  ${prefilled} already filled in from a direct enrolment link.`);
  console.log(`  ${rows.length - prefilled} need their figures typed in.`);
  console.log('');
  console.log('  The `student` column holds the user id. Do not edit it.');
  console.log('  Leave a cell blank to leave that value alone. Put a single - to clear it.');
  console.log('  Then: node scripts/backfill-student-fees.mjs --env ' + ENV + ' --file ' + outPath);
}

async function main() {
  if (TEMPLATE) {
    const env = loadEnv();
    for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
      if (!env[key]) { console.error(`Missing ${key}.`); process.exit(1); }
    }
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    console.log('');
    console.log('  Database : ' + env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('');
    const out = path.isAbsolute(TEMPLATE) ? TEMPLATE : path.join(ROOT, TEMPLATE);
    await writeTemplate(supabase, out);
    return;
  }
  if (!FILE) {
    console.error('Give me the spreadsheet: --file fees.csv (or --template fees.csv to start one)');
    process.exit(1);
  }
  const csvPath = path.isAbsolute(FILE) ? FILE : path.join(ROOT, FILE);
  if (!existsSync(csvPath)) {
    console.error(`No such file: ${csvPath}`);
    process.exit(1);
  }

  const env = loadEnv();
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[key]) { console.error(`Missing ${key}.`); process.exit(1); }
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log('');
  console.log('  Database : ' + env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('  Env flag : ' + ENV);
  console.log('  Spreadsheet: ' + csvPath);
  console.log('  Mode     : ' + (APPLY ? 'APPLY, this writes to the database' : 'dry run, nothing will be written'));
  console.log('');

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  if (!rows.length) { console.error('The spreadsheet has no rows.'); process.exit(1); }
  if (!('student' in rows[0])) {
    console.error('The spreadsheet needs a "student" column (name, email or user id).');
    process.exit(1);
  }

  const { data: students, error: studentsError } = await supabase
    .from('users')
    .select('id, name, email, personal_email, linked_classroom_email, is_alumni')
    .eq('user_type', 'student');
  if (studentsError) throw studentsError;

  const unmatched = [];
  const planned = [];

  for (const row of rows) {
    const m = matchStudent(row.student, students);
    if (m.error) { unmatched.push({ row: row.student, reason: m.error }); continue; }
    const fees = feesFromRow(row);
    if (Object.values(fees).some((v) => Number.isNaN(v))) {
      unmatched.push({ row: row.student, reason: 'A fee column is not a number.' });
      continue;
    }
    const amount = money(row.collected);
    const collected =
      amount !== undefined && !Number.isNaN(amount) && amount > 0
        ? { amount, paidAt: text(row.collected_on) || null,
            method: text(row.collected_method) || 'manual', reference: text(row.collected_ref) || null }
        : null;

    const check = validateFees(fees, collected);
    if (check.errors.length) {
      unmatched.push({ row: `${m.student.name}`, reason: check.errors.join(' ') });
      continue;
    }
    planned.push({ student: m.student, fees, collected, fuzzy: m.fuzzy });
  }

  // Preview every single one before anything is written.
  let willChange = 0;
  for (const p of planned) {
    const preview = await setStudentFees(
      { userId: p.student.id, fees: p.fees, collected: p.collected, adminId: ADMIN_ID, dryRun: true },
      supabase,
    );
    const moves = Object.entries(preview.changes);
    const newPayment = preview.payment && !preview.payment.id;
    if (!moves.length && !newPayment) {
      console.log(`  = ${p.student.name}: already as given, nothing to do`);
      continue;
    }
    willChange++;
    console.log(`  ${APPLY ? '*' : '~'} ${p.student.name}${p.fuzzy ? '  (matched by partial name, check this)' : ''}`);
    if (preview.createdLead) console.log('      creates an application record (source: manual)');
    for (const [field, { before, after }] of moves) {
      console.log(`      ${field.padEnd(24)} ${rupees(before)}  ->  ${rupees(after)}`);
    }
    if (newPayment) console.log(`      ${'collected'.padEnd(24)} records a paid payment of ${rupees(preview.payment.amount)}`);
    if (preview.payment && preview.payment.id) console.log(`      collected: ${preview.payment.reason}`);
    for (const w of preview.warnings) console.log(`      note: ${w}`);
  }

  if (unmatched.length) {
    console.log('');
    console.log(`  ${unmatched.length} row(s) NOT applied:`);
    for (const u of unmatched) console.log(`    - ${u.row || '(blank)'}: ${u.reason}`);
  }

  console.log('');
  console.log(`  ${rows.length} row(s) read, ${planned.length} matched, ${willChange} would change, ${unmatched.length} skipped.`);

  if (!APPLY) {
    console.log('');
    console.log('  Nothing was written. Re-run with --apply once the above looks right.');
    return;
  }

  console.log('');
  let ok = 0;
  const failed = [];
  for (const p of planned) {
    try {
      const res = await setStudentFees(
        { userId: p.student.id, fees: p.fees, collected: p.collected, adminId: ADMIN_ID },
        supabase,
      );
      if (res.applied) ok++;
    } catch (e) {
      failed.push({ name: p.student.name, message: e?.message || String(e) });
    }
  }
  console.log(`  Applied to ${ok} student(s).`);
  if (failed.length) {
    console.log(`  ${failed.length} failed:`);
    for (const f of failed) console.log(`    - ${f.name}: ${f.message}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
