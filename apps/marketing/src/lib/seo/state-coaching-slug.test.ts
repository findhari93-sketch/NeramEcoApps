import { describe, it, expect } from 'vitest';
import { parseCoachingStateSegment, parseStateCoachingSlug, stateCoachingPath, stateCoachingSegment } from './state-coaching-slug';

describe('parseStateCoachingSlug', () => {
  it('reads the state out of the public URL segment', () => {
    expect(parseStateCoachingSlug('nata-coaching-in-tamil-nadu')).toBe('tamil-nadu');
    expect(parseStateCoachingSlug('nata-coaching-in-kerala')).toBe('kerala');
  });

  it('is null for segments that are not state hubs, so the page can 404', () => {
    expect(parseStateCoachingSlug('nata-coaching-in-')).toBeNull();
    expect(parseStateCoachingSlug('nata-coaching-xyz')).toBeNull();
    expect(parseStateCoachingSlug('best-nata-coaching-chennai')).toBeNull();
    expect(parseStateCoachingSlug('nata-coaching-in-Tamil Nadu')).toBeNull();
    expect(parseStateCoachingSlug(undefined)).toBeNull();
  });

  it('round-trips with the path builder', () => {
    expect(stateCoachingPath('goa')).toBe('/coaching/nata-coaching-in-goa');
    expect(parseStateCoachingSlug(stateCoachingSegment('west-bengal'))).toBe('west-bengal');
  });
});

describe('parseCoachingStateSegment', () => {
  it('reads both exams', () => {
    expect(parseCoachingStateSegment('nata-coaching-in-kerala')).toEqual({ exam: 'nata', stateSlug: 'kerala' });
    expect(parseCoachingStateSegment('jee-paper-2-coaching-in-tamil-nadu')).toEqual({ exam: 'jee-paper-2', stateSlug: 'tamil-nadu' });
  });

  it('keeps the NATA-only parser NATA-only', () => {
    expect(parseStateCoachingSlug('jee-paper-2-coaching-in-kerala')).toBeNull();
  });

  it('builds JEE paths', () => {
    expect(stateCoachingPath('goa', 'jee-paper-2')).toBe('/coaching/jee-paper-2-coaching-in-goa');
    expect(parseCoachingStateSegment(stateCoachingSegment('goa', 'jee-paper-2'))).toEqual({ exam: 'jee-paper-2', stateSlug: 'goa' });
  });

  it('is null for anything else', () => {
    expect(parseCoachingStateSegment('jee-paper-2-coaching-in-')).toBeNull();
    expect(parseCoachingStateSegment('best-nata-coaching-chennai')).toBeNull();
    expect(parseCoachingStateSegment(42)).toBeNull();
  });
});
