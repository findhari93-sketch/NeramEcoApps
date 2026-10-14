import { describe, it, expect } from 'vitest';
import { createStepClassifier, type PlaybackSample } from './playback-steps';

const at = (t: number, wallSeconds: number, extra: Partial<PlaybackSample> = {}): PlaybackSample => ({
  t,
  wall: wallSeconds * 1000,
  playing: true,
  rate: 1,
  ...extra,
});

/** Feed samples and add up what was credited and what was thrown away. */
function run(samples: PlaybackSample[], discontinuities: number[] = []) {
  const c = createStepClassifier();
  let played = 0;
  let discarded = 0;
  samples.forEach((s, i) => {
    if (discontinuities.includes(i)) c.markDiscontinuity();
    const step = c.observe(s);
    if (step.kind === 'played') played += step.to - step.from;
    if (step.kind === 'discarded') discarded += step.seconds;
  });
  return { played: Math.round(played * 100) / 100, discarded: Math.round(discarded * 100) / 100 };
}

describe('createStepClassifier', () => {
  it('credits ordinary playback ticked four times a second', () => {
    const samples = Array.from({ length: 41 }, (_, i) => at(100 + i * 0.25, i * 0.25));
    expect(run(samples)).toEqual({ played: 10, discarded: 0 });
  });

  it('still credits a step that arrived late because the page was busy', () => {
    // The old two second rule threw this away, and with it the student's 80%.
    expect(run([at(100, 0), at(100.25, 0.25), at(103.5, 3.5), at(103.75, 3.75)])).toEqual({
      played: 3.75,
      discarded: 0,
    });
  });

  it('throws away a jump with no time behind it', () => {
    expect(run([at(100, 0), at(100.25, 0.25), at(110.25, 0.5), at(110.5, 0.75)])).toEqual({
      played: 0.5,
      discarded: 10,
    });
  });

  it('allows for the playback rate', () => {
    expect(run([at(100, 0, { rate: 2 }), at(104, 2, { rate: 2 })]).played).toBe(4);
    expect(run([at(100, 0), at(104, 2)]).discarded).toBe(4);
  });

  it('ignores a stall, a pause, and anything backwards', () => {
    expect(run([at(100, 0), at(100, 5), at(100.25, 5.25)])).toEqual({ played: 0.25, discarded: 0 });
    expect(run([at(100, 0, { playing: false }), at(105, 5)])).toEqual({ played: 0, discarded: 0 });
    expect(run([at(100, 0), at(90, 0.25), at(90.25, 0.5)])).toEqual({ played: 0.25, discarded: 0 });
  });

  it('starts afresh after a discontinuity, so a seek is never a step', () => {
    expect(run([at(100, 0), at(100.25, 0.25), at(101, 10), at(101.25, 10.25)], [2])).toEqual({
      played: 0.5,
      discarded: 0,
    });
  });

  it('never credits more than two minutes in one step', () => {
    expect(run([at(0, 0), at(600, 600)]).discarded).toBe(600);
  });

  it('ignores nonsense positions', () => {
    expect(run([at(100, 0), at(Number.NaN, 0.25), at(100.5, 0.5)]).played).toBe(0.5);
  });
});
