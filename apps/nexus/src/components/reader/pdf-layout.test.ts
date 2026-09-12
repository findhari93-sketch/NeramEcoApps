import { describe, it, expect } from 'vitest';
import { currentPageFromTops, needsRerenderForWidth, pageAspectRatio } from './pdf-layout';

describe('pageAspectRatio', () => {
  it('gives a 16:9 slide its landscape shape', () => {
    expect(pageAspectRatio(960, 540)).toBeCloseTo(16 / 9);
  });

  it('gives an A4 page its portrait shape', () => {
    expect(pageAspectRatio(595.28, 841.89)).toBeCloseTo(0.7071, 3);
  });

  it('is null when the size is unknown', () => {
    expect(pageAspectRatio(0, 540)).toBeNull();
    expect(pageAspectRatio(960, 0)).toBeNull();
    expect(pageAspectRatio(undefined, 540)).toBeNull();
    expect(pageAspectRatio(960, null)).toBeNull();
    expect(pageAspectRatio(Number.NaN, 540)).toBeNull();
    expect(pageAspectRatio(-960, 540)).toBeNull();
  });
});

describe('needsRerenderForWidth', () => {
  it('draws again when a phone is turned', () => {
    expect(needsRerenderForWidth(359, 651)).toBe(true);
    expect(needsRerenderForWidth(651, 359)).toBe(true);
  });

  it('ignores a small change such as a scrollbar appearing', () => {
    expect(needsRerenderForWidth(359, 375)).toBe(false);
  });

  it('draws again only past the threshold', () => {
    expect(needsRerenderForWidth(800, 736)).toBe(false);
    expect(needsRerenderForWidth(800, 735)).toBe(true);
  });

  it('never draws for a hidden reader or before anything was drawn', () => {
    expect(needsRerenderForWidth(800, 0)).toBe(false);
    expect(needsRerenderForWidth(null, 800)).toBe(false);
    expect(needsRerenderForWidth(0, 800)).toBe(false);
  });
});

describe('currentPageFromTops', () => {
  it('is page 1 at the start', () => {
    expect(currentPageFromTops([16, 700, 1400], 600)).toBe(1);
  });

  it('follows the page that has passed the reading line', () => {
    expect(currentPageFromTops([-690, -6, 694], 600)).toBe(2);
    expect(currentPageFromTops([-1390, -706, -6], 600)).toBe(3);
  });

  it('does not count a page still below the reading line', () => {
    expect(currentPageFromTops([-690, 250, 950], 600)).toBe(1);
  });

  it('is 0 with no pages', () => {
    expect(currentPageFromTops([], 600)).toBe(0);
  });
});
