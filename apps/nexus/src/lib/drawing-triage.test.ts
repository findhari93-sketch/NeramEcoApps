import { describe, it, expect } from 'vitest';
import { bandCounts, pickSpotCheck, triageDrawing, triageOrder, type TriageInput } from './drawing-triage';

const clear = { sharpness: 240, ink: 0.06, brightness: 160, aspect: 0.75, v: 1 as const };
const routine: TriageInput = { attemptCount: 1, quality: clear, threadRatings: [], recentRatings: [4, 3, 4] };

describe('triageDrawing', () => {
  it('calls a steady first attempt with a clear photo routine', () => {
    const t = triageDrawing(routine);
    expect(t.band).toBe('routine');
    expect(t.reasons).toEqual([]);
    expect(t.explainer).toBe('First attempt, clear photo, last 3 scores within one band (3 to 4).');
  });

  it('a redo attempt is never routine', () => {
    const t = triageDrawing({ ...routine, attemptCount: 2, threadRatings: [3] });
    expect(t.band).not.toBe('routine');
    expect(t.reasons.map((r) => r.code)).toContain('redo_attempt');
  });

  it('a low recent score is never routine', () => {
    for (const low of [1, 2]) {
      const t = triageDrawing({ ...routine, recentRatings: [4, low, 4] });
      expect(t.band).not.toBe('routine');
      expect(t.explainer).toContain(`Scored ${low} of 5`);
    }
  });

  it('flags a blank sheet', () => {
    const t = triageDrawing({ ...routine, quality: { ...clear, ink: 0.001 } });
    expect(t.band).toBe('flagged');
    expect(t.explainer).toBe('The photo looks like a blank sheet.');
  });

  it('does not flag the faintest real drawing seen in calibration', () => {
    expect(triageDrawing({ ...routine, quality: { ...clear, ink: 0.0198, sharpness: 65 } }).band).toBe('routine');
  });

  it('keeps the softest and darkest real photos routine', () => {
    expect(triageDrawing({ ...routine, quality: { ...clear, sharpness: 40.1 } }).band).toBe('routine');
    expect(triageDrawing({ ...routine, quality: { ...clear, brightness: 94.7 } }).band).toBe('routine');
  });

  it('asks for a look at a soft or dark photo, and flags an unreadable one', () => {
    expect(triageDrawing({ ...routine, quality: { ...clear, sharpness: 22 } }).band).toBe('needs_look');
    expect(triageDrawing({ ...routine, quality: { ...clear, brightness: 60 } }).band).toBe('needs_look');
    expect(triageDrawing({ ...routine, quality: { ...clear, sharpness: 9 } }).band).toBe('flagged');
  });

  it('never treats an unmeasured photo as a pass', () => {
    const t = triageDrawing({ ...routine, quality: null });
    expect(t.band).toBe('needs_look');
    expect(t.explainer).toBe('Photo not checked yet.');
  });

  it('flags a third attempt that did not improve', () => {
    const t = triageDrawing({ ...routine, attemptCount: 3, threadRatings: [2, 2] });
    expect(t.band).toBe('flagged');
    expect(t.explainer).toContain('Attempt 3, and the last redo scored no higher than the one before (2 then 2).');
  });

  it('a third attempt that improved still needs a look, not a flag', () => {
    expect(triageDrawing({ ...routine, attemptCount: 3, threadRatings: [2, 3] }).band).toBe('needs_look');
  });

  it('will not call a student steady on fewer than two reviews', () => {
    expect(triageDrawing({ ...routine, recentRatings: [] }).explainer).toBe('No earlier reviews to compare against.');
    expect(triageDrawing({ ...routine, recentRatings: [4] }).band).toBe('needs_look');
  });

  it('asks for a look when recent scores swing more than one band', () => {
    const t = triageDrawing({ ...routine, recentRatings: [5, 3, 4] });
    expect(t.band).toBe('needs_look');
    expect(t.explainer).toBe('Recent scores swing from 3 to 5.');
  });

  it('only looks at the last three scores', () => {
    expect(triageDrawing({ ...routine, recentRatings: [4, 4, 4, 1] }).band).toBe('routine');
  });

  it('every band carries a why-it-stopped sentence, never a bare number', () => {
    const cases: TriageInput[] = [
      routine,
      { ...routine, quality: null },
      { ...routine, quality: { ...clear, ink: 0 } },
      { ...routine, attemptCount: 4, threadRatings: [3, 3, 2] },
      { ...routine, recentRatings: [] },
      { ...routine, recentRatings: [1, 5] },
    ];
    for (const c of cases) {
      const { explainer } = triageDrawing(c);
      expect(explainer.trim().length).toBeGreaterThan(10);
      expect(explainer).not.toMatch(/^\s*[\d.%/]+\s*$/);
      expect(explainer).toMatch(/[a-z]{3,}/i);
    }
  });

  it('leads with the flagged reason when there are several', () => {
    const t = triageDrawing({ ...routine, attemptCount: 2, threadRatings: [3], quality: { ...clear, ink: 0 } });
    expect(t.explainer.startsWith('The photo looks like a blank sheet.')).toBe(true);
  });
});

describe('triageOrder and bandCounts', () => {
  const items = [
    { id: 'a', band: 'routine' as const, submittedAt: '2026-09-01' },
    { id: 'b', band: 'flagged' as const, submittedAt: '2026-09-03' },
    { id: 'c', band: 'needs_look' as const, submittedAt: '2026-09-02' },
    { id: 'd', band: 'flagged' as const, submittedAt: '2026-09-01' },
  ];

  it('puts flagged first and the oldest first within a band', () => {
    expect(triageOrder(items).map((i) => i.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('counts every band, including empty ones', () => {
    expect(bandCounts(items)).toEqual({ routine: 1, needs_look: 1, flagged: 2 });
    expect(bandCounts([])).toEqual({ routine: 0, needs_look: 0, flagged: 0 });
  });
});

describe('pickSpotCheck', () => {
  const ids = Array.from({ length: 30 }, (_, i) => `sub-${i}`);

  it('selects exactly five', () => {
    expect(pickSpotCheck(ids, 'batch-1')).toHaveLength(5);
  });

  it('selects all when there are fewer than five', () => {
    expect(pickSpotCheck(ids.slice(0, 3), 'batch-1').sort()).toEqual(ids.slice(0, 3).sort());
  });

  it('is deterministic for a given batch id', () => {
    expect(pickSpotCheck(ids, 'batch-1')).toEqual(pickSpotCheck([...ids].reverse(), 'batch-1'));
  });

  it('draws a different sample for a different batch', () => {
    expect(pickSpotCheck(ids, 'batch-1')).not.toEqual(pickSpotCheck(ids, 'batch-2'));
  });

  it('never picks the same sheet twice', () => {
    expect(new Set(pickSpotCheck([...ids, ...ids], 'x')).size).toBe(5);
  });
});
