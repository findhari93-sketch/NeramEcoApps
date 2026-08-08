import { describe, it, expect } from 'vitest';
import {
  describeTrackState,
  buildLanguageRows,
  describeRecordingUrl,
  type RecordingTrack,
} from './chapter-recordings';

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
  recording_url: 'https://neramclasses.sharepoint.com/sites/Neram/Recordings/ch3-en.mp4',
  ...over,
});

const OFFERED = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
];

/**
 * Naming the attached video.
 *
 * The dialog could show a teacher the STATE of a recording but never which file
 * it was, so "Change" would have been a button to swap something unnamed for
 * something else. Derived rather than stored precisely so that every recording
 * attached before this existed gets a name too.
 */
describe('describeRecordingUrl', () => {
  it('pulls the file name out of a Stream player link, not the aspx page name', () => {
    // The shape that matters most: the pathname alone says "stream.aspx", which
    // would label every Stream recording on the site identically.
    expect(
      describeRecordingUrl(
        'https://neramclasses.sharepoint.com/sites/Neram/_layouts/15/stream.aspx?id=%2Fsites%2FNeram%2FRecordings%2FCh3%20English.mp4&web=1',
      ),
    ).toBe('Ch3 English.mp4');
  });

  it('decodes a percent-encoded name on a plain path', () => {
    expect(
      describeRecordingUrl(
        'https://neramclasses.sharepoint.com/sites/Neram/Shared%20Documents/Ch3%20English.mp4',
      ),
    ).toBe('Ch3 English.mp4');
  });

  it('names a YouTube recording by its id, because it has no file name at all', () => {
    expect(describeRecordingUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'YouTube video dQw4w9WgXcQ',
    );
    expect(describeRecordingUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'YouTube video dQw4w9WgXcQ',
    );
  });

  it('falls back to the host for a share link, rather than showing a token as a file name', () => {
    // A /:v:/ share link ends in an opaque id. Presenting that as a file name
    // would read as though the teacher had attached something called "EaBc123".
    expect(describeRecordingUrl('https://neramclasses.sharepoint.com/:v:/s/Neram/EaBc123')).toBe(
      'neramclasses.sharepoint.com',
    );
  });

  it('says so plainly when there is no video', () => {
    expect(describeRecordingUrl(null)).toBe('No video attached');
    expect(describeRecordingUrl('')).toBe('No video attached');
    expect(describeRecordingUrl('   ')).toBe('No video attached');
  });

  it('hands back a non-URL unchanged, so a teacher can see their own typo', () => {
    expect(describeRecordingUrl('sharepoint.com/ch3.mp4')).toBe('sharepoint.com/ch3.mp4');
  });

  it('survives a stray percent instead of throwing on decodeURIComponent', () => {
    expect(
      describeRecordingUrl('https://neramclasses.sharepoint.com/sites/Neram/100%discount.mp4'),
    ).toBe('100%discount.mp4');
  });
});

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
