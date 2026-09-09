import { describe, it, expect } from 'vitest';

import goodResponse from './__fixtures__/still-life-good.json';
import percentResponse from './__fixtures__/percent-coordinates.json';
import { detectScale, parseEvaluation, RESPONSE_SCHEMA } from './schema';

const STILL_LIFE_KEYS = [
  'composition',
  'proportion',
  'depth_perspective',
  'tonal_quality',
  'line_quality',
];

const GEOMETRIC_KEYS = [
  'composition',
  'proportion',
  'design_principle',
  'tonal_quality',
  'line_quality',
];

/** Replay a recorded response exactly as the model would have returned it. */
function replay(fixture: unknown): string {
  return JSON.stringify(fixture);
}

describe('parseEvaluation, on a well-formed response', () => {
  const outcome = parseEvaluation(replay(goodResponse), STILL_LIFE_KEYS);

  it('accepts it', () => {
    expect(outcome.ok).toBe(true);
  });

  it('returns every criterion once, in the expected set', () => {
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.value.criteria.map((c) => c.criterionKey).sort()).toEqual(
      [...STILL_LIFE_KEYS].sort(),
    );
  });

  it('averages the bands into a 1 to 5 total', () => {
    if (!outcome.ok) throw new Error('expected ok');
    // 4 + 3 + 3 + 4 + 3 = 17 over 5.
    expect(outcome.value.totalScore).toBe(3.4);
  });

  it('keeps geometry as fractions of the image', () => {
    if (!outcome.ok) throw new Error('expected ok');
    for (const c of outcome.value.criteria) {
      for (const a of c.annotations) {
        expect(a.geometry.x).toBeGreaterThanOrEqual(0);
        expect(a.geometry.y).toBeGreaterThanOrEqual(0);
        expect(a.geometry.x + a.geometry.width).toBeLessThanOrEqual(1.0001);
        expect(a.geometry.y + a.geometry.height).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('stamps every annotation with the criterion it belongs to', () => {
    if (!outcome.ok) throw new Error('expected ok');
    for (const c of outcome.value.criteria) {
      for (const a of c.annotations) expect(a.criterionKey).toBe(c.criterionKey);
    }
  });
});

describe('coordinate scale', () => {
  it('reads a set of fractions as fractions', () => {
    expect(detectScale([0, 0.25, 0.5, 1])).toBe('fraction');
  });

  it('reads anything above 1 but inside 100 as percent', () => {
    expect(detectScale([25, 30, 40, 35])).toBe('percent');
  });

  it('refuses to guess at pixel scale', () => {
    expect(detectScale([120, 340, 800, 600])).toBe('unknown');
  });

  it('refuses negatives', () => {
    expect(detectScale([-5, 0.2, 0.3, 0.1])).toBe('unknown');
  });

  it('treats an empty set as unknown rather than assuming', () => {
    expect(detectScale([])).toBe('unknown');
  });

  it('converts a whole percent response and says that it did', () => {
    const outcome = parseEvaluation(replay(percentResponse), GEOMETRIC_KEYS);
    if (!outcome.ok) throw new Error(`expected ok, got ${outcome.errors.join(' ')}`);

    const composition = outcome.value.criteria.find((c) => c.criterionKey === 'composition')!;
    expect(composition.annotations[0].geometry).toEqual({
      x: 0.25, y: 0.3, width: 0.4, height: 0.35,
    });
    expect(outcome.notes.join(' ')).toMatch(/percent/i);
  });
});

describe('parseEvaluation, on responses that must not be stored', () => {
  it('rejects text that is not JSON', () => {
    const outcome = parseEvaluation('Here is my evaluation of the sheet:', STILL_LIFE_KEYS);
    expect(outcome.ok).toBe(false);
  });

  it('rejects truncated JSON rather than salvaging part of it', () => {
    const truncated = replay(goodResponse).slice(0, 400);
    const outcome = parseEvaluation(truncated, STILL_LIFE_KEYS);
    expect(outcome.ok).toBe(false);
  });

  it('rejects a response missing a criterion, because a partial draft is unusable', () => {
    const partial = {
      ...goodResponse,
      criteria: (goodResponse as any).criteria.slice(0, 3),
    };
    const outcome = parseEvaluation(replay(partial), STILL_LIFE_KEYS);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/Missing criteria/);
  });

  it('rejects an invented criterion key rather than filing a band under it', () => {
    const invented = {
      ...goodResponse,
      criteria: [
        ...(goodResponse as any).criteria,
        {
          criterionKey: 'artistic_flair',
          band: 5,
          reasoning: 'Lovely.',
          closestAnchorBand: 5,
          confidence: 'high',
          annotations: [],
        },
      ],
    };
    const outcome = parseEvaluation(replay(invented), STILL_LIFE_KEYS);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/artistic_flair/);
  });

  it('rejects an empty criteria array', () => {
    const outcome = parseEvaluation(JSON.stringify({ criteria: [], overallComment: 'x' }), STILL_LIFE_KEYS);
    expect(outcome.ok).toBe(false);
  });

  it('rejects a band outside 1 to 5', () => {
    const bad = {
      ...goodResponse,
      criteria: (goodResponse as any).criteria.map((c: any, i: number) =>
        i === 0 ? { ...c, band: 9 } : c,
      ),
    };
    const outcome = parseEvaluation(replay(bad), STILL_LIFE_KEYS);
    expect(outcome.ok).toBe(false);
  });

  it('rejects a criterion with no reasoning, since the score would be undefendable', () => {
    const bad = {
      ...goodResponse,
      criteria: (goodResponse as any).criteria.map((c: any, i: number) =>
        i === 0 ? { ...c, reasoning: '   ' } : c,
      ),
    };
    const outcome = parseEvaluation(replay(bad), STILL_LIFE_KEYS);
    expect(outcome.ok).toBe(false);
  });

  it('rejects a duplicated criterion', () => {
    const dup = {
      ...goodResponse,
      criteria: [(goodResponse as any).criteria[0], ...(goodResponse as any).criteria],
    };
    const outcome = parseEvaluation(replay(dup), STILL_LIFE_KEYS);
    expect(outcome.ok).toBe(false);
  });
});

describe('parseEvaluation, on salvageable imperfections', () => {
  it('drops one unusable box but keeps the criterion, and records the drop', () => {
    const bad = {
      ...goodResponse,
      criteria: (goodResponse as any).criteria.map((c: any) =>
        c.criterionKey === 'composition'
          ? {
              ...c,
              annotations: [
                { geometry: [0.1, 0.1], marker: 'problem', comment: 'wrong arity' },
                ...c.annotations,
              ],
            }
          : c,
      ),
    };
    const outcome = parseEvaluation(replay(bad), STILL_LIFE_KEYS);
    if (!outcome.ok) throw new Error('expected ok');

    const composition = outcome.value.criteria.find((c) => c.criterionKey === 'composition')!;
    expect(composition.annotations).toHaveLength(2);
    expect(outcome.notes.join(' ')).toMatch(/unusable annotation/i);
  });

  it('drops a zero-area box', () => {
    const bad = {
      ...goodResponse,
      criteria: (goodResponse as any).criteria.map((c: any) =>
        c.criterionKey === 'proportion'
          ? { ...c, annotations: [{ geometry: [0.5, 0.5, 0, 0.2], marker: 'note', comment: 'x' }] }
          : c,
      ),
    };
    const outcome = parseEvaluation(replay(bad), STILL_LIFE_KEYS);
    if (!outcome.ok) throw new Error('expected ok');
    const proportion = outcome.value.criteria.find((c) => c.criterionKey === 'proportion')!;
    expect(proportion.annotations).toHaveLength(0);
  });

  it('trims a box that runs slightly past the edge rather than discarding it', () => {
    const bad = {
      ...goodResponse,
      criteria: (goodResponse as any).criteria.map((c: any) =>
        c.criterionKey === 'proportion'
          ? { ...c, annotations: [{ geometry: [0.9, 0.9, 0.4, 0.4], marker: 'note', comment: 'edge' }] }
          : c,
      ),
    };
    const outcome = parseEvaluation(replay(bad), STILL_LIFE_KEYS);
    if (!outcome.ok) throw new Error('expected ok');
    const proportion = outcome.value.criteria.find((c) => c.criterionKey === 'proportion')!;
    expect(proportion.annotations).toHaveLength(1);
    expect(proportion.annotations[0].geometry.width).toBeCloseTo(0.1, 6);
  });

  it('falls back to low confidence when the model omits it', () => {
    const bad = {
      ...goodResponse,
      criteria: (goodResponse as any).criteria.map((c: any) => ({ ...c, confidence: 'certain' })),
    };
    const outcome = parseEvaluation(replay(bad), STILL_LIFE_KEYS);
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.value.criteria.every((c) => c.confidence === 'low')).toBe(true);
  });

  it('falls back closestAnchorBand to the band itself when it is missing', () => {
    const bad = {
      ...goodResponse,
      criteria: (goodResponse as any).criteria.map((c: any) => ({ ...c, closestAnchorBand: null })),
    };
    const outcome = parseEvaluation(replay(bad), STILL_LIFE_KEYS);
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.value.criteria.every((c) => c.closestAnchorBand === c.band)).toBe(true);
  });
});

describe('RESPONSE_SCHEMA', () => {
  it('constrains the model to the criterion fields the parser requires', () => {
    const item = (RESPONSE_SCHEMA as any).properties.criteria.items;
    expect(item.required).toContain('criterionKey');
    expect(item.required).toContain('band');
    expect(item.required).toContain('closestAnchorBand');
  });

  it('spells out the coordinate convention in the geometry description', () => {
    const geometry = (RESPONSE_SCHEMA as any).properties.criteria.items.properties.annotations.items
      .properties.geometry;
    expect(geometry.description).toMatch(/between 0 and 1/i);
    expect(geometry.description).toMatch(/top-left/i);
  });
});
