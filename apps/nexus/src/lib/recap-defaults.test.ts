import { describe, it, expect } from 'vitest';
import {
  questionsToPass,
  normaliseRecapDefaults,
  readRecapDefaults,
  FALLBACK_RECAP_DEFAULTS,
} from './recap-defaults';

describe('questionsToPass', () => {
  it('rounds up, so 70% of ten is seven', () => {
    expect(questionsToPass(10, 70)).toBe(7);
    expect(questionsToPass(8, 70)).toBe(6);
    expect(questionsToPass(12, 70)).toBe(9);
  });

  it('survives a checkpoint that produced fewer questions than asked for', () => {
    // The whole reason the pass mark stopped being an absolute count. "8 correct"
    // on a checkpoint that could only produce 8 questions meant every one right,
    // and no retry could ever be easier than the first attempt.
    expect(questionsToPass(8, 70)).toBeLessThan(8);
    expect(questionsToPass(5, 70)).toBe(4);
    expect(questionsToPass(3, 70)).toBe(3);
  });

  it('never asks for more than were served', () => {
    expect(questionsToPass(4, 100)).toBe(4);
    expect(questionsToPass(1, 100)).toBe(1);
  });

  it('always asks for at least one', () => {
    expect(questionsToPass(10, 1)).toBe(1);
    expect(questionsToPass(0, 50)).toBe(1);
  });

  it('clamps a nonsense percentage rather than producing a wall', () => {
    expect(questionsToPass(10, 0)).toBe(1);
    expect(questionsToPass(10, 500)).toBe(10);
  });

  it('never returns NaN, whatever it is handed', () => {
    // NaN survives every arithmetic operation, so an undefined column would
    // otherwise write a NaN pass mark onto a checkpoint, where it compares false
    // against every score a student can possibly get.
    expect(questionsToPass(10, Number.NaN)).toBe(7);
    expect(questionsToPass(Number.NaN, 70)).toBe(1);
    expect(questionsToPass(undefined as unknown as number, undefined as unknown as number)).toBe(1);
  });
});

describe('normaliseRecapDefaults', () => {
  it('accepts a well-formed settings row', () => {
    expect(
      normaliseRecapDefaults({
        target_segment_seconds: 600,
        question_pool_per_segment: 20,
        questions_per_segment: 12,
        pass_percentage: 80,
      }),
    ).toEqual({
      target_segment_seconds: 600,
      question_pool_per_segment: 20,
      questions_per_segment: 12,
      pass_percentage: 80,
    });
  });

  it('falls back field by field, not all or nothing', () => {
    const out = normaliseRecapDefaults({ pass_percentage: 90 });
    expect(out.pass_percentage).toBe(90);
    expect(out.target_segment_seconds).toBe(FALLBACK_RECAP_DEFAULTS.target_segment_seconds);
  });

  it('never serves more than the bank holds', () => {
    // Serving the whole bank makes a retry re-ask the same questions, which a
    // student can beat by remembering positions instead of rewatching.
    const out = normaliseRecapDefaults({
      question_pool_per_segment: 8,
      questions_per_segment: 15,
    });
    expect(out.questions_per_segment).toBe(8);
  });

  it('clamps values that would break generation', () => {
    const out = normaliseRecapDefaults({
      target_segment_seconds: 5,
      question_pool_per_segment: 900,
      pass_percentage: 300,
    });
    expect(out.target_segment_seconds).toBe(60);
    expect(out.question_pool_per_segment).toBe(40);
    expect(out.pass_percentage).toBe(100);
  });

  it('handles junk without throwing', () => {
    expect(normaliseRecapDefaults(null)).toEqual(FALLBACK_RECAP_DEFAULTS);
    expect(normaliseRecapDefaults({ pass_percentage: 'seventy' })).toEqual(FALLBACK_RECAP_DEFAULTS);
  });
});

describe('readRecapDefaults', () => {
  const fakeSupabase = (result: any) => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  });

  it('reads the settings row', async () => {
    const out = await readRecapDefaults(
      fakeSupabase({ data: { value: { pass_percentage: 85 } }, error: null }),
    );
    expect(out.pass_percentage).toBe(85);
  });

  it('falls back when the row is missing', async () => {
    const out = await readRecapDefaults(fakeSupabase({ data: null, error: null }));
    expect(out).toEqual(FALLBACK_RECAP_DEFAULTS);
  });

  it('falls back rather than taking the generation sweep down with it', async () => {
    const exploding = {
      from: () => {
        throw new Error('nexus_settings is unreadable');
      },
    };
    await expect(readRecapDefaults(exploding)).resolves.toEqual(FALLBACK_RECAP_DEFAULTS);
  });
});
