import { describe, it, expect } from 'vitest';
import { siteTokens as t } from './site-tokens';
import { siteLightTheme, siteDarkTheme } from './site-2026';
import { marketingLightTheme, marketingDarkTheme, neramaiArchitekDarkTheme } from './index';

type RGB = [number, number, number];

function parse(color: string, over?: RGB): RGB {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (rgba && over) {
    const a = Number(rgba[4]);
    return [1, 2, 3].map((i, k) => Math.round(Number(rgba[i]) * a + over[k] * (1 - a))) as RGB;
  }
  throw new Error(`Cannot parse ${color}`);
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string): number {
  const b = parse(bg);
  const [l1, l2] = [luminance(parse(fg, b)), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('siteTokens contrast (WCAG AA, 4.5:1 for text)', () => {
  const pairs: Array<[string, string, string]> = [
    ['ink on ground', t.ink, t.ground],
    ['ink on surface', t.ink, t.surface],
    ['inkMuted on surface', t.inkMuted, t.surface],
    ['inkMuted on ground', t.inkMuted, t.ground],
    ['gold800 on surface', t.gold800, t.surface],
    ['gold800 on ground', t.gold800, t.ground],
    ['paper on navy900', t.paper, t.navy900],
    ['paperMuted on navy900', t.paperMuted, t.navy900],
    ['paperSubtle on navy900', t.paperSubtle, t.navy900],
    ['paper on navy700', t.paper, t.navy700],
    ['gold500 on navy900', t.gold500, t.navy900],
    ['gold300 on navy900', t.gold300, t.navy900],
    ['navy900 on gold500 (primary button)', t.navy900, t.gold500],
    ['navy900 on gold300 (primary hover)', t.navy900, t.gold300],
    ['success on surface', t.success, t.surface],
  ];

  it.each(pairs)('%s', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('gold500 text on white fails, which is why gold text on light uses gold800', () => {
    expect(contrast(t.gold500, t.surface)).toBeLessThan(4.5);
  });
});

describe('site themes', () => {
  it('light theme: navy primary for fills, gold800 secondary for gold text', () => {
    expect(siteLightTheme.palette.primary.main).toBe(t.navy900);
    expect(siteLightTheme.palette.secondary.main).toBe(t.gold800);
    expect(siteLightTheme.palette.background.default).toBe(t.ground);
    expect(siteLightTheme.palette.text.primary).toBe(t.ink);
  });

  it('dark theme sits on navy with paper text', () => {
    expect(siteDarkTheme.palette.background.default).toBe(t.navy900);
    expect(siteDarkTheme.palette.text.primary).toBe(t.paper);
    expect(siteDarkTheme.palette.primary.main).toBe(t.gold500);
  });

  it('both themes share one type scale, Inter first, with the custom variants', () => {
    for (const theme of [siteLightTheme, siteDarkTheme]) {
      expect(theme.typography.fontFamily).toBe(t.fontSans);
      expect(theme.typography.h1.fontWeight).toBe(800);
      expect(theme.typography.eyebrow.fontFamily).toBe(t.fontMono);
      expect(theme.typography.statValue.fontFamily).toBe(t.fontMono);
      expect(theme.shape.borderRadius).toBe(8);
    }
  });

  it('legacy marketing exports resolve to the site themes', () => {
    expect(marketingLightTheme).toBe(siteLightTheme);
    expect(marketingDarkTheme).toBe(siteDarkTheme);
    expect(neramaiArchitekDarkTheme).toBe(siteDarkTheme);
  });
});
