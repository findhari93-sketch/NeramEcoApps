import { describe, it, expect, vi } from 'vitest';

// PATH_TO_BADGE_KEY lives in the provider, a client module with hooks.
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({}) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

import { affectsBadges, describeFetch, BADGE_MUTATION_ROUTES } from './badge-mutations';
import { PATH_TO_BADGE_KEY } from '@/components/NavBadgeProvider';

describe('affectsBadges', () => {
  it.each([
    ['PATCH', '/api/foundation/issues/abc'],
    ['DELETE', '/api/foundation/issues/abc'],
    ['POST', '/api/foundation/issues'],
    ['POST', '/api/catchup/items/i1'],
    ['POST', '/api/catchup/celebrate'],
    ['POST', '/api/timetable/c1/catch-up'],
    ['POST', '/api/timetable/c1/not-taught'],
    ['POST', '/api/timetable/attendance-report'],
    ['POST', '/api/photo-review'],
    ['POST', '/api/photo-review/auto-check'],
    ['POST', '/api/sketchbook/entries/s1/flip'],
    ['POST', '/api/sketchbook/entries/s1/react'],
    ['POST', '/api/drawing/submissions/d1/review'],
    ['POST', '/api/drawing/evaluations'],
    ['POST', '/api/question-bank/questions/q1/report'],
    ['POST', '/api/question-bank/questions/q1/reports/resolve'],
    ['PATCH', '/api/question-bank/reports/r1'],
    ['patch', '/api/foundation/issues/abc'],
  ])('%s %s moves a badge', (method, url) => {
    expect(affectsBadges(method, url)).toBe(true);
  });

  it.each([
    ['GET', '/api/foundation/issues'],
    ['GET', '/api/foundation/issues/abc'],
    ['GET', '/api/catchup/overview'],
    ['GET', '/api/nav-badges'],
    ['POST', '/api/nav-badges'],
    // Autosave, pad strokes and the like must never each cost a badge request.
    ['POST', '/api/exams/e1/answers'],
    ['POST', '/api/pad/strokes'],
    ['POST', '/api/timetable/c1/attendance'],
    ['POST', '/api/question-bank/questions/q1/drawing-attempt'],
    ['POST', 'https://graph.microsoft.com/v1.0/foundation/issues'],
  ])('%s %s does not', (method, url) => {
    expect(affectsBadges(method, url)).toBe(false);
  });

  it('counts the one read that writes: opening a ticket with seen=1', () => {
    expect(affectsBadges('GET', '/api/foundation/issues/abc?seen=1')).toBe(true);
    expect(affectsBadges(undefined, '/api/foundation/issues/abc?seen=1')).toBe(true);
    expect(affectsBadges('GET', '/api/foundation/issues/abc?seen=0')).toBe(false);
  });

  it('accepts a same-origin absolute URL', () => {
    expect(affectsBadges('PATCH', `${window.location.origin}/api/foundation/issues/abc`)).toBe(true);
  });
});

describe('describeFetch', () => {
  it('reads a string, a URL and a Request', () => {
    expect(describeFetch('/api/x', { method: 'POST' })).toEqual({ method: 'POST', url: '/api/x' });
    expect(describeFetch(new URL('http://localhost/api/x'))).toEqual({ method: 'GET', url: 'http://localhost/api/x' });
    const req = new Request('http://localhost/api/x', { method: 'DELETE' });
    expect(describeFetch(req)).toEqual({ method: 'DELETE', url: 'http://localhost/api/x' });
  });
});

describe('every badge says what moves it', () => {
  it.each(Array.from(new Set(Object.values(PATH_TO_BADGE_KEY))))('%s has mutation routes', (key) => {
    expect(BADGE_MUTATION_ROUTES[key]?.length ?? 0).toBeGreaterThan(0);
  });
});
