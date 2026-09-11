/**
 * What "to pass" means for one checkpoint, worked out exactly as the server will.
 *
 * The sections PUT stamps every checkpoint with resolveSectionGate, and the
 * student quiz grades against the same function. The editor used to say
 * "Blank = all" beside the field, which was never true: a blank pass mark is the
 * recording's pass percentage of the questions served. This uses the same
 * function, so the number the teacher reads is the number students meet.
 *
 * Pure TypeScript, no JSX.
 */

import { resolveSectionGate } from './recap-gate';

/** The gate settings the sections GET returns for a recording. */
export interface GateInfo {
  questions_per_segment: number;
  pass_percentage: number;
}

export interface PassMarkChoice {
  /** null is "use the default". */
  value: number | null;
  label: string;
}

export function describePassMark(
  section: { min_questions_to_pass: number | null; questions: ReadonlyArray<unknown> },
  gate: GateInfo,
): { serve: number; minToPass: number; label: string } {
  const { serve, minToPass } = resolveSectionGate(
    { min_questions_to_pass: section.min_questions_to_pass, questions_to_serve: null },
    section.questions.length,
    { questionsPerSegment: gate.questions_per_segment, passPercentage: gate.pass_percentage },
  );
  return { serve, minToPass, label: `${minToPass} of ${serve} to pass` };
}

/** The default first, then every count from 1 up to the questions served. */
export function passMarkChoices(questionCount: number, gate: GateInfo): PassMarkChoice[] {
  const fallback = describePassMark(
    { min_questions_to_pass: null, questions: Array.from({ length: Math.max(0, questionCount) }) },
    gate,
  );
  const choices: PassMarkChoice[] = [
    {
      value: null,
      label: `Default: ${fallback.minToPass} of ${fallback.serve} (${gate.pass_percentage}%)`,
    },
  ];
  for (let n = 1; n <= fallback.serve; n++) {
    choices.push({ value: n, label: `${n} of ${fallback.serve}` });
  }
  return choices;
}
