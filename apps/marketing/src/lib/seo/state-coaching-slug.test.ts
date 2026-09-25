import { describe, it, expect } from 'vitest';
import { parseStateCoachingSlug, stateCoachingPath, stateCoachingSegment } from './state-coaching-slug';

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
