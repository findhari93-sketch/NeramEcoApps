import { describe, expect, it } from 'vitest';
import { extractCollegeSlug } from './slug';

describe('extractCollegeSlug', () => {
  it('returns slug for /colleges/[state]/[slug]', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/colleges/tamil-nadu/papni-architecture')
    ).toBe('papni-architecture');
  });

  it('returns slug for locale-prefixed path', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/en/colleges/tamil-nadu/papni-architecture')
    ).toBe('papni-architecture');
  });

  it('returns slug for /ta/colleges/.../slug', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/ta/colleges/kerala/college-of-architecture-trivandrum')
    ).toBe('college-of-architecture-trivandrum');
  });

  it('strips query string', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/colleges/tamil-nadu/papni-architecture?from=hub')
    ).toBe('papni-architecture');
  });

  it('strips hash', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/colleges/tamil-nadu/papni-architecture#fees')
    ).toBe('papni-architecture');
  });

  it('handles trailing slash', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/colleges/tamil-nadu/papni-architecture/')
    ).toBe('papni-architecture');
  });

  it('returns null for state listing page', () => {
    expect(extractCollegeSlug('https://neramclasses.com/colleges/tamil-nadu')).toBeNull();
  });

  it('returns null for hub landing', () => {
    expect(extractCollegeSlug('https://neramclasses.com/colleges')).toBeNull();
  });

  it('returns null for unrelated path', () => {
    expect(extractCollegeSlug('https://neramclasses.com/apply')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(extractCollegeSlug('')).toBeNull();
    expect(extractCollegeSlug('not-a-url')).toBeNull();
  });

  it('accepts path-only input (no origin)', () => {
    expect(extractCollegeSlug('/colleges/tamil-nadu/papni-architecture')).toBe('papni-architecture');
  });
});
