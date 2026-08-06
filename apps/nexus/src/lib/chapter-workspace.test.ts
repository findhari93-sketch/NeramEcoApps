import { describe, it, expect } from 'vitest';
import {
  isServableTrack,
  summariseWatchLanguages,
  chapterReadiness,
  chapterBlockers,
} from './chapter-workspace';

/**
 * The two questions a teacher opens a chapter to ask: "does this chapter
 * actually work" and "who is getting through it".
 *
 * Both used to be answerable only by leaving the document, and the second was
 * not answerable at all: the report has always returned which language each
 * student watched in and nothing has ever rendered it.
 */

const track = (over: Partial<Parameters<typeof isServableTrack>[0]> = {}) => ({
  language: 'en',
  language_label: 'English',
  status: 'published',
  readiness: 'ready',
  ...over,
});

describe('isServableTrack', () => {
  it('mirrors the query layer exactly: published AND ready', () => {
    expect(isServableTrack(track())).toBe(true);
    expect(isServableTrack(track({ status: 'draft' }))).toBe(false);
    expect(isServableTrack(track({ readiness: 'pending' }))).toBe(false);
  });

  it('treats a missing readiness as ready, which is what the column default means', () => {
    // Rows written before the column existed have null, and they were servable.
    expect(isServableTrack(track({ readiness: null }))).toBe(true);
    expect(isServableTrack(track({ readiness: undefined }))).toBe(true);
  });
});

describe('summariseWatchLanguages', () => {
  const tracks = [track(), track({ language: 'ta', language_label: 'தமிழ்' })];

  it('counts each language and everyone who has watched nothing', () => {
    const out = summariseWatchLanguages(
      [
        { video_language: 'en' },
        { video_language: 'en' },
        { video_language: 'ta' },
        { video_language: null },
        {},
      ],
      tracks,
    );
    expect(out.languages).toEqual([
      { code: 'en', label: 'English', count: 2 },
      { code: 'ta', label: 'தமிழ்', count: 1 },
    ]);
    expect(out.notWatched).toBe(2);
  });

  it('lists a language with nobody on it rather than hiding the row', () => {
    // "English 0, தமிழ் 0, not watched 18" is the whole point on a chapter
    // nobody has started. Showing nothing there reads as "no data collected".
    const out = summariseWatchLanguages([{ video_language: null }], tracks);
    expect(out.languages.map((l) => l.count)).toEqual([0, 0]);
    expect(out.notWatched).toBe(1);
  });

  it('keeps the order the languages are offered in', () => {
    const out = summariseWatchLanguages([], [tracks[1], tracks[0]]);
    expect(out.languages.map((l) => l.code)).toEqual(['ta', 'en']);
  });

  it('surfaces a language nobody offers any more instead of losing the student', () => {
    // A track removed from the chapter does not un-watch the students who
    // finished it. Dropping them would silently shrink the cohort.
    const out = summariseWatchLanguages([{ video_language: 'hi' }], tracks);
    expect(out.languages).toContainEqual({ code: 'hi', label: 'hi', count: 1 });
    expect(out.notWatched).toBe(0);
  });

  it('counts a chapter with no tracks as nobody having watched', () => {
    const out = summariseWatchLanguages([{ video_language: null }, {}], []);
    expect(out.languages).toEqual([]);
    expect(out.notWatched).toBe(2);
  });

  it('handles an empty roster without dividing by anything', () => {
    expect(summariseWatchLanguages([], [])).toEqual({ languages: [], notWatched: 0 });
  });
});

describe('chapterReadiness', () => {
  const file = (over: Record<string, unknown> = {}) => ({
    has_test: true,
    downloadable: false,
    recording: null,
    ...over,
  }) as any;

  const byKey = (lines: ReturnType<typeof chapterReadiness>, key: string) =>
    lines.find((l) => l.key === key)!;

  it('calls a chapter with no test out, because nobody can complete it', () => {
    const line = byKey(chapterReadiness(file({ has_test: false }), []), 'test');
    expect(line.state).toBe('missing');
    expect(line.optional).toBe(false);
    expect(line.detail).toMatch(/cannot complete/i);
  });

  it('names what a student sees when a recording is published and ready', () => {
    const line = byKey(chapterReadiness(file(), [track()]), 'recordings');
    expect(line.state).toBe('ready');
    expect(line.detail).toContain('English');
  });

  it('separates "held back" from "never added", because they need different actions', () => {
    // This is the exact state of Ch:1 on production: one English track, still a
    // draft, so the chapter looks equipped and serves nothing.
    const held = byKey(chapterReadiness(file(), [track({ status: 'draft' })]), 'recordings');
    expect(held.state).toBe('attention');
    expect(held.detail).toMatch(/nothing yet/i);

    const none = byKey(chapterReadiness(file(), []), 'recordings');
    expect(none.state).toBe('missing');
  });

  it('treats recordings as optional, because a chapter without one is not broken', () => {
    // Only the video gate makes a recording mandatory, and a chapter with no
    // track has no gate: the test is simply open.
    expect(byKey(chapterReadiness(file(), []), 'recordings').optional).toBe(true);
  });

  it('reports the download setting as information, never as a fault', () => {
    expect(byKey(chapterReadiness(file(), []), 'download').state).toBe('info');
    expect(byKey(chapterReadiness(file({ downloadable: true }), []), 'download').detail)
      .toMatch(/download/i);
  });

  it('names the pool, because 150 held and 50 asked are different numbers', () => {
    const line = byKey(
      chapterReadiness(file(), [], {
        test_id: 't1',
        title: 'History of Architecture Test',
        question_count: 50,
        pool_size: 150,
        passing_pct: 70,
        is_published: true,
      }),
      'test',
    );
    expect(line.state).toBe('ready');
    expect(line.detail).toContain('50 asked each attempt');
    expect(line.detail).toContain('150');
    expect(line.detail).toContain('70%');
  });

  it('flags a test that is attached but not published', () => {
    // has_test says yes from every screen while the paper serves nobody, which
    // is the same trap as a recording held at readiness 'pending'.
    const line = byKey(
      chapterReadiness(file(), [], {
        test_id: 't1',
        title: 'Draft',
        question_count: 20,
        pool_size: null,
        passing_pct: 70,
        is_published: false,
      }),
      'test',
    );
    expect(line.state).toBe('attention');
    expect(line.detail).toMatch(/cannot take it/i);
  });

  it('falls back to has_test when the placed test has not loaded yet', () => {
    // The rail draws before its second fetch lands, and a checklist that
    // flashed "no test yet" on a chapter that has one would be worse than
    // waiting.
    expect(byKey(chapterReadiness(file({ has_test: true }), []), 'test').state).toBe('ready');
    expect(byKey(chapterReadiness(file({ has_test: true }), [], null), 'test').state).toBe('ready');
  });

  it('always returns every line, so the checklist does not change shape', () => {
    expect(chapterReadiness(file(), []).map((l) => l.key)).toEqual([
      'test',
      'recordings',
      'quick_link',
      'download',
    ]);
  });
});

describe('chapterBlockers', () => {
  it('reports only what actually stops a student finishing', () => {
    const blockers = chapterBlockers(
      chapterReadiness({ has_test: false, downloadable: false, recording: null } as any, []),
    );
    expect(blockers.map((l) => l.key)).toEqual(['test']);
  });

  it('is empty on a chapter that works', () => {
    expect(
      chapterBlockers(
        chapterReadiness({ has_test: true, downloadable: false, recording: null } as any, [track()]),
      ),
    ).toEqual([]);
  });
});
