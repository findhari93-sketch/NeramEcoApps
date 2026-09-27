// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { EVENT_TAXONOMY } from '@neram/database/analytics';
import { classifyPageView, stripLocale } from './page-events';

describe('stripLocale', () => {
  it('removes the locale prefix and query', () => {
    expect(stripLocale('/ta/courses/nata?x=1')).toEqual({ locale: 'ta', path: '/courses/nata' });
    expect(stripLocale('/')).toEqual({ locale: 'en', path: '/' });
    expect(stripLocale('/en/tools')).toEqual({ locale: 'en', path: '/tools' });
    expect(stripLocale('/ml')).toEqual({ locale: 'ml', path: '/' });
  });
});

describe('classifyPageView', () => {
  it('home is a landing page view in every locale', () => {
    expect(classifyPageView('/')).toEqual({ event: 'landing_page_viewed', metadata: { page: 'home', locale: 'en' } });
    expect(classifyPageView('/hi')?.event).toBe('landing_page_viewed');
  });

  it('course and coaching pages are course page views', () => {
    expect(classifyPageView('/courses/nata-2-year')).toEqual({
      event: 'course_page_viewed',
      metadata: { section: 'courses', slug: 'nata-2-year', locale: 'en' },
    });
    expect(classifyPageView('/kn/coaching')?.metadata).toMatchObject({ section: 'coaching', slug: 'index', locale: 'kn' });
    expect(classifyPageView('/nata-coaching/chennai')?.event).toBe('course_page_viewed');
    expect(classifyPageView('/nata-online-coaching')?.event).toBe('course_page_viewed');
  });

  it('tool landing pages are tool page views', () => {
    expect(classifyPageView('/tools/cutoff-calculator')).toEqual({
      event: 'tool_page_viewed',
      metadata: { tool: 'cutoff-calculator', locale: 'en' },
    });
    expect(classifyPageView('/tools')?.metadata.tool).toBe('index');
  });

  it('ignores every other page', () => {
    for (const p of ['/reviews', '/blog/x', '/apply', '/ta/about', '/coachingx']) {
      expect(classifyPageView(p), p).toBeNull();
    }
  });

  it('only fires events that exist in the shared taxonomy', () => {
    for (const p of ['/', '/courses', '/tools/x']) {
      const view = classifyPageView(p)!;
      expect(EVENT_TAXONOMY[view.event]).toBe('marketing');
    }
  });
});
