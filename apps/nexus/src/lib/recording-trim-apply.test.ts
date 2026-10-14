import { describe, it, expect, vi } from 'vitest';

vi.mock('./recording-source-cache', () => ({ evictMedia: vi.fn() }));

import { buildTrimSwitch, type SwitchInputs } from './recording-trim-apply';
import { buildCutMap } from './trim-map';

/**
 * Applying a trim to a class students have already started (founder,
 * 2026-10-14: trim all past classes, move their progress). Every stored time
 * must land on the same content in the trimmed copy, and come back on revert.
 */

const MAP = buildCutMap([
  [541, 2000],
  [2120, 4370],
]);

const trim = {
  id: 't1',
  class_id: 'c1',
  original_url: 'https://sp/orig.mp4',
  original_drive_id: 'd1',
  original_item_id: 'i-orig',
  original_duration_seconds: 4383,
  trimmed_url: 'https://sp/Trimmed/orig (trimmed).mp4',
  trimmed_drive_id: 'd1',
  trimmed_item_id: 'i-trim',
  trimmed_duration_seconds: 3709,
  removed_seconds: 674,
  cut_map: MAP,
};

const inputs = (over: Partial<SwitchInputs> = {}): SwitchInputs => ({
  mode: 'apply',
  trim,
  vttOriginal: 'WEBVTT\n\n00:10:00.000 --> 00:10:05.000\n<v Hari>Proportions.</v>',
  recaps: [
    {
      id: 'r1',
      sections: [
        { id: 's1', start_timestamp_seconds: 0, end_timestamp_seconds: 909 },
        { id: 's5', start_timestamp_seconds: 3429, end_timestamp_seconds: 4366 },
      ],
      progress: [
        // Inaya, parked at the start of the last section, on the ledger.
        {
          student_id: 'inaya',
          watch_version: 7,
          last_video_position_seconds: 3496,
          furthest_position_seconds: 3496,
          watched_seconds: 3450,
          played_ranges: [[0, 3496]],
        },
        // A pre-ledger row: a prefix stands in for its ranges.
        {
          student_id: 'jeshurun',
          watch_version: 0,
          last_video_position_seconds: 3546,
          furthest_position_seconds: 3546,
          watched_seconds: 3617,
          played_ranges: null,
        },
      ],
    },
  ],
  chapters: [
    { t: 0, label: 'Start' },
    { t: 600, label: 'Proportions' },
  ],
  ...over,
});

describe('buildTrimSwitch: apply', () => {
  const out = buildTrimSwitch(inputs());

  it('points the class and its recap at the trimmed copy', () => {
    expect(out.class).toEqual({
      trimmed_url: trim.trimmed_url,
      state: 'applied',
      removed_seconds: 674,
      duration_minutes: 62,
    });
    expect(out.recaps[0]).toMatchObject({ recording_url: trim.trimmed_url, item_id: 'i-trim', duration_seconds: 3709 });
  });

  it('moves checkpoint times', () => {
    expect(out.recaps[0].sections).toEqual([
      { id: 's1', start: 0, end: 368 },
      { id: 's5', start: 2768, end: 3705 },
    ]);
  });

  it('moves each student, keeping their version for the write guard', () => {
    const [inaya, jeshurun] = out.recaps[0].progress;
    expect(inaya).toEqual({ student_id: 'inaya', version: 7, pos: 2835, furthest: 2835, ranges: [[0, 2835]] });
    // min(3546, 3617 + 60) = 3546 as a prefix, then moved.
    expect(jeshurun).toMatchObject({ version: 0, pos: 2885, ranges: [[0, 2885]] });
  });

  it('remaps the transcript and chapters', () => {
    expect(out.vtt).toContain('00:00:59.000 --> 00:01:04.000');
    expect(out.chapters).toEqual([
      { t: 0, label: 'Start' },
      { t: 59, label: 'Proportions' },
    ]);
  });
});

describe('buildTrimSwitch: revert', () => {
  it('moves everything back to the original timeline and serves the original transcript', () => {
    const applied = buildTrimSwitch(inputs());
    const back = buildTrimSwitch(
      inputs({
        mode: 'revert',
        recaps: [
          {
            id: 'r1',
            sections: applied.recaps[0].sections.map((s) => ({
              id: s.id,
              start_timestamp_seconds: s.start,
              end_timestamp_seconds: s.end,
            })),
            progress: [
              {
                student_id: 'inaya',
                watch_version: 8,
                last_video_position_seconds: 2835,
                furthest_position_seconds: 2835,
                watched_seconds: 3450,
                played_ranges: [[0, 2835]],
              },
            ],
          },
        ],
      }),
    );
    expect(back.class.state).toBe('reverted');
    expect(back.recaps[0]).toMatchObject({ recording_url: trim.original_url, item_id: 'i-orig', duration_seconds: 4383 });
    expect(back.recaps[0].sections[1]).toEqual({ id: 's5', start: 3429, end: 4366 });
    expect(back.recaps[0].progress[0]).toMatchObject({ pos: 3496, ranges: [[541, 2000], [2120, 3496]] });
    expect(back.vtt).toContain('00:10:00.000 --> 00:10:05.000');
  });
});

describe('buildTrimSwitch: guards', () => {
  it('refuses a trim with no cut map', () => {
    expect(() => buildTrimSwitch(inputs({ trim: { ...trim, cut_map: null } }))).toThrow('TRIM_HAS_NO_CUT_MAP');
  });
});

/**
 * A checkpoint placed over the silent wait before class is emptied by the
 * trim (Islamic Architecture: 0:00 to 14:37, speech from 20:00). Left alone it
 * would be zero seconds long, its quiz would never open, and nobody could
 * complete the class. Its questions move to the next checkpoint instead.
 */
describe('buildTrimSwitch: a checkpoint the trim empties', () => {
  const map = buildCutMap([[1200, 5261]]);
  const islamic = { ...trim, cut_map: map, trimmed_duration_seconds: 4061 };
  const recap = {
    id: 'r1',
    sections: [
      { id: 'intro', start_timestamp_seconds: 0, end_timestamp_seconds: 877 },
      { id: 'phases', start_timestamp_seconds: 877, end_timestamp_seconds: 1709 },
      { id: 'loads', start_timestamp_seconds: 1709, end_timestamp_seconds: 2600 },
    ],
    progress: [],
    questions: [
      { id: 'q1', section_id: 'intro' },
      { id: 'q2', section_id: 'intro' },
      { id: 'q3', section_id: 'phases' },
    ],
  };

  it('folds it into the next checkpoint and retires it', () => {
    const out = buildTrimSwitch(inputs({ trim: islamic, recaps: [recap] }));
    expect(out.recaps[0].archive_sections).toEqual(['intro']);
    expect(out.recaps[0].move_questions).toEqual([{ ids: ['q1', 'q2'], to: 'phases' }]);
    expect(out.merged).toEqual([{ recap_id: 'r1', from: 'intro', to: 'phases', question_ids: ['q1', 'q2'] }]);
    // The neighbour now starts at the join, where the lesson begins.
    expect(out.recaps[0].sections.find((s) => s.id === 'phases')).toEqual({ id: 'phases', start: 0, end: 509 });
  });

  it('leaves checkpoints of a minute or more alone', () => {
    const out = buildTrimSwitch(inputs());
    expect(out.recaps[0].archive_sections).toEqual([]);
    expect(out.merged).toEqual([]);
  });

  it('undoes the fold exactly on revert', () => {
    const merged = [{ recap_id: 'r1', from: 'intro', to: 'phases', question_ids: ['q1', 'q2'] }];
    const out = buildTrimSwitch(
      inputs({
        mode: 'revert',
        trim: { ...islamic, plan: { merged } },
        recaps: [{ ...recap, sections: recap.sections.filter((s) => s.id !== 'intro') }],
      }),
    );
    expect(out.recaps[0].restore_sections).toEqual(['intro']);
    expect(out.recaps[0].move_questions).toEqual([{ ids: ['q1', 'q2'], to: 'intro' }]);
    expect(out.merged).toEqual([]);
  });
});
