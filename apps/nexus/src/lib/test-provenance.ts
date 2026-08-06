/**
 * Turning a test's stored content_summary into something a teacher can read at
 * a glance.
 *
 * WHY THIS IS SEPARATE from buildContentSummary in @neram/database: that side
 * decides what to STORE and must stay stable, because rows written months apart
 * have to keep meaning the same thing. This side decides what to SHOW, and is
 * free to change wording whenever the wording is wrong. Mixing the two would
 * mean every copy edit needed a backfill.
 *
 * Pure TypeScript, no JSX and no next/* imports, so the API route and the
 * component can share it and cannot drift.
 */

import type { NexusTestContentSummary } from '@neram/database';

/** Exam codes are stored as enum-ish slugs. Only the ones that read badly. */
const EXAM_LABEL: Record<string, string> = {
  JEE_PAPER_2: 'JEE Paper 2',
  JEE_PAPER_2A: 'JEE Paper 2A',
  JEE_PAPER_2B: 'JEE Paper 2B',
};

export function examLabel(code: string | null | undefined): string {
  if (!code) return '';
  return EXAM_LABEL[code] || code.replace(/_/g, ' ');
}

/** 'spatial_visualization' -> 'Spatial visualization', when no label map has it. */
function humanise(slug: string): string {
  const spaced = slug.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The categories worth naming.
 *
 * A category attached to EVERY question in the paper is an umbrella, not a
 * description. Production has 544-question papers where `aptitude` has n = 544:
 * saying "mostly Aptitude" there is strictly less informative than saying
 * nothing, because it is true of the entire question bank.
 *
 * So a category that covers the whole paper is dropped, UNLESS dropping it would
 * leave nothing at all, in which case it is the only honest answer available.
 */
export function meaningfulCategories(
  summary: Pick<NexusTestContentSummary, 'categories' | 'question_count'>,
): Array<{ slug: string; n: number }> {
  const all = summary.categories || [];
  if (all.length === 0) return [];
  const total = summary.question_count || 0;
  const distinctive = total > 0 ? all.filter((c) => c.n < total) : all;
  return distinctive.length > 0 ? distinctive : all;
}

/**
 * The papers a test draws on, as one phrase.
 *
 * One paper reads as "JEE Paper 2 2009". Several years of the same exam collapse
 * to a range, "JEE Paper 2, 2005 to 2014", because eleven comma-separated years
 * is not something anyone reads. Several exams stay listed.
 */
export function describePapers(summary: Pick<NexusTestContentSummary, 'papers'>): string {
  const papers = summary.papers || [];
  if (papers.length === 0) return '';

  const exams = [...new Set(papers.map((p) => p.exam_type).filter(Boolean))];
  const years = papers.map((p) => p.year).filter((y): y is number => typeof y === 'number');

  if (exams.length === 1) {
    const exam = examLabel(exams[0]);
    if (years.length === 0) return exam;
    const min = Math.min(...years);
    const max = Math.max(...years);
    if (min === max) {
      const session = papers.find((p) => p.year === min)?.session;
      return session ? `${exam} ${min} ${session}` : `${exam} ${min}`;
    }
    return `${exam}, ${min} to ${max}`;
  }

  return exams.map(examLabel).join(', ');
}

/**
 * The difficulty mix, as one word.
 *
 * Named after the dominant level rather than reported as three numbers, because
 * the number a teacher wants is "is this a hard paper", not a histogram. "Mixed"
 * when no level holds a clear majority.
 */
export function describeDifficulty(summary: Pick<NexusTestContentSummary, 'difficulty'>): string {
  const counts = summary.difficulty || {};
  const entries = Object.entries(counts);
  if (entries.length === 0) return '';
  const total = entries.reduce((n, [, v]) => n + v, 0);
  if (total === 0) return '';
  const [top, topN] = entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (topN / total < 0.6) return 'mixed difficulty';
  return top.toLowerCase();
}

/**
 * The one line that replaces a useless title.
 *
 * Built from what is actually known, never padded. A summary with nothing but a
 * count produces "27 questions", which is still more than the stored title
 * "Practice - 0 questions" was telling anyone.
 *
 * @param categoryLabels slug -> label, from categoryLabelMap(tree). Optional:
 *        without it the slugs are humanised, which is worse but never blank.
 */
export function describeTestContent(
  summary: NexusTestContentSummary | null | undefined,
  categoryLabels?: Record<string, string>,
): string {
  if (!summary) return '';

  const parts: string[] = [];

  const papers = describePapers(summary);
  if (papers) parts.push(papers);

  const count = summary.question_count ?? 0;
  parts.push(`${count} question${count === 1 ? '' : 's'}`);

  const cats = meaningfulCategories(summary).slice(0, 2);
  if (cats.length > 0) {
    const names = cats.map((c) => categoryLabels?.[c.slug] || humanise(c.slug));
    parts.push(`mostly ${names.join(' and ')}`);
  }

  const difficulty = describeDifficulty(summary);
  if (difficulty) parts.push(difficulty);

  return parts.join(' · ');
}

/**
 * Does the stored title carry any information the derived line does not?
 *
 * The student builder's auto-title was `<exam> <year> Practice - <n> questions`,
 * so for most papers the title is a strictly worse copy of the derived line, and
 * for some it is actively wrong: a 544-question paper is stored as
 * "Practice - 0 questions" because the old title effect read a stale selection.
 *
 * A title the student TYPED ("Puzzle Test") is the opposite: it is the single
 * most informative thing on the row and must lead. Distinguishing them is what
 * this does, so the UI can demote a generated title without ever demoting a
 * chosen one.
 */
export function isGeneratedTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const t = title.trim();
  // "Practice - 10 questions", "JEE Paper 2 2009 Practice - 50 questions"
  if (/\bPractice\s*-\s*\d+\s+questions?$/i.test(t)) return true;
  // "My practice test (12)", the other builder's default
  if (/^My practice test\s*\(\d+\)$/i.test(t)) return true;
  // "Fix my mistakes (20)" is generated, but it names a real and distinct
  // intent that nothing else on the row conveys, so it is treated as chosen.
  return false;
}

/**
 * A better name for a paper whose stored title is generated.
 *
 * Offered to staff as a suggestion only. A student's own paper is never renamed
 * by us: the tab is read only by design, and renaming someone's workspace to
 * suit our list would be the wrong trade even when our name is better.
 */
export function suggestedTitle(
  summary: NexusTestContentSummary | null | undefined,
  categoryLabels?: Record<string, string>,
): string | null {
  if (!summary || (summary.question_count ?? 0) === 0) return null;
  const papers = describePapers(summary);
  const cats = meaningfulCategories(summary).slice(0, 1);
  const topic = cats.length > 0 ? categoryLabels?.[cats[0].slug] || humanise(cats[0].slug) : null;
  if (!papers && !topic) return null;
  const head = [papers, topic].filter(Boolean).join(', ');
  return `${head} (${summary.question_count} Q)`;
}
