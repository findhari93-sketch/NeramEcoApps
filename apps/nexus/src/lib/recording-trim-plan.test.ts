import { describe, it, expect } from 'vitest';
import { planTrim, type Span, type TrimPlanInput } from './recording-trim-plan';

/** Speech every few seconds across [from, to]: what a transcript of real teaching looks like. */
function talk(from: number, to: number): Span[] {
  const out: Span[] = [];
  for (let t = from; t < to; t += 6) out.push([t, Math.min(t + 5, to)]);
  return out;
}

const base = (over: Partial<TrimPlanInput> = {}): TrimPlanInput => ({
  duration: 4383,
  speech: talk(544, 4366),
  silences: [],
  freezes: [],
  keyframes: [],
  ...over,
});

describe('planTrim', () => {
  it('cuts the wait before the class and the dead tail after it', () => {
    // Recap 68f14d40: nobody speaks for the first 544 seconds.
    const plan = planTrim(base());
    expect(plan.kind).toBe('cut');
    if (plan.kind !== 'cut') return;
    expect(plan.cuts).toEqual([
      { from: 0, to: 541, kind: 'lead' },
    ]);
    expect(plan.keep).toEqual([[541, 4383]]);
  });

  it('ignores a stray word in the lead-in: the class starts where speech is sustained', () => {
    const plan = planTrim(base({ speech: [[60, 62], [300, 301], ...talk(544, 4300)] }));
    expect(plan.kind === 'cut' && plan.cuts[0]).toEqual({ from: 0, to: 541, kind: 'lead' });
  });

  it('cuts a mid-class stretch only when it is silent AND the screen is still', () => {
    const speech = [...talk(0, 1000), ...talk(1200, 4000)];
    const silentOnly = planTrim({ duration: 4000, speech, silences: [[1000, 1200]], freezes: [], keyframes: [] });
    expect(silentOnly.kind).toBe('skip'); // a silent drawing demo stays

    const both = planTrim({ duration: 4000, speech, silences: [[1000, 1200]], freezes: [[990, 1210]], keyframes: [] });
    expect(both.kind === 'cut' && both.cuts).toEqual([{ from: 1001.5, to: 1198.5, kind: 'pause' }]);
  });

  it('trusts the transcript over the audio level: a wordless pause with open mics is cut', () => {
    // 14 Oct JEE class: "Good evening" at 719s, then nobody speaks until 764s,
    // but student mics kept the audio above the silence threshold.
    const speech: Span[] = [[719, 726], ...talk(764, 3935)];
    const plan = planTrim({ duration: 3945, speech, silences: [], freezes: [[700, 800]], keyframes: [] });
    expect(plan.kind === 'cut' && plan.cuts.find((c) => c.kind === 'pause')).toEqual({ from: 727.5, to: 762.5, kind: 'pause' });
  });

  it('of a wordless stretch, only the part where the screen is still goes: drawing without talking is teaching', () => {
    const speech = [...talk(0, 1000), ...talk(1200, 4000)];
    const plan = planTrim({ duration: 4000, speech, silences: [], freezes: [[1000, 1100]], keyframes: [] });
    expect(plan.kind === 'cut' ? plan.cuts : []).toEqual([{ from: 1001.5, to: 1098.5, kind: 'pause' }]);
  });

  it('leaves a pause under 30 seconds alone', () => {
    const speech = [...talk(0, 1000), ...talk(1029, 4000)];
    const plan = planTrim({ duration: 4000, speech, silences: [[1000, 1029]], freezes: [[1000, 1029]], keyframes: [] });
    expect(plan.kind).toBe('skip');
  });

  it('snaps each cut end back to a keyframe, keeping more rather than less', () => {
    const plan = planTrim(base({ keyframes: [0, 100, 200, 300, 400, 500, 600] }));
    expect(plan.kind === 'cut' && plan.cuts[0]).toEqual({ from: 0, to: 500, kind: 'lead' });
  });

  it('drops a cut that the keyframe snap shrinks below its minimum', () => {
    const speech = talk(50, 4000);
    const plan = planTrim({ duration: 4000, speech, silences: [], freezes: [], keyframes: [0, 10] });
    expect(plan.kind).toBe('skip');
  });

  it('falls back to the edges when the pauses would remove too much', () => {
    const speech: Span[] = [];
    const silences: Span[] = [];
    for (let t = 300; t < 4000; t += 100) {
      speech.push(...talk(t, t + 35));
      silences.push([t + 35, t + 100]);
    }
    const plan = planTrim({ duration: 4000, speech, silences, freezes: silences, keyframes: [] });
    expect(plan.kind).toBe('cut');
    if (plan.kind === 'cut') expect(plan.cuts.every((c) => c.kind !== 'pause')).toBe(true);
  });

  it('skips when there is not enough to be worth a new file', () => {
    const plan = planTrim(base({ speech: talk(48, 4380) }));
    expect(plan).toEqual({ kind: 'skip', reason: 'NOT_WORTH_IT' }); // a 45s lead cut is not worth a new file
  });

  it('works from audio alone when there is no transcript', () => {
    const plan = planTrim({ duration: 3000, speech: [], silences: [[0, 400]], freezes: [], keyframes: [] });
    expect(plan.kind === 'cut' && plan.cuts[0]).toEqual({ from: 0, to: 397, kind: 'lead' });
  });

  it('refuses nonsense', () => {
    expect(planTrim(base({ duration: 0 }))).toEqual({ kind: 'skip', reason: 'NO_DURATION' });
    expect(planTrim(base({ speech: [[10, 11]] }))).toEqual({ kind: 'skip', reason: 'NO_SPEECH' });
  });
});
