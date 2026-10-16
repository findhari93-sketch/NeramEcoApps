import { describe, it, expect } from 'vitest';
import { siteTokens as t } from '@neram/ui/site-tokens';
import { contrastRatio } from './contrast';
import { brandColors, errorColor } from './brand-colors';

/**
 * Every text pairing the design system uses must stay at or above WCAG AA
 * (4.5:1 for body text). If a token changes, this fails before a page does.
 */
const AA = 4.5;

describe('design-system text contrast (WCAG AA)', () => {
  it.each([
    ['ink on ground', t.ink, t.ground],
    ['ink on surface', t.ink, t.surface],
    ['inkMuted on surface', t.inkMuted, t.surface],
    ['inkMuted on ground', t.inkMuted, t.ground],
    ['gold800 on surface (eyebrows, gold text on light)', t.gold800, t.surface],
    ['gold800 on ground', t.gold800, t.ground],
    ['paper on navy900', t.paper, t.navy900],
    ['paperMuted on navy900', t.paperMuted, t.navy900],
    ['paperSubtle on navy900', t.paperSubtle, t.navy900],
    ['paperMuted on navy800 (dark cards)', t.paperMuted, t.navy800],
    ['gold500 on navy900 (eyebrows and stats on dark)', t.gold500, t.navy900],
    ['navy900 on gold500 (primary button, banner, badges)', t.navy900, t.gold500],
    ['navy900 on gold300 (primary hover)', t.navy900, t.gold300],
    ['paper on navy700 (avatar initials)', t.paper, t.navy700],
    ['surface on success (staging badge)', t.surface, t.success],
    ['surface on errorColor', t.surface, errorColor],
  ])('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  it('gold500 text on white is NOT allowed (why gold800 exists)', () => {
    expect(contrastRatio(t.gold500, t.surface)).toBeLessThan(AA);
  });

  it('white text on the WhatsApp brand green fails, so it is an icon colour only', () => {
    expect(contrastRatio(t.surface, brandColors.whatsapp)).toBeLessThan(AA);
  });
});
