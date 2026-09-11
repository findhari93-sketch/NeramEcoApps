// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('./graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'test-token'),
}));

import { countQuestionsByTrack, videoRefFromBody } from './track-recording';

/**
 * Two small pieces the recordings routes share: counting a track's questions for
 * the "4 checkpoints, 40 questions" line, and reading which video a request
 * means.
 */

type Row = Record<string, unknown>;

function fakeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] || [])];
      const b: any = {
        select: () => b,
        in: (column: string, values: unknown[]) => {
          rows = rows.filter((r) => values.includes(r[column]));
          return b;
        },
        is: (column: string, value: unknown) => {
          rows = rows.filter((r) => (r[column] ?? null) === value);
          return b;
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve, reject),
      };
      return b;
    },
  };
}

describe('countQuestionsByTrack', () => {
  it('counts the questions on each track, leaving out archived checkpoints', async () => {
    const supabase = fakeClient({
      nexus_class_recap_sections: [
        { id: 's1', recap_id: 't1', archived_at: null },
        { id: 's2', recap_id: 't1', archived_at: null },
        { id: 's3', recap_id: 't1', archived_at: '2026-09-01T00:00:00Z' },
        { id: 's4', recap_id: 't2', archived_at: null },
      ],
      nexus_class_recap_questions: [
        { section_id: 's1' },
        { section_id: 's1' },
        { section_id: 's2' },
        { section_id: 's3' },
        { section_id: 's4' },
      ],
    });
    const counts = await countQuestionsByTrack(supabase, ['t1', 't2', 't3']);
    expect(counts.get('t1')).toBe(3);
    expect(counts.get('t2')).toBe(1);
    expect(counts.get('t3') ?? 0).toBe(0);
  });

  it('asks nothing when there are no tracks', async () => {
    const from = vi.fn();
    const counts = await countQuestionsByTrack({ from }, []);
    expect(counts.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('videoRefFromBody', () => {
  it('prefers the ids of a file picked in Nexus over any link', () => {
    expect(
      videoRefFromBody({ drive_id: ' b!lib ', item_id: '01ITEM', recording_url: 'https://x.sharepoint.com/a.mp4' }),
    ).toEqual({ driveId: 'b!lib', itemId: '01ITEM' });
  });

  it('falls back to a pasted link, under either name', () => {
    expect(videoRefFromBody({ recording_url: ' https://x.sharepoint.com/a.mp4 ' })).toBe(
      'https://x.sharepoint.com/a.mp4',
    );
    expect(videoRefFromBody({ url: 'https://x.sharepoint.com/b.mp4' })).toBe('https://x.sharepoint.com/b.mp4');
  });

  it('means no video when there is nothing usable', () => {
    expect(videoRefFromBody(null)).toBeNull();
    expect(videoRefFromBody({})).toBeNull();
    expect(videoRefFromBody({ drive_id: 'b!lib' })).toBeNull();
    expect(videoRefFromBody({ recording_url: '   ' })).toBeNull();
    expect(videoRefFromBody({ drive_id: 1, item_id: 2 })).toBeNull();
  });
});
