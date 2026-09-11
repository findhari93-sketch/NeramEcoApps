// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Where a chapter recording's transcript comes from, and when it has to go.
 *
 * Two jobs here. A recording's stored transcript must be forgotten when its
 * video is replaced: resolveTrackTranscript serves the stored copy first, so a
 * copy left behind cut the NEW video into quizzes with the OLD video's words.
 *
 * And a recording that came out of a Teams class should not need a transcript
 * uploaded by hand: the nightly sync already stores that class's WEBVTT, so the
 * recording borrows it.
 */

type Row = Record<string, unknown>;

const db = {
  tables: {} as Record<string, Row[]>,
  deletes: [] as { table: string; column: string; value: unknown }[],
  upserts: [] as { table: string; row: Row }[],
  deleteError: null as { message: string; code?: string } | null,
};

function builder(table: string) {
  let rows = [...(db.tables[table] || [])];
  const b: any = {
    select: () => b,
    eq: (column: string, value: unknown) => {
      rows = rows.filter((r) => r[column] === value);
      return b;
    },
    limit: (n: number) => {
      rows = rows.slice(0, n);
      return b;
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    delete: () => ({
      eq: async (column: string, value: unknown) => {
        db.deletes.push({ table, column, value });
        return { error: db.deleteError };
      },
    }),
    upsert: (row: Row) => {
      db.upserts.push({ table, row });
      return Promise.resolve({ error: null });
    },
  };
  return b;
}

const fakeClient = { from: (table: string) => builder(table) };

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => fakeClient,
}));

const fetchTranscriptFromSharePoint = vi.fn();
vi.mock('@/lib/sharepoint-transcript', () => ({
  fetchTranscriptFromSharePoint: (...args: unknown[]) => fetchTranscriptFromSharePoint(...args),
}));

import { forgetTrackTranscript, findClassTranscriptVtt, resolveTrackTranscript } from './track-transcript';

const VTT = [
  'WEBVTT',
  '',
  '00:00:01.000 --> 00:00:04.000',
  'Good evening everyone.',
  '',
  '00:00:05.000 --> 00:00:09.000',
  'Today we start with river valley civilisations.',
  '',
].join('\n');

const RECORDING_URL =
  'https://nerasmclasses.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/class-videos/Class-20260720_190023-Meeting%20Recording.mp4';
const TEAMS_NAME = 'Class by Ar Hari Babu-20260720_190023-Meeting Recording.mp4';

beforeEach(() => {
  db.tables = {};
  db.deletes = [];
  db.upserts = [];
  db.deleteError = null;
  fetchTranscriptFromSharePoint.mockReset();
});

describe('forgetTrackTranscript', () => {
  it('deletes the stored transcript of that one recording and nothing else', async () => {
    await forgetTrackTranscript('track-1');
    expect(db.deletes).toEqual([
      { table: 'nexus_class_recap_transcripts', column: 'recap_id', value: 'track-1' },
    ]);
  });

  it('throws when the delete fails, so a new video can never keep the old words', async () => {
    db.deleteError = { message: 'permission denied', code: '42501' };
    await expect(forgetTrackTranscript('track-1')).rejects.toThrow(/permission denied/);
  });
});

describe('findClassTranscriptVtt', () => {
  it('finds the class whose recording is this exact file', async () => {
    db.tables = {
      nexus_scheduled_classes: [
        { id: 'class-1', recording_url: RECORDING_URL, scheduled_date: '2026-07-20', start_time: '19:00:00' },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1', vtt: VTT, status: 'ok' }],
    };
    await expect(
      findClassTranscriptVtt(fakeClient, { recordingUrl: RECORDING_URL, recordingFileName: null }),
    ).resolves.toEqual({ classId: 'class-1', vtt: VTT });
  });

  it('matches a Teams recording to its class by the time in its name', async () => {
    db.tables = {
      nexus_scheduled_classes: [
        { id: 'other-day', recording_url: null, scheduled_date: '2026-07-21', start_time: '19:00:00' },
        { id: 'class-1', recording_url: null, scheduled_date: '2026-07-20', start_time: '19:00:00' },
      ],
      nexus_class_transcripts: [
        { class_id: 'other-day', vtt: 'WEBVTT', status: 'ok' },
        { class_id: 'class-1', vtt: VTT, status: 'ok' },
      ],
    };
    await expect(
      findClassTranscriptVtt(fakeClient, { recordingUrl: 'https://elsewhere/moved.mp4', recordingFileName: TEAMS_NAME }),
    ).resolves.toEqual({ classId: 'class-1', vtt: VTT });
  });

  it('ignores a class on the same day that started too far from the recording', async () => {
    db.tables = {
      nexus_scheduled_classes: [
        { id: 'late-class', recording_url: null, scheduled_date: '2026-07-20', start_time: '22:30:00' },
      ],
      nexus_class_transcripts: [{ class_id: 'late-class', vtt: VTT, status: 'ok' }],
    };
    await expect(
      findClassTranscriptVtt(fakeClient, { recordingUrl: null, recordingFileName: TEAMS_NAME }),
    ).resolves.toBeNull();
  });

  it('skips a class whose transcript was never stored', async () => {
    db.tables = {
      nexus_scheduled_classes: [
        { id: 'class-1', recording_url: RECORDING_URL, scheduled_date: '2026-07-20', start_time: '19:00:00' },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1', vtt: null, status: 'missing' }],
    };
    await expect(
      findClassTranscriptVtt(fakeClient, { recordingUrl: RECORDING_URL, recordingFileName: TEAMS_NAME }),
    ).resolves.toBeNull();
  });

  it('finds nothing for a hand-named file no class points at', async () => {
    db.tables = { nexus_scheduled_classes: [], nexus_class_transcripts: [] };
    await expect(
      findClassTranscriptVtt(fakeClient, { recordingUrl: RECORDING_URL, recordingFileName: 'Ch1 History Tamil.mp4' }),
    ).resolves.toBeNull();
  });
});

describe('resolveTrackTranscript', () => {
  it('borrows the transcript Teams gave the class this recording came from, and keeps a copy', async () => {
    db.tables = {
      nexus_class_recap_transcripts: [],
      nexus_scheduled_classes: [
        { id: 'class-1', recording_url: RECORDING_URL, scheduled_date: '2026-07-20', start_time: '19:00:00' },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1', vtt: VTT, status: 'ok' }],
    };

    const transcript = await resolveTrackTranscript({
      trackId: 'track-1',
      recordingUrl: RECORDING_URL,
      recordingFileName: TEAMS_NAME,
      msToken: null,
      videoSource: 'sharepoint',
    });

    expect(transcript.source).toBe('class');
    expect(transcript.entries.length).toBeGreaterThan(0);
    expect(fetchTranscriptFromSharePoint).not.toHaveBeenCalled();
    expect(db.upserts[0]).toMatchObject({
      table: 'nexus_class_recap_transcripts',
      row: { recap_id: 'track-1', source: 'class', status: 'ok' },
    });
  });

  it('still prefers a transcript the teacher just uploaded', async () => {
    db.tables = {
      nexus_scheduled_classes: [
        { id: 'class-1', recording_url: RECORDING_URL, scheduled_date: '2026-07-20', start_time: '19:00:00' },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1', vtt: VTT, status: 'ok' }],
    };
    const transcript = await resolveTrackTranscript({
      trackId: 'track-1',
      recordingUrl: RECORDING_URL,
      vttContent: VTT,
      videoSource: 'sharepoint',
    });
    expect(transcript.source).toBe('upload');
  });
});
