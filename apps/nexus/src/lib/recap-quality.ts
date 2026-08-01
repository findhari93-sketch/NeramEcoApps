/**
 * Decides whether a generated recap is good enough to put in front of students
 * without a human reading it first.
 *
 * This is the load-bearing part of auto-publishing. Nobody reviews these before
 * a student sees them, so the bar has to catch the ways a language model fails
 * on a lecture transcript: inventing questions about things the tutor never
 * said, covering the first ten minutes and calling it a class, or producing
 * eleven questions whose answer is always B.
 *
 * Structure: four HARD checks that hold the recap whatever the score, and four
 * SOFT checks that contribute to a score. Hard checks are the ones where a
 * failure means the recap is not merely mediocre but broken as a gate. A student
 * cannot be asked to pass a checkpoint whose questions are unanswerable.
 *
 * Pure: no Supabase, no network, no clock. Everything it needs is passed in, so
 * every branch is testable and a threshold change is a one-line diff with a test
 * that fails if it was wrong.
 */

import type { TranscriptEntry } from '@neram/database';
import type { GeneratedSection } from './ai-generate';

export type HoldReason =
  | 'no_transcript'
  | 'short_transcript'
  | 'low_coverage'
  | 'bad_boundaries'
  | 'thin_questions'
  | 'low_quality'
  | 'generation_failed'
  | 'manual';

export interface QualityCheck {
  id: string;
  hard: boolean;
  passed: boolean;
  /** What was measured, for the tutor queue: "coverage 0.62, needed 0.85". */
  detail: string;
  measured?: number;
  threshold?: number;
}

export interface QualityVerdict {
  publish: boolean;
  score: number;
  holdReason: HoldReason | null;
  checks: QualityCheck[];
  /** The two most useful failures, phrased for a person. */
  summary: string;
}

export const PREFLIGHT = {
  minEntries: 40,
  minChars: 1500,
  minDurationSeconds: 300,
};

export const THRESHOLDS = {
  coverage: 0.85,
  maxGapSeconds: 180,
  minSegmentRatio: 0.4,
  maxSegmentRatio: 2.5,
  firstStartWithin: 120,
  lastEndWithin: 180,
  maxSameAnswerShare: 0.6,
  minExplanationShare: 0.8,
  minExplanationChars: 20,
  minGroundedShare: 0.7,
  groundingWordOverlap: 3,
  minQuestionChars: 25,
  publishScore: 0.8,
};

const STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'will', 'your', 'they', 'them', 'then',
  'what', 'when', 'which', 'were', 'because', 'about', 'into', 'also', 'been', 'more', 'some',
  'here', 'there', 'their', 'would', 'could', 'should', 'these', 'those', 'than', 'very', 'just',
  'like', 'over', 'only', 'know', 'need', 'want', 'okay', 'right', 'going', 'thing', 'things',
]);

function contentWords(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOPWORDS.has(w)),
  );
}

/**
 * Cheap gate BEFORE any Gemini call. A three-minute clip or a transcript that is
 * mostly "can everyone hear me" cannot produce a real checkpoint quiz, and
 * finding that out after spending five calls of a shared quota is pure waste.
 */
export function preflight(
  transcript: TranscriptEntry[],
  durationSeconds: number,
): { ok: boolean; reason: HoldReason | null; detail: string } {
  if (!transcript || transcript.length === 0) {
    return { ok: false, reason: 'no_transcript', detail: 'No transcript stored for this class.' };
  }
  const chars = transcript.reduce((n, e) => n + (e.text?.length || 0), 0);
  const duration = durationSeconds || transcript[transcript.length - 1]?.end || 0;

  if (transcript.length < PREFLIGHT.minEntries) {
    return {
      ok: false,
      reason: 'short_transcript',
      detail: `Transcript has ${transcript.length} lines, needs ${PREFLIGHT.minEntries}.`,
    };
  }
  if (chars < PREFLIGHT.minChars) {
    return {
      ok: false,
      reason: 'short_transcript',
      detail: `Transcript is ${chars} characters, needs ${PREFLIGHT.minChars}.`,
    };
  }
  if (duration < PREFLIGHT.minDurationSeconds) {
    return {
      ok: false,
      reason: 'short_transcript',
      detail: `Class is ${Math.round(duration)}s long, needs ${PREFLIGHT.minDurationSeconds}s.`,
    };
  }
  return { ok: true, reason: null, detail: '' };
}

export interface ScoreInput {
  sections: GeneratedSection[];
  transcript: TranscriptEntry[];
  durationSeconds: number;
  targetSegmentSeconds: number;
  /** Questions each segment must be able to serve. */
  questionsToServe: number;
}

export function scoreRecapGeneration(input: ScoreInput): QualityVerdict {
  const { sections, transcript, targetSegmentSeconds, questionsToServe } = input;
  const duration =
    input.durationSeconds || (transcript.length ? transcript[transcript.length - 1].end : 0);
  const checks: QualityCheck[] = [];

  const add = (
    id: string,
    hard: boolean,
    passed: boolean,
    detail: string,
    measured?: number,
    threshold?: number,
  ) => checks.push({ id, hard, passed, detail, measured, threshold });

  // ── Hard 1: coverage ──────────────────────────────────────────────────────
  const sorted = [...sections].sort(
    (a, b) => a.start_timestamp_seconds - b.start_timestamp_seconds,
  );
  const covered = sorted.reduce(
    (n, s) => n + Math.max(0, s.end_timestamp_seconds - s.start_timestamp_seconds),
    0,
  );
  const coverage = duration > 0 ? covered / duration : 0;

  let maxGap = sorted.length ? sorted[0].start_timestamp_seconds : 0;
  let overlaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].start_timestamp_seconds - sorted[i - 1].end_timestamp_seconds;
    if (gap > maxGap) maxGap = gap;
    if (gap < 0) overlaps++;
  }

  add(
    'coverage',
    true,
    coverage >= THRESHOLDS.coverage && maxGap <= THRESHOLDS.maxGapSeconds && overlaps === 0,
    `Covers ${(coverage * 100).toFixed(0)}% of the class (needs ${(
      THRESHOLDS.coverage * 100
    ).toFixed(0)}%), largest gap ${Math.round(maxGap)}s, ${overlaps} overlaps.`,
    coverage,
    THRESHOLDS.coverage,
  );

  // ── Hard 2: boundary sanity ───────────────────────────────────────────────
  //
  // Measured against the TYPICAL segment of this recap, not against the
  // configured target. Boundaries are computed by recap-segments now, so the
  // real question is "are these segments consistent with each other", and a
  // fifty minute class with a fifteen minute target has to produce short
  // segments: there is no other option, and failing it for that would hold a
  // perfectly good recap. Comparing against the median still catches the thing
  // this check exists for, a run of sane segments plus one absurd one.
  const lengths = sorted
    .map((s) => s.end_timestamp_seconds - s.start_timestamp_seconds)
    .sort((a, b) => a - b);
  const typical = lengths.length
    ? lengths[Math.floor(lengths.length / 2)] || targetSegmentSeconds
    : targetSegmentSeconds;

  const badLengths = sorted.filter((s) => {
    const len = s.end_timestamp_seconds - s.start_timestamp_seconds;
    return (
      len <= 0 ||
      len < typical * THRESHOLDS.minSegmentRatio ||
      len > typical * THRESHOLDS.maxSegmentRatio
    );
  }).length;
  const firstOk =
    sorted.length > 0 && sorted[0].start_timestamp_seconds <= THRESHOLDS.firstStartWithin;
  const lastOk =
    sorted.length > 0 &&
    duration > 0 &&
    duration - sorted[sorted.length - 1].end_timestamp_seconds <= THRESHOLDS.lastEndWithin;

  add(
    'boundaries',
    true,
    badLengths === 0 && firstOk && lastOk,
    `${badLengths} segments outside ${THRESHOLDS.minSegmentRatio}x to ${THRESHOLDS.maxSegmentRatio}x the typical ${Math.round(typical)}s segment; starts on time: ${firstOk}; ends on time: ${lastOk}.`,
  );

  // ── Hard 3: enough questions to actually serve a checkpoint ───────────────
  const allText = new Set<string>();
  let duplicateQuestions = 0;
  const thin = sorted.filter((s) => {
    const usable = (s.questions || []).filter((q) => {
      if (!q.question_text || q.question_text.trim().length < THRESHOLDS.minQuestionChars) {
        return false;
      }
      const key = q.question_text.toLowerCase().replace(/\s+/g, ' ').trim();
      if (allText.has(key)) {
        duplicateQuestions++;
        return false;
      }
      allText.add(key);
      return true;
    });
    return usable.length < questionsToServe;
  }).length;

  add(
    'question_volume',
    true,
    thin === 0 && sorted.length > 0,
    `${thin} of ${sorted.length} segments have fewer than ${questionsToServe} usable questions${
      duplicateQuestions ? `, ${duplicateQuestions} duplicates dropped` : ''
    }.`,
  );

  // ── Hard 4: at least two segments ────────────────────────────────────────
  add(
    'segment_count',
    true,
    sorted.length >= 2,
    `${sorted.length} segments (needs at least 2).`,
    sorted.length,
    2,
  );

  const questions = sorted.flatMap((s) => s.questions || []);
  const total = questions.length || 1;

  // ── Soft 1: answer-position balance ──────────────────────────────────────
  const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
  for (const q of questions) counts[q.correct_option] = (counts[q.correct_option] || 0) + 1;
  const topShare = Math.max(...Object.values(counts)) / total;
  add(
    'answer_balance',
    false,
    topShare <= THRESHOLDS.maxSameAnswerShare,
    `${(topShare * 100).toFixed(0)}% of answers share one letter (max ${(
      THRESHOLDS.maxSameAnswerShare * 100
    ).toFixed(0)}%).`,
    topShare,
    THRESHOLDS.maxSameAnswerShare,
  );

  // ── Soft 2: explanations ─────────────────────────────────────────────────
  const explained =
    questions.filter((q) => (q.explanation || '').trim().length >= THRESHOLDS.minExplanationChars)
      .length / total;
  add(
    'explanations',
    false,
    explained >= THRESHOLDS.minExplanationShare,
    `${(explained * 100).toFixed(0)}% of questions explain the answer (needs ${(
      THRESHOLDS.minExplanationShare * 100
    ).toFixed(0)}%).`,
    explained,
    THRESHOLDS.minExplanationShare,
  );

  // ── Soft 3: grounding ────────────────────────────────────────────────────
  // The cheap hallucination detector, and the check that earns its keep. A
  // question the model invented about a topic the tutor never covered will not
  // share vocabulary with the transcript of the segment it claims to test.
  let grounded = 0;
  let considered = 0;
  for (const s of sorted) {
    const segmentWords = contentWords(
      transcript
        .filter(
          (e) => e.start >= s.start_timestamp_seconds - 1 && e.start <= s.end_timestamp_seconds + 1,
        )
        .map((e) => e.text)
        .join(' '),
    );
    if (segmentWords.size === 0) continue;
    for (const q of s.questions || []) {
      considered++;
      const qWords = contentWords(q.question_text);
      let overlap = 0;
      for (const w of qWords) if (segmentWords.has(w)) overlap++;
      if (overlap >= THRESHOLDS.groundingWordOverlap) grounded++;
    }
  }
  const groundedShare = considered > 0 ? grounded / considered : 0;
  add(
    'grounding',
    false,
    considered === 0 || groundedShare >= THRESHOLDS.minGroundedShare,
    `${(groundedShare * 100).toFixed(
      0,
    )}% of questions use words from their own segment (needs ${(
      THRESHOLDS.minGroundedShare * 100
    ).toFixed(0)}%).`,
    groundedShare,
    THRESHOLDS.minGroundedShare,
  );

  // ── Soft 4: distinct questions ───────────────────────────────────────────
  add(
    'distinctness',
    false,
    duplicateQuestions === 0,
    `${duplicateQuestions} duplicate questions across the recap.`,
  );

  const soft = checks.filter((c) => !c.hard);
  const score = soft.length ? soft.filter((c) => c.passed).length / soft.length : 1;
  const failedHard = checks.filter((c) => c.hard && !c.passed);
  const failedSoft = soft.filter((c) => !c.passed);

  const publish = failedHard.length === 0 && score >= THRESHOLDS.publishScore;

  let holdReason: HoldReason | null = null;
  if (failedHard.length) {
    const first = failedHard[0].id;
    holdReason =
      first === 'coverage'
        ? 'low_coverage'
        : first === 'boundaries'
          ? 'bad_boundaries'
          : first === 'question_volume'
            ? 'thin_questions'
            : 'bad_boundaries';
  } else if (!publish) {
    holdReason = 'low_quality';
  }

  const summary = publish
    ? 'Passed every check.'
    : [...failedHard, ...failedSoft]
        .slice(0, 2)
        .map((c) => c.detail)
        .join(' ');

  return { publish, score, holdReason, checks, summary };
}
