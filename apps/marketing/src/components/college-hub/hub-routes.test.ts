import { describe, it, expect } from 'vitest';
import { isHubRoute, isCollegeProfileRoute, isCompareRoute } from './hub-routes';

describe('hub-routes', () => {
  describe('isHubRoute', () => {
    it('matches /colleges and its sub-pages, with or without a locale prefix', () => {
      expect(isHubRoute('/colleges')).toBe(true);
      expect(isHubRoute('/colleges/city/chennai')).toBe(true);
      expect(isHubRoute('/ta/colleges')).toBe(true);
    });
    it('does not match unrelated routes', () => {
      expect(isHubRoute('/')).toBe(false);
      expect(isHubRoute('/colleges-foo')).toBe(false);
      expect(isHubRoute('/nata-hub')).toBe(false);
    });
  });

  describe('isCollegeProfileRoute', () => {
    it('matches a two-segment college page but not a hub section', () => {
      expect(isCollegeProfileRoute('/colleges/tamil-nadu/caad-chennai')).toBe(true);
      expect(isCollegeProfileRoute('/colleges/city/chennai')).toBe(false);
      expect(isCollegeProfileRoute('/colleges')).toBe(false);
    });
  });

  describe('isCompareRoute', () => {
    it('is true across the College Hub, including a college profile and the compare page', () => {
      expect(isCompareRoute('/colleges')).toBe(true);
      expect(isCompareRoute('/colleges/city/chennai')).toBe(true);
      expect(isCompareRoute('/colleges/compare')).toBe(true);
      expect(isCompareRoute('/colleges/tamil-nadu/caad-chennai')).toBe(true);
      expect(isCompareRoute('/ta/colleges')).toBe(true);
    });

    it('is true on the exam hubs whose college cards carry a Compare button', () => {
      expect(isCompareRoute('/nata-hub')).toBe(true);
      expect(isCompareRoute('/jee-barch-hub')).toBe(true);
      expect(isCompareRoute('/ta/nata-hub')).toBe(true);
    });

    it('is false on the home page and other marketing pages', () => {
      expect(isCompareRoute('/')).toBe(false);
      expect(isCompareRoute('/fees')).toBe(false);
      expect(isCompareRoute('/apply')).toBe(false);
      expect(isCompareRoute('/blog/some-post')).toBe(false);
      expect(isCompareRoute('/ta')).toBe(false);
    });

    it('does not match a route that merely starts with a hub name', () => {
      expect(isCompareRoute('/nata-hub-extra')).toBe(false);
      expect(isCompareRoute('/colleges-foo')).toBe(false);
    });
  });
});
