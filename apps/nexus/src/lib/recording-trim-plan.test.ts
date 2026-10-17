import { describe, it, expect } from 'vitest';
import { planTrim, type Span, type TrimPlanInput } from './recording-trim-plan';
import fixture from './__fixtures__/trim-f041ff06-cues.json';

const f041 = { duration: fixture.duration, cues: fixture.cues as unknown as Span[] };

/** The older rule: a pause must be wordless AND the screen still, for 30s. */
const FREEZE = { screenRule: 'freeze' } as const;

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

  it('freeze rule: cuts a mid-class stretch only when it is silent AND the screen is still', () => {
    const speech = [...talk(0, 1000), ...talk(1200, 4000)];
    const silentOnly = planTrim({ duration: 4000, speech, silences: [[1000, 1200]], freezes: [], keyframes: [], params: FREEZE });
    expect(silentOnly.kind).toBe('skip'); // a silent drawing demo stays

    const both = planTrim({ duration: 4000, speech, silences: [[1000, 1200]], freezes: [[990, 1210]], keyframes: [], params: FREEZE });
    expect(both.kind === 'cut' && both.cuts).toEqual([{ from: 1001.5, to: 1198.5, kind: 'pause' }]);
  });

  it('freeze rule: trusts the transcript over the audio level: a wordless pause with open mics is cut', () => {
    // 14 Oct JEE class: "Good evening" at 719s, then nobody speaks until 764s,
    // but student mics kept the audio above the silence threshold.
    const speech: Span[] = [[719, 726], ...talk(764, 3935)];
    const plan = planTrim({ duration: 3945, speech, silences: [], freezes: [[700, 800]], keyframes: [], params: FREEZE });
    expect(plan.kind === 'cut' && plan.cuts.find((c) => c.kind === 'pause')).toEqual({ from: 727.5, to: 762.5, kind: 'pause' });
  });

  it('freeze rule: of a wordless stretch, only the part where the screen is still goes: drawing without talking is teaching', () => {
    const speech = [...talk(0, 1000), ...talk(1200, 4000)];
    const plan = planTrim({ duration: 4000, speech, silences: [], freezes: [[1000, 1100]], keyframes: [], params: FREEZE });
    expect(plan.kind === 'cut' ? plan.cuts : []).toEqual([{ from: 1001.5, to: 1098.5, kind: 'pause' }]);
  });

  it('freeze rule: leaves a pause under 30 seconds alone', () => {
    const speech = [...talk(0, 1000), ...talk(1029, 4000)];
    const plan = planTrim({ duration: 4000, speech, silences: [[1000, 1029]], freezes: [[1000, 1029]], keyframes: [], params: FREEZE });
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

  describe('transcript rule (default)', () => {
    const real = (): TrimPlanInput => ({
      duration: f041.duration,
      speech: f041.cues,
      // The real detector output: the screen "moved" at 756, mid-pause.
      silences: [],
      freezes: [[720, 756]],
      keyframes: [],
    });

    it('14 Oct JEE: the 39s pause after the greetings shrinks to about a second', () => {
      const plan = planTrim(real());
      expect(plan.kind).toBe('cut');
      if (plan.kind !== 'cut') return;
      expect(plan.pauseRule).toBe('transcript');
      const pause = plan.cuts.find((c) => c.kind === 'pause' && c.from < 800)!;
      expect(pause.from).toBeCloseTo(725.96, 2);
      expect(pause.to).toBeCloseTo(763.88, 2);
    });

    it('14 Oct JEE: every wordless gap of 3s or more goes, and nothing shorter', () => {
      const plan = planTrim(real());
      if (plan.kind !== 'cut') throw new Error('expected a cut');
      const pauses = plan.cuts.filter((c) => c.kind === 'pause');
      for (const c of pauses) expect(c.to - c.from).toBeGreaterThanOrEqual(2 - 1e-6);
      // Lead 0 to 716 as before, plus about 3.3 more minutes of pauses.
      expect(plan.cuts[0]).toEqual({ from: 0, to: 716.08, kind: 'lead' });
      const paused = pauses.reduce((sum, c) => sum + c.to - c.from, 0);
      expect(paused).toBeGreaterThan(150);
      expect(paused).toBeLessThan(260);
      // Never a word inside a cut.
      for (const c of pauses) {
        for (const [a, b] of f041.cues) expect(b <= c.from || a >= c.to).toBe(true);
      }
    });

    it('tightens a 3s gap and leaves a 2.5s breath alone', () => {
      const speech: Span[] = [...talk(0, 1000), [1001, 1010], [1013, 1020], [1022.5, 1030], ...talk(1030, 4000)];
      const plan = planTrim({ duration: 4000, speech, silences: [], freezes: [], keyframes: [], params: { minWorth: 0 } });
      expect(plan.kind === 'cut' && plan.cuts).toEqual([
        { from: 1010.4, to: 1012.4, kind: 'pause' },
      ]);
    });

    it('cuts a wordless stretch even when the screen moves (silent drawing is one tap away in the player)', () => {
      const speech = [...talk(0, 1000), ...talk(1200, 4000)];
      const plan = planTrim({ duration: 4000, speech, silences: [], freezes: [], keyframes: [] });
      expect(plan.kind === 'cut' && plan.cuts).toEqual([{ from: 1000.4, to: 1199.4, kind: 'pause' }]);
    });

    it('a transcript too thin to trust falls back to the freeze rule on audio silence', () => {
      // Words cover 28% of the class: a wrong language or a dropped feed.
      const speech: Span[] = [];
      for (let t = 0; t < 4000; t += 50) speech.push([t, t + 14]);
      const plan = planTrim({ duration: 4000, speech, silences: [], freezes: [], keyframes: [] });
      expect(plan).toEqual({ kind: 'skip', reason: 'NO_CUTS' });
      const withAudio = planTrim({
        duration: 4000, speech, silences: [[2015, 2049]], freezes: [[2015, 2049]], keyframes: [], params: { minWorth: 0 },
      });
      expect(withAudio.kind === 'cut' && withAudio.pauseRule).toBe('freeze_low_coverage');
      expect(withAudio.kind === 'cut' && withAudio.cuts).toEqual([{ from: 2016.5, to: 2047.5, kind: 'pause' }]);
    });

    it('handles hundreds of pauses and keeps the longest when capped', () => {
      const speech: Span[] = [];
      for (let t = 0; t < 4000; t += 10) speech.push([t, t + (t % 20 ? 6 : 5)]); // 4s and 5s gaps
      const plan = planTrim({ duration: 4000, speech, silences: [], freezes: [], keyframes: [] });
      expect(plan.kind === 'cut' && plan.cuts.length).toBe(399);
      const capped = planTrim({ duration: 4000, speech, silences: [], freezes: [], keyframes: [], params: { maxMidCuts: 10, minWorth: 0 } });
      if (capped.kind !== 'cut') throw new Error('expected a cut');
      expect(capped.cuts).toHaveLength(10);
      for (const c of capped.cuts) expect(c.to - c.from).toBeCloseTo(4, 6); // the 5s gaps
      expect(capped.cuts.map((c) => c.from)).toEqual([...capped.cuts.map((c) => c.from)].sort((a, b) => a - b));
    });

    it('keyframe snapping still never cuts into speech', () => {
      const speech: Span[] = [...talk(0, 1000), ...talk(1012, 4000)];
      const plan = planTrim({ duration: 4000, speech, silences: [], freezes: [], keyframes: [0, 1005, 1010], params: { minWorth: 0 } });
      expect(plan.kind === 'cut' && plan.cuts).toEqual([{ from: 1000.4, to: 1010, kind: 'pause' }]);
    });
  });

  it('refuses nonsense', () => {
    expect(planTrim(base({ duration: 0 }))).toEqual({ kind: 'skip', reason: 'NO_DURATION' });
    expect(planTrim(base({ speech: [[10, 11]] }))).toEqual({ kind: 'skip', reason: 'NO_SPEECH' });
  });
});
