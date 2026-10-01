/**
 * What the meeting screen shows when a teacher shares the Answer Pad to it.
 *
 * Everyone in the meeting sees the shared screen, each on their own device, so
 * it is built from the teacher's snapshot but keeps class-level numbers only:
 *   - no names and no student ids;
 *   - no teacher topic and no room code;
 *   - no breakdown of what the class answered until the teacher reveals, so
 *     nobody is swayed by what others picked;
 *   - never the words students typed for a short text question, which could
 *     be anything, a name included. Numbers are safe to show.
 *
 * The one exception to "no names" is a round's published results: the top five
 * by name and correct count (founder, 2026-09-30). Never anyone below them, and
 * never a percentage that would let the room work out a low score.
 */

import { mcqLetters } from './client/teacher-view';
import type { AnswerType, PromptState, TeacherSnapshot } from './client/types';
import type { RoundResults } from './round-results';

/** How many typed number answers the chart shows before summing the rest. */
export const STAGE_TOP_ANSWERS = 6;

export interface StageReveal {
  ungraded: boolean;
  correct_keys: string[];
  distribution: Array<{ value: string; count: number }>;
  /** Answers beyond the top ones shown, for numbers. */
  others: number;
  correct: number;
  incorrect: number;
}

export interface StageResults {
  round_no: number | null;
  top: Array<{ name: string | null; rank: number; correct: number; counted: number }>;
  average_score: number | null;
  took_part: number;
  questions: number;
}

export interface StageView {
  server_time: string;
  /** Set only between rounds, once the last round's results are published. */
  results?: StageResults | null;
  session: { id: string; status: 'live' | 'ended'; classroom_name: string | null; hint_topic: string };
  prompt: {
    id: string;
    sequence: number;
    /** The teacher's reference, so the screen says Q.38 as the paper does. */
    label: string | null;
    state: PromptState;
    version: number;
    answer_type: AnswerType;
    answered: number;
    enrolled: number;
    /** Null until REVEAL. */
    reveal: StageReveal | null;
  } | null;
}

function distributionFor(snapshot: TeacherSnapshot, answerType: AnswerType, optionCount: number | null) {
  const given = new Map(snapshot.groups.map((group) => [group.value, group.count]));

  if (answerType === 'mcq' || answerType === 'yesno') {
    const values = answerType === 'mcq' ? mcqLetters(optionCount) : ['yes', 'no'];
    return { distribution: values.map((value) => ({ value, count: given.get(value) ?? 0 })), others: 0 };
  }
  if (answerType === 'text') return { distribution: [], others: 0 };

  const ranked = [...given.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const shown = ranked.slice(0, STAGE_TOP_ANSWERS);
  const others = ranked.slice(STAGE_TOP_ANSWERS).reduce((sum, row) => sum + row.count, 0);
  return { distribution: shown, others };
}

export function stageView(snapshot: TeacherSnapshot): StageView {
  const { session, prompt, counts } = snapshot;
  const view: StageView = {
    server_time: snapshot.server_time,
    session: { id: session.id, status: session.status, classroom_name: session.classroom_name, hint_topic: session.hint_topic },
    prompt: null,
  };
  if (!prompt) return view;

  let reveal: StageReveal | null = null;
  if (prompt.state === 'revealed') {
    reveal = {
      ungraded: prompt.ungraded,
      correct_keys: prompt.ungraded ? [] : (prompt.correct_keys ?? []),
      ...distributionFor(snapshot, prompt.answer_type, prompt.option_count),
      correct: prompt.ungraded ? 0 : (counts?.correct ?? 0),
      incorrect: prompt.ungraded ? 0 : (counts?.incorrect ?? 0),
    };
  }

  view.prompt = {
    id: prompt.id,
    sequence: prompt.sequence,
    label: prompt.label,
    state: prompt.state,
    version: prompt.version,
    answer_type: prompt.answer_type,
    answered: counts?.answered ?? prompt.answered_count,
    enrolled: counts?.enrolled ?? snapshot.readiness.enrolled,
    reveal,
  };
  return view;
}


/** The meeting screen between rounds: the published top five, and the class as a whole. */
export function stageResultsView(results: RoundResults, serverTime: string): StageView {
  return {
    server_time: serverTime,
    session: {
      id: results.session.id,
      status: results.session.status,
      classroom_name: results.session.classroom_name,
      hint_topic: '',
    },
    prompt: null,
    results: {
      round_no: results.session.round_no,
      top: results.top.map((row) => ({ name: row.name, rank: row.rank, correct: row.correct, counted: row.counted })),
      average_score: results.class.average_score ?? null,
      took_part: results.class.took_part,
      questions: results.class.questions,
    },
  };
}
