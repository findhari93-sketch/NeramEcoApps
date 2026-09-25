import { describe, it, expect } from 'vitest';
import { hubHref, newTestHref, parseHubTab, wizardCloseHref, wizardFromLabel } from './tests-hub-nav';

describe('tests hub tab in the URL', () => {
  it('reads every known tab and falls back to Library', () => {
    expect(parseHubTab('conducted')).toBe('conducted');
    expect(parseHubTab('location')).toBe('location');
    expect(parseHubTab('students')).toBe('students');
    expect(parseHubTab(null)).toBe('library');
    expect(parseHubTab('nonsense')).toBe('library');
  });

  it('keeps the bare URL for Library and a ?tab= for the rest', () => {
    expect(hubHref('library')).toBe('/teacher/tests');
    expect(hubHref('conducted')).toBe('/teacher/tests?tab=conducted');
  });
});

describe('New test remembers where it was opened from', () => {
  it('carries the tab as ?from=', () => {
    expect(newTestHref('conducted')).toBe('/teacher/tests/new?from=conducted');
  });

  it('keeps a deep-link source alongside it', () => {
    const href = newTestHref('/teacher/study-materials/abc', { src: 'json' });
    const params = new URL(href, 'https://nexus.test').searchParams;
    expect(params.get('from')).toBe('/teacher/study-materials/abc');
    expect(params.get('src')).toBe('json');
  });
});

describe('the wizard close button', () => {
  it('returns to the hub tab it came from', () => {
    expect(wizardCloseHref('conducted')).toBe('/teacher/tests?tab=conducted');
    expect(wizardCloseHref('students')).toBe('/teacher/tests?tab=students');
    expect(wizardCloseHref('library')).toBe('/teacher/tests');
  });

  it('returns to the study material page that opened it', () => {
    expect(wizardCloseHref('/teacher/study-materials/abc?tab=tests')).toBe('/teacher/study-materials/abc?tab=tests');
  });

  it('falls back to the hub with no from, or anything outside the teacher app', () => {
    expect(wizardCloseHref(null)).toBe('/teacher/tests');
    expect(wizardCloseHref('https://evil.example/teacher/')).toBe('/teacher/tests');
    expect(wizardCloseHref('//evil.example/teacher/x')).toBe('/teacher/tests');
    expect(wizardCloseHref('/student/tests')).toBe('/teacher/tests');
    // Browsers read a backslash as a slash, so "/teacher/\\host" must not pass.
    expect(wizardCloseHref(`/teacher/${String.fromCharCode(92)}evil`)).toBe('/teacher/tests');
  });

  it('labels the header with where Close goes', () => {
    expect(wizardFromLabel('conducted')).toBe('From Conducted');
    expect(wizardFromLabel('/teacher/study-materials/abc')).toBe('From study material');
    expect(wizardFromLabel(null)).toBeNull();
    expect(wizardFromLabel('https://evil.example')).toBeNull();
  });
});
