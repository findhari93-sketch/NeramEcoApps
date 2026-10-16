import { describe, it, expect } from 'vitest';
import { getHeaderState, PRIMARY_LABELS, STATUS_SENTENCES } from './header-state';
import { headerTier, fromTier } from './header-tier';
import { getHeaderTone } from './header-tone';
import type { DemoCta } from '@/lib/demo-cta';

const FREE: DemoCta = { label: 'freeDemo', href: '/demo-class' };
const MINE: DemoCta = { label: 'myDemo', href: '/demo-class/my' };
const base = { status: null, signedIn: false, demo: FREE, pathname: '/' } as const;

describe('getHeaderState (the 8-row state map)', () => {
  it('guest: Free demo + Join Now, no dot, Log in', () => {
    const s = getHeaderState(base);
    expect(s.key).toBe('guest');
    expect(s.secondary).toEqual({ kind: 'freeDemo', href: '/demo-class' });
    expect(s.primary).toEqual({ kind: 'join', href: '/apply', ghost: false });
    expect(s.dot).toBeNull();
    expect(s.goldRing).toBe(false);
  });

  it('signedIn with no application looks like guest but with an account', () => {
    expect(getHeaderState({ ...base, signedIn: true }).key).toBe('signedIn');
  });

  it('demoBooked: My demo as the secondary', () => {
    const s = getHeaderState({ ...base, signedIn: true, demo: MINE });
    expect(s.key).toBe('demoBooked');
    expect(s.secondary).toEqual({ kind: 'myDemo', href: '/demo-class/my' });
    expect(s.primary.kind).toBe('join');
  });

  it('draft: Continue application with an amber dot', () => {
    const s = getHeaderState({ ...base, signedIn: true, status: 'draft' });
    expect(s.key).toBe('draft');
    expect(s.primary).toEqual({ kind: 'continue', href: '/apply', ghost: false });
    expect(s.dot).toBe('draft');
  });

  it.each(['submitted', 'under_review', 'pending_verification'] as const)('%s: Track application with a blue dot', (status) => {
    const s = getHeaderState({ ...base, signedIn: true, status });
    expect(s.key).toBe('review');
    expect(s.primary.kind).toBe('track');
    expect(s.dot).toBe('review');
    expect(s.secondary?.kind).toBe('freeDemo');
  });

  it('approved: no secondary, Pay & join, green dot, no pulse state', () => {
    const s = getHeaderState({ ...base, signedIn: true, status: 'approved', demo: null });
    expect(s.key).toBe('approved');
    expect(s.secondary).toBeNull();
    expect(s.primary.kind).toBe('pay');
    expect(s.dot).toBe('done');
  });

  it.each(['enrolled', 'partial_payment'] as const)('%s: My enrollment + Go to App (a button) + gold ring', (status) => {
    const s = getHeaderState({ ...base, signedIn: true, status, demo: null });
    expect(s.key).toBe('enrolled');
    expect(s.secondary).toEqual({ kind: 'myEnrollment', href: '/my-enrollment' });
    expect(s.primary).toEqual({ kind: 'app', href: null, ghost: false });
    expect(s.goldRing).toBe(true);
  });

  it('on /apply (any locale): Need help? as an outline, nothing else', () => {
    for (const pathname of ['/apply', '/ta/apply']) {
      const s = getHeaderState({ ...base, signedIn: true, status: 'draft', pathname });
      expect(s.key).toBe('applyPage');
      expect(s.secondary).toBeNull();
      expect(s.primary).toEqual({ kind: 'help', href: '/contact', ghost: true });
      expect(s.dot).toBeNull();
    }
  });

  it('a hidden demo (demo pages) leaves no secondary', () => {
    expect(getHeaderState({ ...base, demo: null }).secondary).toBeNull();
  });

  it('every primary has full, compact and short labels; continue and track drop "application" when compact', () => {
    for (const labels of Object.values(PRIMARY_LABELS)) {
      expect(labels.full && labels.compact && labels.short).toBeTruthy();
    }
    expect(PRIMARY_LABELS.continue.compact).toBe('continueShort');
    expect(PRIMARY_LABELS.track.compact).toBe('trackShort');
    expect(STATUS_SENTENCES.guest).toBeNull();
  });
});

describe('headerTier', () => {
  it.each([
    [375, 'mobile'],
    [899, 'mobile'],
    [900, 'tight'],
    [1059, 'tight'],
    [1060, 'compact'],
    [1239, 'compact'],
    [1240, 'full'],
    [1680, 'full'],
  ] as const)('%ipx is %s', (w, tier) => {
    expect(headerTier(w)).toBe(tier);
  });

  it('builds container queries on the header container', () => {
    expect(fromTier('tight')).toBe('@container siteheader (min-width: 900px)');
    expect(fromTier('full')).toBe('@container siteheader (min-width: 1240px)');
  });
});

describe('getHeaderTone', () => {
  it.each([
    '/colleges',
    '/colleges/tamil-nadu',
    '/ta/colleges/compare',
    '/nata-2026/eligibility',
    '/aat-2026/syllabus',
    '/pgeta-2026/schedule',
    '/counseling/josaa',
    '/counseling/concepts/aat-explained',
    '/blog/how-to-prepare',
    '/terms',
    '/privacy',
    '/refund-policy',
    '/support/track',
  ])('%s is light', (p) => {
    expect(getHeaderTone(p)).toBe('light');
  });

  it.each(['/', '/ta', '/coaching', '/nata-2026', '/counseling', '/blog', '/tools', '/tools/cutoff-calculator', '/fees', '/about', '/collegesx'])(
    '%s is dark',
    (p) => {
      expect(getHeaderTone(p)).toBe('dark');
    },
  );
});
