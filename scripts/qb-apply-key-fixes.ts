/**
 * Apply double-checked answer-key corrections, then re-grade the tests that
 * used those questions. Approved by the founder on 2026-10-01 for the 57 keys
 * in docs/audits/qb-answer-key-corrections-verified-2026-10-01.md.
 *
 * Input: a JSON array of { question_id, old_key, new_key, explanation_brief?,
 * explanation_detailed? } (verified-key-changes.json). Every change was found
 * independently by two checks that named the same option.
 *
 * Three steps, each explicit:
 *   --keys              write correct_answer (+ any corrected explanation) and a
 *                       before/after row in nexus_qb_question_edits. A row is
 *                       only updated while its key is still old_key, so a
 *                       re-run, or a teacher's edit in between, is never undone.
 *   --regrade-preview   re-grade every test that uses a changed question,
 *                       writing nothing, and print what would move.
 *   --regrade-apply     the same re-grade, written, with nexus_test_regrades rows.
 *
 * Usage (from scripts/):
 *   npx tsx qb-apply-key-fixes.ts --env-file ../.env.production --input <file> --keys
 *   npx tsx qb-apply-key-fixes.ts --env-file ../.env.production --input <file> --regrade-preview
 *   npx tsx qb-apply-key-fixes.ts --env-file ../.env.production --input <file> --regrade-apply
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (n: string) => args.includes(`--${n}`);

const REASON = 'Answer key corrected after two independent checks agreed (2026-10-01)';

interface Change {
  question_id: string;
  old_key: string;
  new_key: string;
  explanation_brief?: string | null;
  explanation_detailed?: string | null;
}

function loadEnvFile(file: string) {
  for (const line of readFileSync(path.resolve(file), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

async function applyKeys(sb: SupabaseClient, changes: Change[]) {
  let changed = 0;
  let skipped = 0;
  for (const c of changes) {
    const { data: q, error } = await sb
      .from('nexus_qb_questions')
      .select('correct_answer, explanation_brief, explanation_detailed')
      .eq('id', c.question_id)
      .single();
    if (error) throw error;
    if (q.correct_answer !== c.old_key) {
      console.log(`  skip ${c.question_id}: key is now ${q.correct_answer}, expected ${c.old_key}`);
      skipped += 1;
      continue;
    }
    const patch: Record<string, unknown> = { correct_answer: c.new_key, updated_at: new Date().toISOString() };
    const before: Record<string, unknown> = { correct_answer: q.correct_answer };
    const after: Record<string, unknown> = { correct_answer: c.new_key };
    if (c.explanation_brief) {
      patch.explanation_brief = after.explanation_brief = c.explanation_brief;
      before.explanation_brief = q.explanation_brief;
    }
    if (c.explanation_detailed) {
      patch.explanation_detailed = after.explanation_detailed = c.explanation_detailed;
      before.explanation_detailed = q.explanation_detailed;
    }
    const { error: uErr, count } = await sb
      .from('nexus_qb_questions')
      .update(patch, { count: 'exact' })
      .eq('id', c.question_id)
      .eq('correct_answer', c.old_key);
    if (uErr) throw uErr;
    if (count !== 1) {
      console.log(`  skip ${c.question_id}: changed underneath`);
      skipped += 1;
      continue;
    }
    const { error: aErr } = await sb
      .from('nexus_qb_question_edits')
      .insert({ question_id: c.question_id, source: 'ai_review', before, after });
    if (aErr) console.error(`  audit row failed for ${c.question_id}: ${aErr.message}`);
    changed += 1;
  }
  console.log(`Keys changed: ${changed}, skipped: ${skipped}`);
}

async function regrade(sb: SupabaseClient, changes: Change[], dryRun: boolean) {
  const { data: tq, error } = await sb
    .from('nexus_test_questions')
    .select('test_id')
    .in('qb_question_id', changes.map((c) => c.question_id));
  if (error) throw error;
  const testIds = [...new Set((tq || []).map((r: { test_id: string }) => r.test_id))];
  // The app's own re-grade: draws, shuffles and the final_* axis handled there.
  const { regradeTestAttempts } = await import('../packages/database/src/queries/nexus/test-regrade');
  const total = { tests: 0, attempts: 0, changed: 0, up: 0, down: 0, nowPassing: 0, nowFailing: 0 };
  for (const testId of testIds) {
    // Preview first. Stored percentages were rounded to whole numbers at submit,
    // so a re-grade "changes" 40% to 40.43% with no mark moving. Only a test
    // where some student's actual score moves is written.
    const preview = await regradeTestAttempts({ testId, dryRun: true, reason: REASON }, sb as any);
    const scoreMoves = preview.rows.some((r) => r.changed && r.old_score !== r.new_score);
    const res = !dryRun && scoreMoves ? await regradeTestAttempts({ testId, dryRun: false, reason: REASON }, sb as any) : preview;
    if (res.summary.attempts === 0) continue;
    if (!scoreMoves) {
      total.tests += 1;
      total.attempts += res.summary.attempts;
      continue;
    }
    total.tests += 1;
    total.attempts += res.summary.attempts;
    total.changed += res.summary.changed;
    total.up += res.summary.moved_up;
    total.down += res.summary.moved_down;
    total.nowPassing += res.summary.now_passing;
    total.nowFailing += res.summary.now_failing;
    for (const r of res.rows.filter((x) => x.changed)) {
      console.log(
        `  test ${testId.slice(0, 8)} · ${r.student_name ?? r.student_id.slice(0, 8)} attempt ${r.attempt_number}: ` +
          `${r.old_score}/${r.old_total} (${r.old_percentage}%) -> ${r.new_score}/${r.new_total} (${r.new_percentage}%)` +
          (r.old_passed !== r.new_passed ? ` · pass ${r.old_passed} -> ${r.new_passed}` : ''),
      );
    }
  }
  console.log(
    `${dryRun ? 'PREVIEW (nothing written)' : 'RE-GRADED'}: ${total.tests} tests with attempts, ${total.attempts} attempts, ` +
      `${total.changed} change (${total.up} up, ${total.down} down), now passing ${total.nowPassing}, now failing ${total.nowFailing}`,
  );
}

async function main() {
  const envFile = opt('env-file');
  if (envFile) loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  console.log(`Database: ${url}`);
  const input = opt('input');
  if (!input) throw new Error('--input <verified changes json> is required');
  const changes: Change[] = JSON.parse(readFileSync(input, 'utf8'));
  console.log(`${changes.length} verified changes`);

  if (flag('keys')) await applyKeys(sb, changes);
  else if (flag('regrade-preview')) await regrade(sb, changes, true);
  else if (flag('regrade-apply')) await regrade(sb, changes, false);
  else throw new Error('Pick one step: --keys, --regrade-preview or --regrade-apply');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
