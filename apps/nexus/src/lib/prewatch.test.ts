import { describe, it, expect } from 'vitest';
import {
  formatClassDate,
  formatDuration,
  libraryTitle,
  normalizePicks,
  pickKey,
  pickOfRow,
  prewatchState,
  PREWATCH_STARTED_SECONDS,
} from './prewatch';
import { isPrewatchKind, referenceOnly } from './class-resources';

describe('prewatchState', () => {
  it('is not started with no row', () => {
    expect(prewatchState(null, 600)).toBe('not_started');
  });

  it('counts real playback, not a few seconds of it', () => {
    expect(prewatchState({ watched_seconds: PREWATCH_STARTED_SECONDS - 1, completed_at: null }, 600)).toBe('not_started');
    expect(prewatchState({ watched_seconds: PREWATCH_STARTED_SECONDS, completed_at: null }, 600)).toBe('started');
  });

  it('is watched at 80 percent of the length', () => {
    expect(prewatchState({ watched_seconds: 479, completed_at: null }, 600)).toBe('started');
    expect(prewatchState({ watched_seconds: 480, completed_at: null }, 600)).toBe('watched');
  });

  it('once completed stays watched, whatever the length on record says', () => {
    expect(prewatchState({ watched_seconds: 10, completed_at: '2026-10-10T10:00:00Z' }, 6000)).toBe('watched');
  });

  it('never calls a video of unknown length watched from playback alone', () => {
    expect(prewatchState({ watched_seconds: 5000, completed_at: null }, null)).toBe('started');
  });
});

describe('formatDuration', () => {
  it('reads like a person would say it', () => {
    expect(formatDuration(45)).toBe('45 sec');
    expect(formatDuration(12 * 60 + 10)).toBe('12 min');
    expect(formatDuration(3600)).toBe('1 hr');
    expect(formatDuration(3900)).toBe('1 hr 5 min');
  });
  it('is empty for an unknown length', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(0)).toBe('');
  });
});

describe('formatClassDate', () => {
  it('formats a date-only string without shifting the day', () => {
    expect(formatClassDate('2026-10-03')).toBe('3 Oct 2026');
  });
  it('is empty for junk', () => {
    expect(formatClassDate('')).toBe('');
    expect(formatClassDate('2026-13-01')).toBe('');
  });
});

describe('picks', () => {
  it('normalizes: known kinds, no duplicates, trimmed ids', () => {
    expect(
      normalizePicks([
        { kind: 'library_video', id: ' a ' },
        { kind: 'library_video', id: 'a' },
        { kind: 'class_recording', id: 'b' },
        { kind: 'youtube', id: 'c' },
        { kind: 'class_recording' },
        'nonsense',
      ]),
    ).toEqual([
      { kind: 'library_video', id: 'a' },
      { kind: 'class_recording', id: 'b' },
    ]);
  });

  it('tells "nothing sent" from an empty list', () => {
    expect(normalizePicks(undefined)).toBeNull();
    expect(normalizePicks([])).toEqual([]);
  });

  it('maps a stored row back to its pick', () => {
    expect(pickOfRow({ kind: 'library_video', library_video_id: 'v1' })).toEqual({ kind: 'library_video', id: 'v1' });
    expect(pickOfRow({ kind: 'class_recording', source_class_id: 'c1' })).toEqual({ kind: 'class_recording', id: 'c1' });
    expect(pickOfRow({ kind: 'youtube' })).toBeNull();
    expect(pickKey({ kind: 'class_recording', id: 'c1' })).toBe('class_recording:c1');
  });
});

describe('libraryTitle', () => {
  it('prefers the reviewed title', () => {
    expect(libraryTitle({ approved_title: 'A', suggested_title: 'B', original_title: 'C' })).toBe('A');
    expect(libraryTitle({ approved_title: null, suggested_title: null, original_title: 'C' })).toBe('C');
    expect(libraryTitle({})).toBe('Library video');
  });
});

describe('reference material stays separate', () => {
  it('recognizes the prewatch kinds', () => {
    expect(isPrewatchKind('library_video')).toBe(true);
    expect(isPrewatchKind('class_recording')).toBe(true);
    expect(isPrewatchKind('youtube')).toBe(false);
  });
  it('drops prewatch rows from an embedded resource list', () => {
    expect(referenceOnly([{ kind: 'youtube' }, { kind: 'library_video' }, { kind: 'study_file' }])).toEqual([
      { kind: 'youtube' },
      { kind: 'study_file' },
    ]);
    expect(referenceOnly(null)).toEqual([]);
  });
});
