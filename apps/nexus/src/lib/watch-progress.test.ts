import { describe, it, expect } from 'vitest';
import { createWatchAccumulator, MAX_TICK_GAP_SECONDS } from './watch-progress';

/** A run of realistic <video> timeupdate ticks, 250ms apart. */
function play(acc: ReturnType<typeof createWatchAccumulator>, from: number, to: number) {
  for (let t = from; t <= to; t += 0.25) acc.record(t, 600);
}

describe('watched time is not the same thing as position', () => {
  it('counts genuine playback', () => {
    const acc = createWatchAccumulator();
    play(acc, 0, 10);
    const { position, watchedDelta } = acc.snapshot();
    expect(position).toBeCloseTo(10, 1);
    expect(watchedDelta).toBeCloseTo(10, 1);
  });

  it('does NOT count a forward scrub as watching', () => {
    const acc = createWatchAccumulator();
    acc.record(0, 600);
    acc.record(600, 600); // dragged the scrubber to the end in one gesture

    const { position, watchedDelta } = acc.snapshot();
    // The resume point follows them...
    expect(position).toBe(600);
    // ...but nothing was actually watched, which is what any gate must read.
    expect(watchedDelta).toBe(0);
  });

  it('ignores a gap larger than the seek threshold', () => {
    const acc = createWatchAccumulator();
    acc.record(0, 600);
    acc.record(MAX_TICK_GAP_SECONDS + 0.5, 600);
    expect(acc.snapshot().watchedDelta).toBe(0);
  });

  it('counts a gap exactly at the threshold, since that is still plausible playback', () => {
    const acc = createWatchAccumulator();
    acc.record(0, 600);
    acc.record(MAX_TICK_GAP_SECONDS, 600);
    expect(acc.snapshot().watchedDelta).toBeCloseTo(MAX_TICK_GAP_SECONDS, 5);
  });

  it('does not accumulate while paused (repeated identical ticks)', () => {
    const acc = createWatchAccumulator();
    play(acc, 0, 5);
    const before = acc.snapshot().watchedDelta;
    for (let i = 0; i < 20; i++) acc.record(5, 600);
    expect(acc.snapshot().watchedDelta).toBeCloseTo(before, 5);
  });

  it('accumulates across a rewatch instead of double-charging position', () => {
    const acc = createWatchAccumulator();
    play(acc, 0, 30);
    acc.record(10, 600); // sent back to rewatch the segment
    play(acc, 10, 30);

    const { position, watchedDelta } = acc.snapshot();
    expect(position).toBeCloseTo(30, 1); // high-water, unchanged by the rewind
    expect(watchedDelta).toBeGreaterThan(45); // 30 watched, then 20 more
  });
});

describe('position is a high-water mark so scrubbing back is free', () => {
  it('never decreases when the student seeks backwards', () => {
    const acc = createWatchAccumulator();
    play(acc, 0, 100);
    expect(acc.snapshot().position).toBeCloseTo(100, 1);

    acc.record(12, 600); // jumped back to re-hear something
    expect(acc.snapshot().position).toBeCloseTo(100, 1);
  });

  it('starts at zero rather than at the stored value, so a server reset holds', () => {
    // After a failed class test the server zeroes the stored position to force a
    // rewatch. A fresh accumulator must not resurrect the old value.
    const acc = createWatchAccumulator();
    expect(acc.snapshot().position).toBe(0);
    play(acc, 0, 3);
    expect(acc.snapshot().position).toBeLessThan(5);
  });
});

describe('flush bookkeeping', () => {
  it('has nothing pending before any tick', () => {
    expect(createWatchAccumulator().hasPending()).toBe(false);
  });

  it('clears the delta but keeps position and duration', () => {
    const acc = createWatchAccumulator();
    play(acc, 0, 10);
    acc.markFlushed();

    const { position, watchedDelta, duration } = acc.snapshot();
    expect(watchedDelta).toBe(0);
    expect(position).toBeCloseTo(10, 1);
    expect(duration).toBe(600);
    expect(acc.hasPending()).toBe(false);
  });

  it('is pending again after further playback', () => {
    const acc = createWatchAccumulator();
    play(acc, 0, 10);
    acc.markFlushed();
    play(acc, 10, 12);
    expect(acc.hasPending()).toBe(true);
    expect(acc.snapshot().watchedDelta).toBeCloseTo(2, 1);
  });

  it('is pending after a pure forward seek, so the resume point still saves', () => {
    const acc = createWatchAccumulator();
    acc.record(0, 600);
    acc.markFlushed();
    acc.record(400, 600);
    expect(acc.snapshot().watchedDelta).toBe(0);
    expect(acc.hasPending()).toBe(true);
  });
});

describe('junk from the player is ignored', () => {
  it('survives NaN duration before metadata loads', () => {
    const acc = createWatchAccumulator();
    acc.record(1, Number.NaN);
    acc.record(2, 0);
    expect(acc.snapshot().duration).toBe(0);
    expect(acc.snapshot().position).toBe(2);
  });

  it('keeps the last known duration once one has been reported', () => {
    const acc = createWatchAccumulator();
    acc.record(1, 600);
    acc.record(2, 0);
    expect(acc.snapshot().duration).toBe(600);
  });

  it('ignores NaN and negative positions', () => {
    const acc = createWatchAccumulator();
    play(acc, 0, 5);
    const before = acc.snapshot();
    acc.record(Number.NaN, 600);
    acc.record(-10, 600);
    expect(acc.snapshot().position).toBeCloseTo(before.position, 5);
    expect(acc.snapshot().watchedDelta).toBeCloseTo(before.watchedDelta, 5);
  });
});
