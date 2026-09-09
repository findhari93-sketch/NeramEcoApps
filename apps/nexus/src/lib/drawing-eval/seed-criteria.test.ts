import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { MODEL_PRICING, RETIRED_MODELS } from '@neram/ai/pricing';

import {
  BAND_TODO,
  describeMissingBands,
  isReadyToActivate,
  placeholderBands,
  SEED_BRIEF_TYPES,
  seedBriefTypeByKey,
} from './seed-criteria';

describe('the seeded brief types', () => {
  it('covers the three with real graded depth in production', () => {
    expect(SEED_BRIEF_TYPES.map((b) => b.key)).toEqual([
      '3d_composition.still_life',
      '2d_composition.geometric_shapes',
      '2d_composition.logo',
    ]);
  });

  it('uses the sub_type values production actually stores', () => {
    // Getting one of these wrong makes every submission of that type resolve
    // to no brief type and silently stop being evaluable.
    const subTypes = SEED_BRIEF_TYPES.map((b) => b.subType);
    expect(subTypes).toEqual(['still_life', 'geometric_shapes', 'logo']);
  });

  it('keys each brief type as category.sub_type', () => {
    for (const brief of SEED_BRIEF_TYPES) {
      expect(brief.key).toBe(`${brief.category}.${brief.subType}`);
    }
  });

  it('gives every brief type at least four criteria with observable checks', () => {
    for (const brief of SEED_BRIEF_TYPES) {
      expect(brief.criteria.length).toBeGreaterThanOrEqual(4);
      for (const c of brief.criteria) {
        expect(c.observableChecks.length).toBeGreaterThan(0);
        for (const check of c.observableChecks) expect(check.trim().length).toBeGreaterThan(10);
      }
    }
  });

  it('has unique criterion keys within each brief type', () => {
    for (const brief of SEED_BRIEF_TYPES) {
      const keys = brief.criteria.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('puts depth and perspective on the 3D brief only', () => {
    for (const brief of SEED_BRIEF_TYPES) {
      const hasDepth = brief.criteria.some((c) => c.key === 'depth_perspective');
      expect(hasDepth).toBe(brief.category === '3d_composition');
    }
  });

  it('puts design principle on the 2D briefs only', () => {
    for (const brief of SEED_BRIEF_TYPES) {
      const hasPrinciple = brief.criteria.some((c) => c.key === 'design_principle');
      expect(hasPrinciple).toBe(brief.category === '2d_composition');
    }
  });

  it('looks up by key', () => {
    expect(seedBriefTypeByKey('2d_composition.logo')?.title).toBe('Logo design');
    expect(seedBriefTypeByKey('nope')).toBeUndefined();
  });
});

describe('the placeholder gate', () => {
  it('reports every band as outstanding while the seed is untouched', () => {
    for (const brief of SEED_BRIEF_TYPES) {
      for (const c of brief.criteria) {
        expect(placeholderBands(c.bandDescriptions)).toEqual(['1', '2', '3', '4', '5']);
      }
    }
  });

  it('refuses to activate a brief type whose bands are still placeholders', () => {
    for (const brief of SEED_BRIEF_TYPES) {
      expect(isReadyToActivate(brief.criteria)).toBe(false);
    }
  });

  it('still refuses when only one band of one criterion is left', () => {
    const criteria = [
      {
        key: 'composition',
        bandDescriptions: { '1': 'a', '2': 'b', '3': 'c', '4': 'd', '5': BAND_TODO },
      },
    ];
    expect(isReadyToActivate(criteria)).toBe(false);
    expect(describeMissingBands(criteria)[0]).toMatch(/composition: bands 5/);
  });

  it('treats an empty string as unwritten, not as written', () => {
    expect(placeholderBands({ '1': 'a', '2': '  ', '3': 'c', '4': 'd', '5': 'e' })).toEqual(['2']);
  });

  it('activates once every band carries real words', () => {
    const criteria = [
      { key: 'composition', bandDescriptions: { '1': 'a', '2': 'b', '3': 'c', '4': 'd', '5': 'e' } },
      { key: 'proportion', bandDescriptions: { '1': 'a', '2': 'b', '3': 'c', '4': 'd', '5': 'e' } },
    ];
    expect(isReadyToActivate(criteria)).toBe(true);
    expect(describeMissingBands(criteria)).toEqual([]);
  });

  it('never activates an empty criterion list', () => {
    expect(isReadyToActivate([])).toBe(false);
  });
});

/**
 * Structural guardrail rather than a behaviour test.
 *
 * Naming a model inline is exactly how five call sites in this repo ended up
 * pinned to models Google had already shut down. Tier lives in the AI feature
 * registry; nothing under drawing-eval gets to pick.
 */
describe('no model id leaks out of the tier system', () => {
  const dir = __dirname;

  function sourceFiles(): string[] {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => join(dir, f));
  }

  it('mentions no known or retired Gemini model id', () => {
    const known = [...Object.keys(MODEL_PRICING), ...Object.keys(RETIRED_MODELS)];
    expect(known.length).toBeGreaterThan(0);

    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const model of known) {
        expect(source, `${file} names the model ${model}`).not.toContain(model);
      }
    }
  });

  it('calls no model endpoint directly', () => {
    // Asserted on the subdomain rather than the full host: ESLint bans that
    // exact literal app-wide, and this file should not be the one exception.
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} reaches Google directly`).not.toContain('generativelanguage');
      expect(source, `${file} builds a model URL by hand`).not.toContain('/v1beta/models/');
    }
  });
});
