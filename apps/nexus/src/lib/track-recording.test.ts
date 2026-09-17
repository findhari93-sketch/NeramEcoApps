// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('./graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'test-token'),
}));

import {
  describeTrackRecording,
  decidePrepare,
  withoutUnpassableCheckpoints,
  stampTrackGate,
} from './track-recording';
import { VideoItemError, type ResolvedVideoItem } from './sharepoint-video';

/**
 * The server side of one language's recording on the recordings page: what the
 * video is, whether it may be used, and whether preparing it should run.
 */

type Row = Record<string, unknown>;

const LIBRARY: ResolvedVideoItem = {
  driveId: 'b!library',
  itemId: '01LIB',
  name: 'Ch1 History Tamil.mp4',
  sizeBytes: 877174153,
  durationSeconds: 3758,
  webUrl:
    'https://nerasmclasses.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/class-videos/Ch1%20History%20Tamil.mp4',
  folderPath: 'nexus/class-videos',
  driveType: 'documentLibrary',
  mimeType: 'video/mp4',
  isFolder: false,
};

const ONEDRIVE: ResolvedVideoItem = {
  ...LIBRARY,
  driveId: 'b!onedrive',
  itemId: '01OD',
  name: '1.History of Architecture.mp4',
  webUrl:
    'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/Documents/CommonPC/1.History%20of%20Architecture.mp4',
  folderPath: 'CommonPC/1 - Class/2/Study materials/10 chapters video edited',
  driveType: 'business',
};

const DISPFORM =
  'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/Documents/Forms/DispForm.aspx?ID=10171';

const row = (over: Partial<Parameters<typeof describeTrackRecording>[0]> = {}) => ({
  video_source: 'sharepoint',
  recording_url: DISPFORM,
  recording_file_name: null,
  video_duration_seconds: null,
  ...over,
});

const failing = (code: ConstructorParameters<typeof VideoItemError>[0]) => async () => {
  throw new VideoItemError(code);
};

describe('describeTrackRecording', () => {
  it('has nothing to say about a track with no video', async () => {
    expect(await describeTrackRecording(row({ recording_url: null }))).toEqual({
      recording: null,
      backfill: {},
      item: null,
    });
  });

  it('names the file, and fills in what the row was missing', async () => {
    const d = await describeTrackRecording(row(), { resolve: async () => LIBRARY });
    expect(d.recording).toEqual({
      name: 'Ch1 History Tamil.mp4',
      web_url: LIBRARY.webUrl,
      folder_path: 'nexus/class-videos',
      size_bytes: 877174153,
      duration_seconds: 3758,
      drive_type: 'documentLibrary',
      problem: null,
    });
    expect(d.backfill).toEqual({
      recording_file_name: 'Ch1 History Tamil.mp4',
      video_duration_seconds: 3758,
      recording_drive_id: 'b!library',
      recording_item_id: '01LIB',
    });
    expect(d.item).toBe(LIBRARY);
  });

  it('does not rewrite a name or a length the row already holds', async () => {
    const d = await describeTrackRecording(
      row({ recording_file_name: 'Renamed.mp4', video_duration_seconds: 3700 }),
      { resolve: async () => LIBRARY },
    );
    expect(d.backfill).toEqual({ recording_drive_id: 'b!library', recording_item_id: '01LIB' });
  });

  it('writes nothing back for a row whose ids and address already match the file', async () => {
    const resolve = vi.fn(async () => LIBRARY);
    const d = await describeTrackRecording(
      row({
        recording_url: LIBRARY.webUrl,
        recording_drive_id: 'b!library',
        recording_item_id: '01LIB',
        recording_file_name: 'Ch1 History Tamil.mp4',
        video_duration_seconds: 3758,
      }),
      { resolve },
    );
    expect(d.backfill).toEqual({});
    expect(d.recording?.problem).toBeNull();
    expect(resolve).toHaveBeenCalledWith({ driveId: 'b!library', itemId: '01LIB' });
  });

  it('keeps playing a video whose folder was moved, and stores its new address', async () => {
    // The prod English chapters on 2026-09-17: the stored path went dead when
    // nexus/class-videos was tidied into "English Class".
    const OLD_PATH =
      'https://nerasmclasses.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/class-videos/Old%20Folder/Ch1%20History%20Tamil.mp4';
    const d = await describeTrackRecording(
      row({
        recording_url: OLD_PATH,
        recording_drive_id: 'b!library',
        recording_item_id: '01LIB',
        recording_file_name: 'Ch1 History Tamil.mp4',
        video_duration_seconds: 3758,
      }),
      {
        resolve: async (ref) => {
          if (typeof ref === 'string') throw new VideoItemError('NOT_FOUND');
          return LIBRARY;
        },
      },
    );
    expect(d.recording?.problem).toBeNull();
    expect(d.recording?.web_url).toBe(LIBRARY.webUrl);
    expect(d.backfill).toEqual({ recording_url: LIBRARY.webUrl });
  });

  it('flags a recording kept in OneDrive, which is exactly the prod Tamil track', async () => {
    const d = await describeTrackRecording(row(), { resolve: async () => ONEDRIVE });
    expect(d.recording?.problem).toBe('RECORDING_IN_ONEDRIVE');
    expect(d.recording?.name).toBe('1.History of Architecture.mp4');
  });

  it('reports a file that has gone, and never shows the link as its name', async () => {
    const d = await describeTrackRecording(row(), { resolve: failing('NOT_FOUND') });
    expect(d.recording?.problem).toBe('NOT_FOUND');
    expect(d.recording?.name).not.toMatch(/\.aspx$/);
    expect(d.backfill).toEqual({});
  });

  it('treats a stored link SharePoint no longer recognises as a missing file', async () => {
    const d = await describeTrackRecording(row(), { resolve: failing('LINK_NOT_RECOGNISED') });
    expect(d.recording?.problem).toBe('NOT_FOUND');
  });

  it('calls it unchecked rather than broken when SharePoint is down or slow', async () => {
    const down = await describeTrackRecording(row(), { resolve: failing('GRAPH_UNAVAILABLE') });
    expect(down.recording?.problem).toBe('UNRESOLVED');

    const slow = await describeTrackRecording(row(), {
      resolve: () => new Promise<ResolvedVideoItem>(() => {}),
      timeoutMs: 5,
    });
    expect(slow.recording?.problem).toBe('UNRESOLVED');
  });

  it('leaves a YouTube recording alone, since there is no SharePoint file to look up', async () => {
    const resolve = vi.fn();
    const d = await describeTrackRecording(
      row({
        video_source: 'youtube',
        recording_url: 'https://youtu.be/dQw4w9WgXcQ',
        video_duration_seconds: 600,
      }),
      { resolve },
    );
    expect(resolve).not.toHaveBeenCalled();
    expect(d.recording).toMatchObject({ name: 'YouTube video dQw4w9WgXcQ', problem: null, duration_seconds: 600 });
  });
});

describe('decidePrepare', () => {
  const base = { sectionCount: 0, attemptCount: 0, redo: false, hasUpload: false, confirmedReset: false };

  it('runs for a recording with no checkpoints yet', () => {
    expect(decidePrepare(base)).toBe('run');
  });

  it('does nothing when checkpoints exist and nobody asked to redo them', () => {
    expect(decidePrepare({ ...base, sectionCount: 4 })).toBe('already_prepared');
  });

  it('redoes checkpoints nobody has attempted without asking', () => {
    expect(decidePrepare({ ...base, sectionCount: 4, redo: true })).toBe('run');
  });

  it('asks before replacing checkpoints students have already attempted', () => {
    expect(decidePrepare({ ...base, sectionCount: 4, hasUpload: true, attemptCount: 3 })).toBe('needs_confirmation');
    expect(
      decidePrepare({ ...base, sectionCount: 4, redo: true, attemptCount: 3, confirmedReset: true }),
    ).toBe('run');
  });
});

describe('withoutUnpassableCheckpoints', () => {
  it('drops blank questions, then any checkpoint left with none', () => {
    expect(
      withoutUnpassableCheckpoints([
        { title: 'a', questions: [{ question_text: 'Why?' }, { question_text: '  ' }] },
        { title: 'b', questions: [{ question_text: '' }] },
        { title: 'c', questions: [] },
      ]),
    ).toEqual([{ title: 'a', questions: [{ question_text: 'Why?' }] }]);
  });
});

function fakeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] || [])];
      const b: any = {
        select: () => b,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((r) => r[column] === value);
          return b;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      };
      return b;
    },
  };
}

describe('stampTrackGate', () => {
  const tables = {
    nexus_settings: [
      {
        key: 'recap_defaults',
        value: { target_segment_seconds: 900, question_pool_per_segment: 15, questions_per_segment: 10, pass_percentage: 70 },
      },
    ],
    nexus_class_recaps: [{ id: 't1', question_pool_per_segment: 15, questions_per_segment: 10, pass_percentage: null }],
  };
  const twelve = Array.from({ length: 12 }, () => ({ question_text: 'q' }));

  it('serves the track setting and works the pass mark out from its percentage', async () => {
    const [stamped] = await stampTrackGate(fakeClient(tables), 't1', [
      { questions: twelve, min_questions_to_pass: null },
    ]);
    expect(stamped).toMatchObject({ questions_to_serve: 10, min_questions_to_pass: 7 });
  });

  it('keeps a pass mark the teacher set', async () => {
    const [stamped] = await stampTrackGate(fakeClient(tables), 't1', [
      { questions: twelve, min_questions_to_pass: 5 },
    ]);
    expect(stamped.min_questions_to_pass).toBe(5);
  });
});
