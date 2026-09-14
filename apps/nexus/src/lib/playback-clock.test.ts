import { describe, expect, it } from 'vitest';
import { advanceClock, CATCH_UP_TOLERANCE_MS, MAX_EXTRAPOLATION_MS, type ClockState } from './playback-clock';

const base = { rate: 1, playing: true, durationMs: 10_000 };

describe('advanceClock', () => {
  it('starts on the element time', () => {
    const s = advanceClock(null, { ...base, audioMs: 1200, now: 50 });
    expect(s.outMs).toBe(1200);
  });

  it('runs on between coarse currentTime steps', () => {
    let s = advanceClock(null, { ...base, audioMs: 1000, now: 0 });
    s = advanceClock(s, { ...base, audioMs: 1000, now: 16 });
    expect(s.outMs).toBe(1016);
    s = advanceClock(s, { ...base, audioMs: 1000, now: 100 });
    expect(s.outMs).toBe(1100);
  });

  it('respects the playback rate', () => {
    let s = advanceClock(null, { ...base, rate: 2, audioMs: 0, now: 0 });
    s = advanceClock(s, { ...base, rate: 2, audioMs: 0, now: 50 });
    expect(s.outMs).toBe(100);
  });

  it('never steps back a little when the element catches up', () => {
    let s = advanceClock(null, { ...base, audioMs: 1000, now: 0 });
    s = advanceClock(s, { ...base, audioMs: 1000, now: 120 });
    expect(s.outMs).toBe(1120);
    // The element reports 1100: behind what was painted, within tolerance.
    s = advanceClock(s, { ...base, audioMs: 1100, now: 121 });
    expect(s.outMs).toBe(1120);
    s = advanceClock(s, { ...base, audioMs: 1100, now: 141 });
    expect(s.outMs).toBe(1140);
  });

  it('snaps to a real backwards seek', () => {
    let s = advanceClock(null, { ...base, audioMs: 5000, now: 0 });
    s = advanceClock(s, { ...base, audioMs: 5000 - CATCH_UP_TOLERANCE_MS - 500, now: 10 });
    expect(s.outMs).toBe(5000 - CATCH_UP_TOLERANCE_MS - 500);
  });

  it('snaps to a forward jump', () => {
    let s = advanceClock(null, { ...base, audioMs: 1000, now: 0 });
    s = advanceClock(s, { ...base, audioMs: 4000, now: 10 });
    expect(s.outMs).toBe(4000);
  });

  it('waits for the voice when the element stalls', () => {
    let s = advanceClock(null, { ...base, audioMs: 2000, now: 0 });
    s = advanceClock(s, { ...base, audioMs: 2000, now: 2000 });
    expect(s.outMs).toBe(2000 + MAX_EXTRAPOLATION_MS);
  });

  it('holds exactly on the element time while paused', () => {
    const prev: ClockState = { audioMs: 1000, anchoredAt: 0, outMs: 1300 };
    const s = advanceClock(prev, { ...base, playing: false, audioMs: 1000, now: 900 });
    expect(s.outMs).toBe(1000);
  });

  it('never passes the end of the note', () => {
    let s = advanceClock(null, { ...base, durationMs: 1050, audioMs: 1000, now: 0 });
    s = advanceClock(s, { ...base, durationMs: 1050, audioMs: 1000, now: 200 });
    expect(s.outMs).toBe(1050);
  });
});
