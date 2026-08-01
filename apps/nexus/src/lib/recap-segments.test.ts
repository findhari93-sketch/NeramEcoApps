import { describe, it, expect } from 'vitest';
import { planSegments, describeWindow, SNAP_WINDOW_SECONDS } from './recap-segments';
import type { TranscriptEntry } from '@neram/database';

/** Cues from [start, end] pairs. Anything not listed is silence. */
function cues(spec: Array<[number, number]>): TranscriptEntry[] {
  return spec.map(([start, end]) => ({ start, end, text: 'the tutor is talking' })) as TranscriptEntry[];
}

/** Back-to-back cues of `step` seconds, so there is no pause to snap to. */
function continuous(durationSeconds: number, step = 10): TranscriptEntry[] {
  const out: Array<[number, number]> = [];
  for (let t = 0; t < durationSeconds; t += step) {
    out.push([t, Math.min(t + step, durationSeconds)]);
  }
  return cues(out);
}

describe('planSegments', () => {
  it('divides a one hour class into four fifteen minute checkpoints', () => {
    const segments = planSegments(continuous(3600), 3600, 900);
    expect(segments).toHaveLength(4);
    expect(segments.map((s) => s.end - s.start)).toEqual([900, 900, 900, 900]);
  });

  it('divides a ninety minute class into six, which used to overrun the call budget', () => {
    // At the old 300s target this became eighteen segments, needing six Gemini
    // calls against a ceiling of five. The tail came back empty and the whole
    // recap was then held for thin questions.
    const segments = planSegments(continuous(5400), 5400, 900);
    expect(segments).toHaveLength(6);
  });

  it('covers the class exactly, in order, with no gaps or overlaps', () => {
    const segments = planSegments(continuous(3600), 3600, 900);
    expect(segments[0].start).toBe(0);
    expect(segments[segments.length - 1].end).toBe(3600);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].start).toBe(segments[i - 1].end);
    }
    const covered = segments.reduce((n, s) => n + (s.end - s.start), 0);
    expect(covered).toBe(3600);
  });

  it('slides a boundary onto a real pause', () => {
    // Ideal boundary is 900. There is a ten second silence ending at 880.
    const transcript = cues([
      [0, 500],
      [500, 870],
      [880, 1400],
      [1400, 1800],
    ]);
    const segments = planSegments(transcript, 1800, 900);
    expect(segments).toHaveLength(2);
    expect(segments[0].end).toBe(880);
    expect(segments[1].start).toBe(880);
  });

  it('ignores a pause outside the snap window', () => {
    // The only silence resumes at 700, which is 200s from the ideal 900.
    const transcript = cues([
      [0, 690],
      [700, 1800],
    ]);
    const segments = planSegments(transcript, 1800, 900);
    expect(segments[0].end).toBe(900);
  });

  it('does not drift when the tutor never pauses', () => {
    // Without a minimum pause length this would snap to whichever cue happened
    // to sit at the far edge of the window, moving the boundary 90s for nothing.
    const segments = planSegments(continuous(1800, 10), 1800, 900);
    expect(segments[0].end).toBe(900);
  });

  it('prefers the longer silence, and breaks a tie by closeness', () => {
    const longer = planSegments(
      cues([
        [0, 875],
        [880, 908],
        [915, 1800],
      ]),
      1800,
      900,
    );
    // Gaps of 5s (resume 880) and 7s (resume 915). The longer one wins.
    expect(longer[0].end).toBe(915);

    const tied = planSegments(
      cues([
        [0, 875],
        [880, 910],
        [915, 1800],
      ]),
      1800,
      900,
    );
    // Both gaps are 5s, so the one nearer the ideal 900 wins.
    expect(tied[0].end).toBe(915);
  });

  it('never returns fewer than two segments', () => {
    // One checkpoint at the end of a video is a test, not a set of checkpoints:
    // it says nothing about whether the middle was watched.
    const segments = planSegments(continuous(600), 600, 900);
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps every segment positive on a class shorter than the target', () => {
    // The snap window has to shrink here, or a 90s slide could jump a boundary
    // past its neighbour and invert the segments.
    const segments = planSegments(continuous(360), 360, 900);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    for (const s of segments) expect(s.end).toBeGreaterThan(s.start);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].start).toBe(segments[i - 1].end);
    }
  });

  it('falls back to the last transcript cue when the duration is unknown', () => {
    // The common case: recording_duration_minutes is NULL on every class Teams
    // has synced so far.
    const segments = planSegments(continuous(1800), 0, 900);
    expect(segments[segments.length - 1].end).toBe(1800);
  });

  it('returns nothing when there is no duration at all', () => {
    expect(planSegments([], 0, 900)).toEqual([]);
  });

  it('keeps boundaries strictly increasing across many segments', () => {
    const transcript = cues([]);
    const long = continuous(7200, 7);
    for (const t of [...transcript, ...long]) void t;
    const segments = planSegments(long, 7200, 900);
    expect(segments).toHaveLength(8);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].start).toBeGreaterThan(segments[i - 1].start);
    }
  });

  it('never slides a boundary further than the snap window', () => {
    const transcript = cues([
      [0, 400],
      [820, 1800],
    ]);
    const segments = planSegments(transcript, 1800, 900);
    expect(Math.abs(segments[0].end - 900)).toBeLessThanOrEqual(SNAP_WINDOW_SECONDS);
  });
});

describe('describeWindow', () => {
  it('reads as a clock', () => {
    expect(describeWindow(0, 900)).toBe('0:00 to 15:00');
    expect(describeWindow(905, 1810)).toBe('15:05 to 30:10');
  });
});
