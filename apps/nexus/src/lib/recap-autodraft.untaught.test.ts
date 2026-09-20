import { describe, it, expect } from 'vitest';
import { isNothingTaught, NOT_TAUGHT_MAX_CHARS } from './recap-autodraft';
import type { GeneratedSection } from './ai-generate';

/**
 * A class that was never taught.
 *
 * 2026-09-18: the tutor joined the call to say classes were postponed for
 * school exams. The generator, asked for up to fifteen questions a segment,
 * wrote five about the announcement ("What was the primary reason for
 * postponing the class?"), the grounding floor refused them at 40%, and the
 * recap sat held while seventeen students went on owing a catch-up for a class
 * that never happened.
 *
 * This verdict excuses students, so a false positive costs more than a false
 * negative, and most of what follows is about the ways it must REFUSE to fire.
 *
 * The shape is a gate over two signals. The question count is the gate and is
 * never optional; past it, either the model saying every segment taught nothing
 * OR too little having been said is enough. Each alone fails in its own
 * direction: the model broke its own rule on the very case this exists for, and
 * a short transcript can mean transcription died halfway rather than that
 * nobody spoke.
 */

/** 2026-09-18, the postponement. The real figure, measured on production. */
const SILENT = 2167;

/** 2026-08-19, the thinnest class ever actually taught. Also measured. */
const TAUGHT = 24811;

function section(over: Partial<GeneratedSection> = {}): GeneratedSection {
  return {
    title: 'A stretch of the class',
    description: '',
    start_timestamp_seconds: 0,
    end_timestamp_seconds: 900,
    questions: [],
    taught: true,
    ...over,
  };
}

function questions(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    question_text: `Question ${i}`,
    option_a: 'a',
    option_b: 'b',
    option_c: 'c',
    option_d: 'd',
    // `as const`, not a bare string: GeneratedQuestion types this as the four
    // letters, and vitest does not type-check, so a plain string passes here
    // and fails the Nexus tsc build.
    correct_option: 'a' as const,
    explanation: 'because',
  }));
}

describe('deciding that nothing was taught', () => {
  it('fires on the postponement case: every segment untaught, a handful of questions', () => {
    const sections = [
      section({ taught: false, questions: questions(5) }),
      section({ taught: false, questions: [] }),
    ];

    expect(isNothingTaught(sections, 10, SILENT)).toBe(true);
  });

  it('fires on how little was said even when the model insists it taught', () => {
    // The whole reason the second signal exists. On 2026-09-18 the model broke
    // its own rule 8 and wrote questions about the announcement, so it may well
    // come back claiming the segment taught something. Requiring its agreement
    // would have held that class again and spent three more of its four
    // attempts reaching the same wrong answer.
    const sections = [
      section({ taught: true, questions: questions(5) }),
      section({ taught: true, questions: [] }),
    ];

    expect(isNothingTaught(sections, 10, SILENT)).toBe(true);
  });

  it('refuses when any segment taught something and the class was a normal length', () => {
    // Ten minutes of admin then fifty minutes of class is a normal evening.
    const sections = [
      section({ taught: false, questions: [] }),
      section({ taught: true, questions: questions(2) }),
    ];

    expect(isNothingTaught(sections, 10, TAUGHT)).toBe(false);
  });

  it('refuses when the questions are there, whatever either signal says', () => {
    // The gate, and it is absolute. Neither a mislabelled segment nor a short
    // recording can cancel a class that clearly produced teaching. The nine
    // taught classes on production between 2026-08-21 and 2026-09-15 produced
    // 28 to 90 questions each; the thinnest is nowhere near this bar.
    const sections = [
      section({ taught: false, questions: questions(9) }),
      section({ taught: false, questions: questions(9) }),
    ];

    expect(isNothingTaught(sections, 10, SILENT)).toBe(false);
  });

  it('holds the line at one full checkpoint of questions', () => {
    const nine = [section({ taught: false, questions: questions(9) })];
    const ten = [section({ taught: false, questions: questions(10) })];

    expect(isNothingTaught(nine, 10, TAUGHT)).toBe(true);
    expect(isNothingTaught(ten, 10, TAUGHT)).toBe(false);
  });

  it('refuses when the field was never sent and the class was a normal length', () => {
    // An older prompt, a salvaged truncation, or a model that ignored the
    // field. ai-generate defaults `taught` to true for exactly this reason;
    // this asserts the two halves agree.
    const sections = [section({ questions: [] }), section({ questions: [] })];

    expect(isNothingTaught(sections, 10, TAUGHT)).toBe(false);
  });

  it('treats an unknown transcript length as unknown, not as silence', () => {
    // Zero is what a caller hands over when it has nothing to measure. Letting
    // that stand in for "nobody spoke" would excuse a whole class over a
    // missing number.
    const sections = [section({ taught: true, questions: questions(3) })];

    expect(isNothingTaught(sections, 10, 0)).toBe(false);
  });

  it('refuses on no sections at all, which is a generation failure', () => {
    expect(isNothingTaught([], 10, SILENT)).toBe(false);
  });

  it('scales its question bar with the configured serve count', () => {
    // A two-question checkpoint is a real configuration, and there the same two
    // questions are a whole checkpoint rather than a scrap of one.
    const sections = [section({ taught: false, questions: questions(2) })];

    expect(isNothingTaught(sections, 2, TAUGHT)).toBe(false);
    expect(isNothingTaught(sections, 10, TAUGHT)).toBe(true);
  });

  it('keeps real daylight between the two populations', () => {
    // Not an arbitrary constant. The announcement is 3.7x under this floor and
    // the thinnest real class is 3.1x over it, so the margin has to survive a
    // very large change in how classes are run before it means anything else.
    expect(SILENT).toBeLessThan(NOT_TAUGHT_MAX_CHARS);
    expect(TAUGHT).toBeGreaterThan(NOT_TAUGHT_MAX_CHARS);
    expect(NOT_TAUGHT_MAX_CHARS / SILENT).toBeGreaterThan(3);
    expect(TAUGHT / NOT_TAUGHT_MAX_CHARS).toBeGreaterThan(3);
  });
});
