/**
 * Two things wrong with the drawing questions on JEE Paper 2 papers, fixed
 * together because they are the same story from both ends.
 *
 * 1. TWENTY-TWO INVENTED QUESTIONS.
 *
 *    The bulk-upload AI prompt tells the model to emit a `drawing` section. The
 *    JEE Paper 2 drawing sheet is printed separately and is very often absent
 *    from a scanned PDF, so with nothing to extract the model wrote a stand-in
 *    and the importer stored it verbatim:
 *
 *      "Drawing question 1 (on separate Drawing Sheet). Total marks: 70."
 *      "Drawing Test Question 2 (as per the separate Drawing Sheet provided...)"
 *
 *    They are indistinguishable from a real prompt in the bank. A student could
 *    be handed one and asked to spend ninety minutes on it.
 *
 *    Measured on production 2026-08-10: 22 of them across 11 papers, every one
 *    already is_active=false, with 0 student attempts, 0 test placements, 0
 *    bookmarks and 0 practice-module mirrors. 44 tag rows hang off them.
 *
 * 2. TWENTY-SEVEN REAL QUESTIONS NOBODY CAN SEE.
 *
 *    The genuine drawing prompts on 2014, 2019, 2020, 2021, 2022, 2024 and 2026
 *    sit at status='draft', is_active=false. bulkActivateQuestions only promotes
 *    'complete' and 'answer_keyed'. Answer-keying is what normally moves a
 *    question along, and a drawing has no answer to key, so a drawing that
 *    landed as 'draft' has NO ROUTE OUT OF DRAFT AT ALL. The paper activation
 *    route's practice-module bridge then filters on is_active=true and skips
 *    them forever.
 *
 *    qb-backfill-paper-drawings.ts fixed an earlier cohort of these the same
 *    way. These 27 postdate it.
 *
 * What this writes, and nothing else:
 *   - deletes the 22 placeholders, through hardDeleteQBQuestions so the
 *     preflight runs and refuses anything that has picked up a dependency
 *     since the measurement above
 *   - promotes the 27 real ones from 'draft' to 'complete'
 *
 * It deliberately does NOT set is_active on the 27. Activation stays a
 * teacher's press on the paper page, so no paper silently changes what students
 * already see, and the bridge to the practice module runs as part of that press.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/qb-fix-paper-drawings.ts --dry-run
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/qb-fix-paper-drawings.ts --apply
 *
 * Run against staging first. Point SUPABASE_URL at the environment you mean:
 * this writes wherever it is aimed, and a local shell defaulting to production
 * has caught people out on this codebase before.
 */

import { createClient } from '@supabase/supabase-js';
// Relative, not '@neram/database': the root package.json has no dependency on
// the workspace packages, so a bare specifier does not resolve under tsx here.
// Importing the module rather than restating its logic keeps the preflight
// rules in exactly one place.
import {
  hardDeleteQBQuestions,
  preflightQBQuestionDelete,
} from '../packages/database/src/queries/nexus/qb-question-delete';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * What an invented drawing prompt looks like. Anchored at the start and
 * requiring a digit, so a real prompt that happens to contain the words
 * "drawing question" partway through its text is not caught.
 */
const PLACEHOLDER_RE = /^\s*Drawing (Test )?[Qq]uestion \d/;

/**
 * The count measured on production. If the script finds a different number, the
 * regex has drifted or someone has edited a question's text, and deleting on a
 * guess is not on. Override only after reading the printed list.
 */
const EXPECTED_PLACEHOLDERS = 22;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;
const ALLOW_COUNT_DRIFT = args.includes('--allow-count-drift');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

interface Row {
  id: string;
  status: string | null;
  is_active: boolean | null;
  question_text: string | null;
  original_paper_id: string | null;
  nexus_qb_original_papers: { exam_type: string; year: number; session: string | null } | null;
}

function paperLabel(row: Row): string {
  const p = row.nexus_qb_original_papers;
  if (!p) return 'no paper';
  return `${p.exam_type} ${p.year}${p.session ? ` ${p.session}` : ''}`;
}

function shorten(text: string | null, max = 90): string {
  const one = (text || '').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max)}...` : one;
}

async function main() {
  console.log(`Target: ${SUPABASE_URL}`);
  console.log(DRY_RUN ? 'Mode:   DRY RUN, nothing will be written\n' : 'Mode:   APPLY\n');

  const { data, error } = await supabase
    .from('nexus_qb_questions')
    .select(
      'id, status, is_active, question_text, original_paper_id, nexus_qb_original_papers(exam_type, year, session)',
    )
    .eq('question_format', 'DRAWING_PROMPT');
  if (error) throw error;

  const all = (data || []) as unknown as Row[];
  const placeholders = all.filter((r) => PLACEHOLDER_RE.test(r.question_text || ''));
  const stuck = all.filter(
    (r) => !PLACEHOLDER_RE.test(r.question_text || '') && r.status === 'draft',
  );

  // ── 1. The placeholders ────────────────────────────────────────────────────

  console.log(`Placeholders found: ${placeholders.length}`);
  for (const row of placeholders) {
    console.log(`  ${paperLabel(row).padEnd(28)} ${shorten(row.question_text)}`);
  }

  if (placeholders.length !== EXPECTED_PLACEHOLDERS && !ALLOW_COUNT_DRIFT) {
    console.error(
      `\nExpected ${EXPECTED_PLACEHOLDERS} placeholders, found ${placeholders.length}.`,
    );
    console.error(
      'Read the list above. If it is right, re-run with --allow-count-drift. If it contains a real prompt, fix the regex instead.',
    );
    process.exit(1);
  }

  const preflight = await preflightQBQuestionDelete(
    placeholders.map((r) => r.id),
    supabase as never,
  );
  const blocked = preflight.filter((p) => p.blockers.length > 0);
  if (blocked.length > 0) {
    console.error(`\n${blocked.length} placeholders have picked up dependencies since measurement:`);
    for (const p of blocked) {
      console.error(`  ${shorten(p.question_text, 60)}`);
      p.blockers.forEach((b) => console.error(`    - ${b}`));
    }
    console.error('\nNothing deleted. A partial delete of a set believed uniform is worse than none.');
    process.exit(1);
  }

  // ── 2. The stuck real ones ─────────────────────────────────────────────────

  console.log(`\nReal drawing prompts stuck at draft: ${stuck.length}`);
  for (const row of stuck) {
    console.log(`  ${paperLabel(row).padEnd(28)} ${shorten(row.question_text)}`);
  }

  if (DRY_RUN) {
    console.log('\nDry run. Re-run with --apply to write these.');
    return;
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  if (placeholders.length > 0) {
    const result = await hardDeleteQBQuestions(
      placeholders.map((r) => r.id),
      { actorId: 'script:qb-fix-paper-drawings' },
      supabase as never,
    );
    console.log(`\nDeleted ${result.deleted.length} placeholder questions.`);
    if (result.refused.length > 0) {
      console.error(`Refused ${result.refused.length}. This should not happen after the check above.`);
      process.exitCode = 1;
    }
  }

  if (stuck.length > 0) {
    const { error: statusError } = await supabase
      .from('nexus_qb_questions')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .in(
        'id',
        stuck.map((r) => r.id),
      );
    if (statusError) throw statusError;
    console.log(`Promoted ${stuck.length} real drawing prompts from 'draft' to 'complete'.`);
    console.log(
      'They are now eligible for Activate. Press Activate on each paper to make them visible and to bridge them into the practice module.',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
