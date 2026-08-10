/**
 * Unstick the drawing questions that never made it into a paper.
 *
 * A drawing prompt has no answer to key, so the answer-key screen skipped it,
 * so its status never left 'draft', so bulkActivateQuestions (which only takes
 * 'complete' and 'answer_keyed') never touched it, so loadPaperQuestionIds
 * (which only takes is_active) left it out of every generated mock. Nothing
 * errored anywhere along that chain. JEE Paper 2 2006 simply reported 90 of its
 * 92 questions and nobody could see why.
 *
 * Measured on production 2026-08-09: 43 drawing questions across 18 JEE Paper 2
 * papers sat at 'draft', and 145 drawings carried origin='authored' with 0 at
 * 'pyq', which made the Source filter's "Previous year papers" hide every one.
 *
 * Two column writes, both narrow:
 *   status 'draft' -> 'complete'   (makes them eligible for Activate)
 *   origin -> 'pyq'                (they came off a real paper)
 *
 * It deliberately does NOT set is_active. Activation stays a teacher's press,
 * exactly as it is today, so no paper silently changes what students already
 * see. It does not rebuild existing tests either: a teacher who wants the
 * drawings in a mock that already exists unlinks it and builds it again.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/qb-backfill-paper-drawings.ts --dry-run
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/qb-backfill-paper-drawings.ts --apply
 *
 * Run against staging first. Point SUPABASE_URL at the environment you mean:
 * this writes wherever it is aimed, and a local shell defaulting to production
 * has caught people out on this codebase before.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Formats a human marks, so neither has an answer key to wait for. */
const HUMAN_MARKED = ['DRAWING_PROMPT', 'IMAGE_BASED'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

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
  origin: string | null;
  question_format: string | null;
  original_paper_id: string;
  nexus_qb_original_papers: { exam_type: string; year: number } | null;
}

async function main() {
  console.log(`\nTarget: ${SUPABASE_URL}`);
  console.log(DRY_RUN ? 'Mode:   DRY RUN, nothing will be written\n' : 'Mode:   APPLY\n');

  // Only questions that belong to a paper. A standalone drawing authored for a
  // chapter or a recap is genuinely 'authored' and must keep that label.
  const { data, error } = await supabase
    .from('nexus_qb_questions')
    .select('id, status, origin, question_format, original_paper_id, nexus_qb_original_papers(exam_type, year)')
    .not('original_paper_id', 'is', null)
    .in('question_format', HUMAN_MARKED);
  if (error) throw error;

  const rows = (data || []) as unknown as Row[];
  const stuck = rows.filter((r) => r.status === 'draft');
  const misattributed = rows.filter((r) => r.origin !== 'pyq');

  const papers = new Set(stuck.map((r) => r.original_paper_id));
  console.log(`Found ${rows.length} drawing questions on papers.`);
  console.log(`  ${stuck.length} stuck at 'draft', across ${papers.size} papers`);
  console.log(`  ${misattributed.length} not marked 'pyq'\n`);

  const byPaper = new Map<string, number>();
  for (const r of stuck) {
    const label = r.nexus_qb_original_papers
      ? `${r.nexus_qb_original_papers.exam_type} ${r.nexus_qb_original_papers.year}`
      : r.original_paper_id;
    byPaper.set(label, (byPaper.get(label) || 0) + 1);
  }
  for (const [label, n] of [...byPaper.entries()].sort()) {
    console.log(`    ${label}: ${n} drawing${n === 1 ? '' : 's'}`);
  }

  if (stuck.length === 0 && misattributed.length === 0) {
    console.log('\nNothing to do.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDry run. Re-run with --apply to write these.');
    return;
  }

  if (stuck.length > 0) {
    const { error: statusError } = await supabase
      .from('nexus_qb_questions')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .in('id', stuck.map((r) => r.id));
    if (statusError) throw statusError;
    console.log(`\nPromoted ${stuck.length} questions from 'draft' to 'complete'.`);
  }

  if (misattributed.length > 0) {
    const { error: originError } = await supabase
      .from('nexus_qb_questions')
      .update({ origin: 'pyq', updated_at: new Date().toISOString() })
      .in('id', misattributed.map((r) => r.id));
    if (originError) throw originError;
    console.log(`Re-labelled ${misattributed.length} questions as origin 'pyq'.`);
  }

  // Paper counters are derived from question statuses, so they are now stale on
  // every paper touched. Refresh them here rather than leaving a teacher
  // looking at a header that disagrees with the question list underneath it.
  const touched = new Set([...stuck, ...misattributed].map((r) => r.original_paper_id));
  for (const paperId of touched) {
    const { data: qs } = await supabase
      .from('nexus_qb_questions')
      .select('status')
      .eq('original_paper_id', paperId);
    const statuses = (qs || []).map((q: { status: string | null }) => q.status);
    const parsed = statuses.length;
    const complete = statuses.filter((s) => s === 'complete' || s === 'active').length;
    const answerKeyed = statuses.filter(
      (s) => s === 'answer_keyed' || s === 'complete' || s === 'active',
    ).length;
    await supabase
      .from('nexus_qb_original_papers')
      .update({
        questions_parsed: parsed,
        questions_answer_keyed: answerKeyed,
        questions_complete: complete,
        upload_status:
          complete === parsed && parsed > 0 ? 'complete' : answerKeyed > 0 ? 'answer_keyed' : 'parsed',
      })
      .eq('id', paperId);
  }
  console.log(`Refreshed counters on ${touched.size} papers.`);

  console.log('\nDone. The drawings are now eligible for Activate, but none were activated.');
  console.log('Open each paper and press Activate to put them in front of students.');
}

main().catch((err) => {
  console.error('\nBackfill failed:', err);
  process.exit(1);
});
