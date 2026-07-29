import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  matchRecordingToClass,
  parseRecordingFileName,
  fetchRecordingsFromChannel,
  fetchOrganizerRecordings,
  isSubstantialRecording,
  istDateOf,
  type RecordingFile,
} from './channel-recordings';

/** A real class in this tenant: an hour or so, a few hundred MB. */
function rec(name: string, createdDateTime: string): RecordingFile {
  return {
    name,
    createdDateTime,
    webUrl: `https://sp/${name}`,
    size: 370 * 1024 * 1024,
    durationMs: 62 * 60 * 1000,
  };
}

/**
 * A recording someone started and abandoned.
 *
 * Taken from the real one: a student joined the 28 July class early, started
 * recording, and left 64 seconds of nothing at 0.2 MB. The class itself was 66
 * minutes and 370 MB, so the two are three orders of magnitude apart.
 */
function stub(name: string, createdDateTime: string, over: Partial<RecordingFile> = {}): RecordingFile {
  return { name, createdDateTime, webUrl: `https://sp/${name}`, size: 218_000, durationMs: 64_000, ...over };
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

  it('ignores a stub someone started before the class, even though it is closer', () => {
    // The 28 July case. A student joined early, started a recording and left 64
    // seconds of nothing. Purely on time it beats the real class recording, which
    // Teams does not create until the teacher presses record.
    const junk = stub('Class by Ar Hari Babu-20260720_185500-Meeting Recording.mp4', '2026-07-20T13:28:00Z');
    const real = rec('Class by Ar Hari Babu-20260720_190500-Meeting Recording.mp4', '2026-07-20T13:35:00Z');
    expect(matchRecordingToClass([junk, real], cls)?.name).toBe(real.name);
  });

  it('says there is no recording rather than handing a stub to students', () => {
    // Every fuzzy fallback has to skip it too: the title matches and it is the
    // only file that day, so "the only recording that day" would otherwise grab it.
    const junk = stub('Class by Ar Hari Babu-20260720_185500-Meeting Recording.mp4', '2026-07-20T13:28:00Z');
    expect(matchRecordingToClass([junk], cls)).toBeNull();
  });

  it('judges by size when Graph reports no duration', () => {
    const junk = stub('Class by Ar Hari Babu-20260720_185500-Meeting Recording.mp4', '2026-07-20T13:28:00Z', {
      durationMs: undefined,
    });
    expect(matchRecordingToClass([junk], cls)).toBeNull();
  });

  it('keeps a file when neither duration nor size is known', () => {
    // Fail open. A recording still being processed can report nothing useful, and
    // losing a real class is worse than attaching a short one.
    const unknown = stub('Class by Ar Hari Babu-20260720_190500-Meeting Recording.mp4', '2026-07-20T13:35:00Z', {
      durationMs: undefined,
      size: 0,
    });
    expect(matchRecordingToClass([unknown], cls)?.name).toBe(unknown.name);
  });
});

describe('isSubstantialRecording', () => {
  const base = { name: 'x.mp4', webUrl: 'u', createdDateTime: '2026-07-28T13:15:07Z' };

  it('rejects the 64-second stub and accepts the 66-minute class', () => {
    expect(isSubstantialRecording({ ...base, size: 218_000, durationMs: 64_000 })).toBe(false);
    expect(isSubstantialRecording({ ...base, size: 388_000_000, durationMs: 3_947_584 })).toBe(true);
  });

  it('prefers duration over size, so a long low-bitrate recording still counts', () => {
    expect(isSubstantialRecording({ ...base, size: 1_000_000, durationMs: 40 * 60 * 1000 })).toBe(true);
  });

  it('treats unknown metadata as substantial', () => {
    expect(isSubstantialRecording({ ...base, size: 0 })).toBe(true);
  });
});

describe('fetchRecordingsFromChannel', () => {
  const folder = { id: 'folder1', parentReference: { driveId: 'drive1' } };

  function jsonRes(body: unknown, ok = true, status = 200) {
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }

  it('never asks for $orderby, which SharePoint drives reject with 400 notSupported', async () => {
    // Regression: the listing carried `$orderby=createdDateTime desc`, which Graph
    // refuses on a SharePoint document library. Every channel recording was then
    // silently invisible to Nexus, because the 400 degraded to an empty list.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(folder))
      .mockResolvedValueOnce(jsonRes({ value: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchRecordingsFromChannel('t', 'team1', 'chan1');

    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain('$orderby');
    }
  });

  it('asks for the video facet, so a stub can be told from a class', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(folder))
      .mockResolvedValueOnce(
        jsonRes({
          value: [
            {
              name: 'class.mp4',
              webUrl: 'u1',
              createdDateTime: '2026-07-28T13:28:38Z',
              size: 388_000_000,
              video: { duration: 3_947_584 },
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRecordingsFromChannel('t', 'team1', 'chan1');
    expect(String(fetchMock.mock.calls[1][0])).toContain('video');
    expect(out[0].durationMs).toBe(3_947_584);
  });

  it('returns newest first, since Graph hands back an arbitrary order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(folder))
      .mockResolvedValueOnce(
        jsonRes({
          value: [
            { name: 'mid.mp4', webUrl: 'u2', createdDateTime: '2026-07-14T13:38:23Z', size: 1 },
            { name: 'newest.mp4', webUrl: 'u1', createdDateTime: '2026-07-22T13:33:19Z', size: 1 },
            { name: 'oldest.mp4', webUrl: 'u3', createdDateTime: '2026-07-03T13:13:33Z', size: 1 },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRecordingsFromChannel('t', 'team1', 'chan1');
    expect(out.map((r) => r.name)).toEqual(['newest.mp4', 'mid.mp4', 'oldest.mp4']);
  });

  it('throws instead of reporting "no recordings" when the listing fails', async () => {
    // A permission or query regression must never read as "this class was not
    // recorded". Only a 404 (no Recordings subfolder yet) is a normal outcome.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(folder))
      .mockResolvedValueOnce(
        jsonRes({ error: { code: 'notSupported', message: 'Operation not supported' } }, false, 400),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRecordingsFromChannel('t', 'team1', 'chan1')).rejects.toThrow(/400/);
  });

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
    // b.mkv is on page 2 but is the newer file, so it leads.
    expect(out.map((r) => r.name)).toEqual(['b.mkv', 'a.mp4']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('applies maxItems to the newest files, not to whichever page arrived first', async () => {
    // Graph returns SharePoint children in an arbitrary order and will not sort
    // them for us, so truncating mid-paging would keep an arbitrary subset. Every
    // page has to be read before "the newest N" means anything.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(folder))
      .mockResolvedValueOnce(
        jsonRes({
          value: [{ name: 'old.mp4', webUrl: 'u1', createdDateTime: '2026-07-01T00:00:00Z', size: 1 }],
          '@odata.nextLink': 'https://graph.microsoft.com/page2',
        }),
      )
      .mockResolvedValueOnce(
        jsonRes({
          value: [{ name: 'new.mp4', webUrl: 'u2', createdDateTime: '2026-07-02T00:00:00Z', size: 1 }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRecordingsFromChannel('t', 'team1', 'chan1', { maxItems: 1 });
    expect(out.map((r) => r.name)).toEqual(['new.mp4']);
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

describe('fetchOrganizerRecordings', () => {
  function jsonRes(body: unknown, ok = true, status = 200) {
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }

  it('reads the organizer OneDrive Recordings folder, newest first', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonRes({
        value: [
          { name: 'part1.mp4', webUrl: 'u1', createdDateTime: '2026-07-28T13:15:07Z', size: 1 },
          { name: 'part2.mp4', webUrl: 'u2', createdDateTime: '2026-07-28T13:28:38Z', size: 1 },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchOrganizerRecordings('t', 'oid-1');
    expect(out.map((r) => r.name)).toEqual(['part2.mp4', 'part1.mp4']);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/users/oid-1/drive/root:/Recordings:/children');
  });

  it('treats a missing Recordings folder as "nothing recorded", not an error', async () => {
    // Any organizer who has never recorded to OneDrive has no such folder. That is
    // the common case for a channel meeting and must not abort the whole sync.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonRes({ error: 'nope' }, false, 404)));
    await expect(fetchOrganizerRecordings('t', 'oid-1')).resolves.toEqual([]);
  });

  it('throws on a real failure so it cannot read as "no recording"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonRes({ error: 'denied' }, false, 403)));
    await expect(fetchOrganizerRecordings('t', 'oid-1')).rejects.toThrow(/403/);
  });
});
