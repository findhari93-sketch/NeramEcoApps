/**
 * What is wrong with a set of checkpoints, in words a teacher can act on.
 *
 * ERRORS stop a save or a publish, because each of them breaks something for
 * students without anyone noticing:
 *   - an end that is not after its start is refused by the server anyway;
 *   - a checkpoint with no questions saves fine and can never be passed, which
 *     locks every checkpoint after it;
 *   - a question with blank text is dropped by the save without a word, so the
 *     teacher loses it;
 *   - an empty option shows a student a blank choice.
 *
 * WARNINGS are shown and never block, because each can be deliberate: a stretch
 * of video with no checkpoint, two that overlap, one that runs past the end of
 * the recording, a missing title.
 *
 * Checkpoints are numbered from one in the order they are listed, which is the
 * order the editor shows them in.
 *
 * Pure TypeScript, no JSX. The sections PUT route uses findUnpassableCheckpoint
 * so the server refuses what the editor flags.
 */

import type { EditableSection } from './recap-sections';
import { formatTimecode } from './timecode';

export type CheckpointIssueCode =
  | 'END_NOT_AFTER_START'
  | 'NO_QUESTIONS'
  | 'BLANK_QUESTION'
  | 'BLANK_OPTION'
  | 'BEYOND_DURATION'
  | 'OVERLAP'
  | 'GAP'
  | 'NO_TITLE';

export type IssueSeverity = 'error' | 'warning';

export interface CheckpointIssue {
  code: CheckpointIssueCode;
  severity: IssueSeverity;
  /** Index into the array passed in. */
  sectionIndex: number;
  questionIndex?: number;
  message: string;
}

/** A pause this short between two checkpoints is somebody's rounding, not a gap. */
export const DEFAULT_GAP_TOLERANCE_SECONDS = 5;

/** The player reports a duration with a fraction the stored end rounds past. */
const DURATION_ROUNDING_SECONDS = 1;

const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;

const isBlank = (value: unknown) => typeof value !== 'string' || !value.trim();

type Timed = Pick<EditableSection, 'start_timestamp_seconds' | 'end_timestamp_seconds'>;

function hasValidTimes(section: Timed): boolean {
  return (
    Number.isFinite(section.start_timestamp_seconds) &&
    Number.isFinite(section.end_timestamp_seconds) &&
    section.end_timestamp_seconds > section.start_timestamp_seconds
  );
}

/** The checkpoints with usable times, earliest first, keeping their original index. */
function inTimeOrder<T extends Timed>(sections: T[]): { section: T; index: number }[] {
  return sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => hasValidTimes(section))
    .sort(
      (a, b) =>
        a.section.start_timestamp_seconds - b.section.start_timestamp_seconds || a.index - b.index,
    );
}

export function validateCheckpoints(
  sections: EditableSection[],
  opts: { durationSeconds?: number | null; gapToleranceSeconds?: number } = {},
): CheckpointIssue[] {
  const issues: CheckpointIssue[] = [];
  const duration = opts.durationSeconds && opts.durationSeconds > 0 ? opts.durationSeconds : null;
  const tolerance = opts.gapToleranceSeconds ?? DEFAULT_GAP_TOLERANCE_SECONDS;

  sections.forEach((section, i) => {
    const n = i + 1;

    if (!hasValidTimes(section)) {
      issues.push({
        code: 'END_NOT_AFTER_START',
        severity: 'error',
        sectionIndex: i,
        message: `Checkpoint ${n} has to end after it starts.`,
      });
    } else if (duration && section.end_timestamp_seconds > duration + DURATION_ROUNDING_SECONDS) {
      issues.push({
        code: 'BEYOND_DURATION',
        severity: 'warning',
        sectionIndex: i,
        message: `Checkpoint ${n} ends at ${formatTimecode(section.end_timestamp_seconds)}, after the video ends at ${formatTimecode(duration)}.`,
      });
    }

    if (isBlank(section.title)) {
      issues.push({
        code: 'NO_TITLE',
        severity: 'warning',
        sectionIndex: i,
        message: `Checkpoint ${n} has no title.`,
      });
    }

    const questions = section.questions || [];
    if (!questions.length) {
      issues.push({
        code: 'NO_QUESTIONS',
        severity: 'error',
        sectionIndex: i,
        message: `Checkpoint ${n} has no questions, so no student could pass it.`,
      });
    }

    questions.forEach((question, qi) => {
      const where = `question ${qi + 1} in checkpoint ${n}`;
      if (isBlank(question.question_text)) {
        issues.push({
          code: 'BLANK_QUESTION',
          severity: 'error',
          sectionIndex: i,
          questionIndex: qi,
          message: `The text of ${where} is empty. Write it or delete the question.`,
        });
        // Its options are not worth listing until the question itself exists.
        return;
      }
      for (const key of OPTION_KEYS) {
        if (isBlank(question[`option_${key}` as const])) {
          issues.push({
            code: 'BLANK_OPTION',
            severity: 'error',
            sectionIndex: i,
            questionIndex: qi,
            message: `Option ${key.toUpperCase()} of ${where} is empty.`,
          });
        }
      }
    });
  });

  // Coverage along the video. `reach` is the furthest end so far, so a long
  // checkpoint that swallows a short one is still one overlap, not a gap after it.
  let reach: { end: number; index: number } | null = null;
  for (const { section, index } of inTimeOrder(sections)) {
    const start = section.start_timestamp_seconds;
    const end = section.end_timestamp_seconds;
    if (reach) {
      if (start < reach.end) {
        issues.push({
          code: 'OVERLAP',
          severity: 'warning',
          sectionIndex: index,
          message: `Checkpoints ${reach.index + 1} and ${index + 1} overlap by ${formatTimecode(
            Math.min(reach.end, end) - start,
          )}.`,
        });
      } else if (start - reach.end > tolerance) {
        issues.push({
          code: 'GAP',
          severity: 'warning',
          sectionIndex: index,
          message: `Nothing is checked from ${formatTimecode(reach.end)} to ${formatTimecode(start)} (${formatTimecode(
            start - reach.end,
          )}), between checkpoints ${reach.index + 1} and ${index + 1}.`,
        });
      }
    }
    if (!reach || end > reach.end) reach = { end, index };
  }

  return issues;
}

export function hasBlockingIssues(issues: CheckpointIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

/**
 * The first checkpoint no student could pass, or -1.
 *
 * Deliberately loose about its input: the sections PUT route calls this on a
 * request body, where anything can be missing.
 */
export function findUnpassableCheckpoint(
  sections: ReadonlyArray<{
    questions?: ReadonlyArray<{ question_text?: string | null } | null> | null;
  }>,
): number {
  return sections.findIndex(
    (section) => !(section?.questions || []).some((question) => !isBlank(question?.question_text)),
  );
}

export type TimelineSegment =
  | { kind: 'checkpoint'; start: number; end: number; sectionIndex: number }
  | { kind: 'gap' | 'overlap'; start: number; end: number };

/**
 * The strip under the player: checkpoints, the gaps between them and the places
 * they overlap, earliest first and clipped to the length of the video.
 */
export function timelineSegments(
  sections: EditableSection[],
  durationSeconds: number,
  gapToleranceSeconds = DEFAULT_GAP_TOLERANCE_SECONDS,
): TimelineSegment[] {
  const limit =
    Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : Number.POSITIVE_INFINITY;
  const out: TimelineSegment[] = [];
  let reachEnd: number | null = null;

  for (const { section, index } of inTimeOrder(sections)) {
    const start = Math.min(section.start_timestamp_seconds, limit);
    const end = Math.min(section.end_timestamp_seconds, limit);
    if (end <= start) continue;

    if (reachEnd !== null) {
      if (start < reachEnd) {
        out.push({ kind: 'overlap', start, end: Math.min(reachEnd, end) });
      } else if (start - reachEnd > gapToleranceSeconds) {
        out.push({ kind: 'gap', start: reachEnd, end: start });
      }
    }
    out.push({ kind: 'checkpoint', start, end, sectionIndex: index });
    reachEnd = reachEnd === null ? end : Math.max(reachEnd, end);
  }

  return out;
}
