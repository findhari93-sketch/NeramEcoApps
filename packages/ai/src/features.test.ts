import { describe, it, expect } from 'vitest';
import {
  AI_FEATURES,
  DEFAULT_AI_CONTROLS,
  featureById,
  modeFor,
  resolveControls,
} from './features';

describe('the registry', () => {
  it('has no duplicate ids, which would merge two features on the panel', () => {
    const ids = AI_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never lets a public chatbot claim it supports manual mode', () => {
    // A visitor cannot be handed a prompt to run themselves, so their only
    // states are auto and off.
    for (const f of AI_FEATURES) {
      if (f.trigger === 'public') expect(f.supportsManual).toBe(false);
    }
  });

  it('keeps the free key away from anything carrying student data', () => {
    // Free tier inputs are used by Google to improve their products.
    for (const f of AI_FEATURES) {
      if (f.app === 'nexus') expect(f.allowFreeKey).toBe(false);
    }
  });
});

describe('resolveControls', () => {
  it('falls back to the defaults when nothing is stored', () => {
    expect(resolveControls(null)).toEqual(DEFAULT_AI_CONTROLS);
    expect(resolveControls(undefined)).toEqual(DEFAULT_AI_CONTROLS);
    expect(resolveControls({})).toEqual(DEFAULT_AI_CONTROLS);
  });

  it('merges a partial over the defaults', () => {
    const controls = resolveControls({ dailyCapUsd: 10 });
    expect(controls.dailyCapUsd).toBe(10);
    expect(controls.monthlyCapUsd).toBe(DEFAULT_AI_CONTROLS.monthlyCapUsd);
  });

  it('ignores a nonsense cap rather than trusting it', () => {
    // A NaN or negative cap read as "spend nothing" would break every feature,
    // and read as "spend anything" would be worse.
    expect(resolveControls({ dailyCapUsd: -5 }).dailyCapUsd).toBe(
      DEFAULT_AI_CONTROLS.dailyCapUsd
    );
    expect(resolveControls({ monthlyCapUsd: 'lots' }).monthlyCapUsd).toBe(
      DEFAULT_AI_CONTROLS.monthlyCapUsd
    );
  });

  it('accepts a cap of zero, which is a valid way to stop spending', () => {
    expect(resolveControls({ dailyCapUsd: 0 }).dailyCapUsd).toBe(0);
  });
});

describe('modeFor', () => {
  const base = { ...DEFAULT_AI_CONTROLS };

  it('uses the feature default when there is no override', () => {
    expect(modeFor('nexus.chapter-test', base)).toBe('auto');
  });

  it('honours an override', () => {
    expect(modeFor('nexus.chapter-test', { ...base, modes: { 'nexus.chapter-test': 'manual' } })).toBe(
      'manual'
    );
  });

  it('turns everything off when the master switch is off', () => {
    const off = { ...base, masterEnabled: false, modes: { 'nexus.chapter-test': 'auto' as const } };
    expect(modeFor('nexus.chapter-test', off)).toBe('off');
  });

  it('refuses an unknown id instead of letting it through', () => {
    // The inverse of isFeatureEnabled() in feature-flags.ts, on purpose: an
    // unrecognised nav path should still render, but an unrecognised id asking
    // to spend money is a bug, and a bug should not bill.
    expect(modeFor('nexus.made-up', base)).toBe('off');
  });
});

describe('featureById', () => {
  it('finds a real feature and its app', () => {
    expect(featureById('marketing.site-chat')?.app).toBe('marketing');
  });

  it('returns undefined for a made-up one', () => {
    expect(featureById('nope')).toBeUndefined();
  });
});
