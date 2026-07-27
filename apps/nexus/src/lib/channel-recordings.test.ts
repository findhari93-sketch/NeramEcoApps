import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  matchRecordingToClass,
  parseRecordingFileName,
  fetchRecordingsFromChannel,
  istDateOf,
  type RecordingFile,
} from './channel-recordings';

function rec(name: string, createdDateTime: string): RecordingFile {
  return { name, createdDateTime, webUrl: `https://sp/${name}`, size: 1 };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('istDateOf', () => {
  it('reads the IST day, not the UTC day', () => {
    // 19:00 UTC on the 20th is 00:30 IST on the 21st.
    expect(istDateOf('2026-07-20T19:00:00Z')).toBe('2026-07-21');
    expect(istDateOf('2026-07-20T13:30:00Z')).toBe('2026-07-20');
  });
});

describe('parseRecordingFileName', () => {
  it('reads subject and IST start out of the Teams convention', () => {
    expect(
      parseRecordingFileName('Class by Ar Hari Babu-20260720_190023-Meeting Recording.mp4'),
    ).toEqual({ subject: 'Class by Ar Hari Babu', startedAt: '2026-07-20T19:00:23' });
  });

  it('handles the underscored "Meeting in _General_" form', () => {
    expect(parseRecordingFileName('Meeting in _General_-20260703_183000-Meeting Recording.mp4'))
      .toEqual({ subject: 'Meeting in  General', startedAt: '2026-07-03T18:30:00' });
  });

  it('returns null for anything that is not a timestamped recording', () => {
    expect(parseRecordingFileName('random notes.mp4')).toBeNull();
    expect(parseRecordingFileName('Class-20261320_190000-Meeting Recording.mp4')).toBeNull();
  });
});

describe('matchRecordingToClass', () => {
  const cls = { scheduled_date: '2026-07-20', start_time: '19:00:00', title: 'Class by Ar Hari Babu' };

  it('matches a recording created shortly after a 19:00 IST class', () => {
    // 19:00 IST == 13:30 UTC. 15:12 UTC is 1h42m later, inside the 3h backfill window.
    const r = rec('Class by Ar Hari Babu-20260720_190000-Meeting Recording.mp4', '2026-07-20T15:12:00Z');
    expect(matchRecordingToClass([r], cls, { toleranceHours: 3 })?.name).toBe(r.name);
  });

  it('picks the closest recording when two land the same evening', () => {
    const early = rec('Session A-20260720_170000-Meeting Recording.mp4', '2026-07-20T12:00:00Z');
    const onTime = rec('Session B-20260720_190000-Meeting Recording.mp4', '2026-07-20T14:05:00Z');
    expect(matchRecordingToClass([early, onTime], cls, { toleranceHours: 3 })?.name).toBe(onTime.name);
  });

  it('does not confuse the UTC day with the IST day', () => {
    // 2026-07-20T20:10 IST is 14:40Z on the 20th; a 21:00 IST class the same
    // evening must still match even though the old code compared date strings.
    const late = { scheduled_date: '2026-07-20', start_time: '21:00:00', title: 'Late class' };
    const r = rec('Late class-20260720_210500-Meeting Recording.mp4', '2026-07-20T15:40:00Z');
    expect(matchRecordingToClass([r], late, { toleranceHours: 1.5 })?.name).toBe(r.name);
  });

  it('falls back to a title-word match on the same IST day', () => {
    const far = rec('Class by Ar Hari Babu-20260720_190000-Meeting Recording.mp4', '2026-07-20T18:00:00Z');
    expect(matchRecordingToClass([far], cls, { toleranceHours: 1 })?.name).toBe(far.name);
  });

  it('returns null when fuzzy fallbacks are disabled and nothing is in tolerance', () => {
    const far = rec('Class by Ar Hari Babu-20260720_190000-Meeting Recording.mp4', '2026-07-20T18:00:00Z');
    expect(matchRecordingToClass([far], cls, { toleranceHours: 1, allowFuzzy: false })).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(matchRecordingToClass([], cls)).toBeNull();
  });
});

describe('fetchRecordingsFromChannel', () => {
  const folder = { id: 'folder1', parentReference: { driveId: 'drive1' } };

  function jsonRes(body: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => body } as Response;
  }

  it('follows @odata.nextLink and keeps only video files', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(folder))
      .mockResolvedValueOnce(
        jsonRes({
          value: [
            { name: 'a.mp4', webUrl: 'u1', createdDateTime: '2026-07-01T00:00:00Z', size: 1 },
            { name: 'notes.txt', webUrl: 'u2', createdDateTime: '2026-07-01T00:00:00Z', size: 1 },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/page2',
        }),
      )
      .mockResolvedValueOnce(
        jsonRes({
          value: [{ name: 'b.mkv', webUrl: 'u3', createdDateTime: '2026-07-02T00:00:00Z', size: 1 }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRecordingsFromChannel('t', 'team1', 'chan1', { maxItems: 500 });
    expect(out.map((r) => r.name)).toEqual(['a.mp4', 'b.mkv']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops at maxItems without asking for another page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(folder))
      .mockResolvedValueOnce(
        jsonRes({
          value: [
            { name: 'a.mp4', webUrl: 'u1', createdDateTime: '2026-07-01T00:00:00Z', size: 1 },
            { name: 'b.mp4', webUrl: 'u2', createdDateTime: '2026-07-02T00:00:00Z', size: 1 },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/page2',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRecordingsFromChannel('t', 'team1', 'chan1', { maxItems: 1 });
    expect(out).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the channel root when there is no Recordings subfolder', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(folder))
      .mockResolvedValueOnce(jsonRes({ error: 'nope' }, false, 404))
      .mockResolvedValueOnce(
        jsonRes({
          value: [{ name: 'root.mp4', webUrl: 'u', createdDateTime: '2026-07-01T00:00:00Z', size: 1 }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRecordingsFromChannel('t', 'team1', 'chan1');
    expect(out.map((r) => r.name)).toEqual(['root.mp4']);
  });
});
