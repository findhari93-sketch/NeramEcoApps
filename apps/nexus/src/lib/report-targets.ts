/**
 * What a student can report on one question: only the parts it actually has.
 *
 * A student reporting "the video is wrong" on a question with no video is a
 * report nobody can act on, so the sheet never offers it, and the route
 * refuses it anyway. A split drawing offers each part's video and image on
 * its own, because part B's video being wrong says nothing about part A's.
 *
 * Order: the video first (the thing this feature exists for), then the
 * written solution, the image, the answer key, and the question itself last.
 */
import type { QBReportTarget } from '@neram/database';

export interface ReportTargetOption {
  target: QBReportTarget;
  partLabel: string | null;
  label: string;
}

interface ReportableQuestion {
  question_format?: string | null;
  explanation_brief?: string | null;
  explanation_detailed?: string | null;
  explanation_brief_hi?: string | null;
  explanation_detailed_hi?: string | null;
  solution_video_url?: string | null;
  solution_image_url?: string | null;
  correct_answer?: string | null;
  drawing_parts?: unknown;
}

interface PartLike {
  label?: string | null;
  solution_image_url?: string | null;
  solution_video_url?: string | null;
}

const has = (value: unknown) => typeof value === 'string' && value.trim() !== '';

function partsOf(question: ReportableQuestion): PartLike[] | null {
  const parts = question.drawing_parts as { mode?: string; items?: PartLike[] } | null | undefined;
  if (!parts || (parts.mode !== 'all' && parts.mode !== 'any_one') || !Array.isArray(parts.items)) return null;
  return parts.items;
}

export function reportTargetsFor(question: ReportableQuestion): ReportTargetOption[] {
  const out: ReportTargetOption[] = [];
  const drawing = question.question_format === 'DRAWING_PROMPT';
  const parts = partsOf(question);

  if (parts) {
    for (const p of parts) {
      if (has(p.solution_video_url) && p.label) {
        out.push({ target: 'video', partLabel: p.label, label: `Video for part ${p.label}` });
      }
    }
    for (const p of parts) {
      if (has(p.solution_image_url) && p.label) {
        out.push({ target: 'solution_image', partLabel: p.label, label: `Solution image for part ${p.label}` });
      }
    }
  } else {
    if (has(question.solution_video_url)) out.push({ target: 'video', partLabel: null, label: 'Video solution' });
    // A drawing's "explanation" is a line the import wrote from the prompt;
    // students are not shown it (QuestionDetail), so it cannot be reported.
    const explanation =
      has(question.explanation_brief) ||
      has(question.explanation_detailed) ||
      has(question.explanation_brief_hi) ||
      has(question.explanation_detailed_hi);
    if (!drawing && explanation) out.push({ target: 'explanation', partLabel: null, label: 'Written solution' });
    if (has(question.solution_image_url)) {
      out.push({ target: 'solution_image', partLabel: null, label: 'Solution image' });
    }
  }

  if (!drawing && has(question.correct_answer)) out.push({ target: 'answer_key', partLabel: null, label: 'Answer key' });
  out.push({ target: 'question', partLabel: null, label: 'The question itself' });
  return out;
}

/** Does a stored report (snake case) describe this option (camel case)? */
export function sameReportTarget(
  a: { target: QBReportTarget; part_label: string | null },
  b: { target: QBReportTarget; partLabel: string | null },
): boolean {
  return a.target === b.target && (a.part_label ?? null) === (b.partLabel ?? null);
}

const WORDS: Record<QBReportTarget, string> = {
  video: 'video',
  explanation: 'solution',
  solution_image: 'solution image',
  answer_key: 'answer key',
  question: 'question',
};

/** The part, as it reads in a sentence: "Some students think this video has a mistake." */
export function reportTargetWord(target: QBReportTarget): string {
  return WORDS[target];
}
