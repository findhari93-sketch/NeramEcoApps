import { describe, it, expect } from 'vitest';
import { describeTrackState, buildLanguageRows, type RecordingTrack } from './chapter-recordings';

/**
 * The two questions the Class recordings dialog has to answer at a glance:
 * which languages does this chapter have, and what state is each one in.
 *
 * It could answer neither. A language with a recording lost its "add" chip, so
 * the only trace of English on a chapter that had English was a card whose
 * header scrolled away, and the state of that card was carried by a disabled
 * button and a caption above it.
 */

const track = (over: Partial<RecordingTrack> = {}): RecordingTrack => ({
  id: 'track-en',
  language: 'en',
  language_label: 'English',
  title: 'English recording',
  status: 'draft',
  readiness: 'pending',
  hold_reason: null,
  section_count: 0,
  video_duration_seconds: 3600,
  video_source: 'sharepoint',
  ...over,
});

const OFFERED = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
];

describe('describeTrackState', () => {
  it('says a language with no recording is not added, rather than saying nothing', () => {
    const state = describeTrackState(null);
    expect(state.label).toBe('Not added');
    expect(state.live).toBe(false);
    expect(state.detail('தமிழ்')).toContain('தமிழ்');
  });

  it('names the two ways out of a draft with no checkpoints', () => {
    // This is Ch:1 exactly: a recording nobody can see, whose only route to a
    // student used to be a transcript the teacher does not have.
    const state = describeTrackState(track());
    expect(state.label).toBe('Draft, no checkpoints');
    expect(state.live).toBe(false);
    expect(state.detail('English')).toMatch(/transcript/i);
    expect(state.detail('English')).toMatch(/open recording/i);
  });

  it('separates a draft that is ready to publish from one that is not', () => {
    const state = describeTrackState(track({ section_count: 8 }));
    expect(state.label).toBe('Draft, 8 checkpoints');
    expect(state.detail('English')).toMatch(/ready to publish/i);
  });

  it('calls a live checkpointed recording a gate, because it is one', () => {
    const state = describeTrackState(
      track({ status: 'published', readiness: 'ready', section_count: 8 }),
    );
    expect(state.live).toBe(true);
    expect(state.gates).toBe(true);
    expect(state.detail('English')).toMatch(/unlocks the chapter test/i);
  });

  it('calls a live open recording watchable and NOT a gate', () => {
    const state = describeTrackState(track({ status: 'published', readiness: 'ready' }));
    expect(state.label).toBe('Live, open');
    expect(state.live).toBe(true);
    expect(state.gates).toBe(false);
    expect(state.detail('English')).toMatch(/does not unlock/i);
  });

  it('flags a published recording that is held back, which reads as live everywhere else', () => {
    const state = describeTrackState(
      track({ status: 'published', readiness: 'held', hold_reason: 'thin_questions', section_count: 4 }),
    );
    expect(state.label).toBe('On hold');
    expect(state.colour).toBe('warning');
    expect(state.live).toBe(false);
    expect(state.detail('English')).toContain('thin_questions');
  });

  it('does not call a fresh draft "on hold" just because readiness is pending', () => {
    // Every track is created at readiness 'pending' and stays there until it is
    // published, so treating any non-ready value as a hold would put an amber
    // chip on every recording anyone has ever added.
    expect(describeTrackState(track({ readiness: 'pending' })).label).toBe('Draft, no checkpoints');
    expect(describeTrackState(track({ readiness: 'pending' })).colour).toBe('default');
  });

  it('treats a missing readiness as ready, which is what the column default means', () => {
    const state = describeTrackState(
      track({ status: 'published', readiness: null as never, section_count: 2 }),
    );
    expect(state.live).toBe(true);
  });

  it('counts one checkpoint in the singular', () => {
    expect(describeTrackState(track({ section_count: 1 })).label).toBe('Draft, 1 checkpoint');
  });
});

describe('buildLanguageRows', () => {
  it('lists every offered language, recording or not, in the configured order', () => {
    const rows = buildLanguageRows(OFFERED, [track()]);
    expect(rows.map((r) => r.code)).toEqual(['en', 'ta']);
    expect(rows[0].track).not.toBeNull();
    expect(rows[1].track).toBeNull();
    expect(rows[1].state.label).toBe('Not added');
  });

  it('shows a language that has a recording but is no longer offered', () => {
    // Removing a language from the list does not remove the recording, and a
    // recording its own dialog cannot show is how one gets orphaned while
    // students are still watching it.
    const rows = buildLanguageRows(OFFERED, [
      track({ id: 'track-hi', language: 'hi', language_label: 'हिन्दी', status: 'published', readiness: 'ready' }),
    ]);
    expect(rows.map((r) => r.code)).toEqual(['en', 'ta', 'hi']);
    expect(rows[2].label).toBe('हिन्दी');
    expect(rows[2].state.live).toBe(true);
  });

  it('falls back to the bare code when a removed language stored no label', () => {
    const rows = buildLanguageRows(OFFERED, [
      track({ language: 'ml', language_label: '' }),
    ]);
    expect(rows.find((r) => r.code === 'ml')!.label).toBe('ml');
  });

  it('keeps one row per language when the data holds a duplicate', () => {
    const rows = buildLanguageRows(OFFERED, [track({ id: 'a' }), track({ id: 'b' })]);
    expect(rows.filter((r) => r.code === 'en')).toHaveLength(1);
    expect(rows.find((r) => r.code === 'en')!.track!.id).toBe('a');
  });

  it('returns the full list for a chapter with no recordings at all', () => {
    const rows = buildLanguageRows(OFFERED, []);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.track === null)).toBe(true);
  });
});
