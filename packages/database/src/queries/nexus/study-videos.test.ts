import { describe, it, expect } from 'vitest';
import {
  getStudyVideoState,
  listStudyVideoTracks,
  createStudyVideoTrack,
  TrackLanguageTakenError,
} from './study-videos';
import { createFakeDb } from './testing/fake-supabase';

/**
 * Which recordings a student is shown, and which of them gate the chapter test.
 *
 * The rule that matters here is that "exists" and "servable" are different
 * things. A chapter with a draft or held track must behave exactly like a
 * chapter with no track at all: the student never sees it, and it must not hold
 * the test shut. Gating on a recording nobody has published would trap a whole
 * cohort behind a video they are not allowed to open, and the only way out would
 * be a tutor noticing.
 */

const FILE = 'file-1';
const STUDENT = 'student-1';

type Rows = Record<string, unknown[]>;

/**
 * A Supabase query builder that is thenable, because these queries are awaited
 * both mid-chain (`.eq(...)`) and at a terminator (`.maybeSingle()`).
 */
function mockClient(rows: Rows) {
  const builder = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      neq: () => chain,
      not: () => chain,
      order: () => chain,
      maybeSingle: async () => ({ data: (rows[table] || [])[0] ?? null, error: null }),
      single: async () => ({ data: (rows[table] || [])[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows[table] || [], error: null }).then(resolve),
    };
    return chain;
  };
  return { from: builder } as never;
}

function track(over: Record<string, unknown> = {}) {
  return {
    id: 'track-en',
    study_file_id: FILE,
    language: 'en',
    language_label: 'English',
    title: 'English recording',
    status: 'published',
    readiness: 'ready',
    hold_reason: null,
    video_duration_seconds: 3600,
    ...over,
  };
}

describe('getStudyVideoState: only a servable recording reaches a student', () => {
  it('offers a published, ready track and gates the test on it', async () => {
    const state = await getStudyVideoState(
      FILE,
      STUDENT,
      mockClient({
        nexus_class_recaps: [track()],
        nexus_study_file_reads: [],
        nexus_class_recap_sections: [{ recap_id: 'track-en' }, { recap_id: 'track-en' }],
        nexus_class_recap_progress: [],
      }),
    );
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0].section_count).toBe(2);
    expect(state.requires_video).toBe(true);
  });

  it('hides a draft track and does NOT gate the test on it', async () => {
    const state = await getStudyVideoState(
      FILE,
      STUDENT,
      mockClient({
        nexus_class_recaps: [track({ status: 'draft' })],
        nexus_study_file_reads: [],
        nexus_class_recap_sections: [],
        nexus_class_recap_progress: [],
      }),
    );
    expect(state.tracks).toHaveLength(0);
    expect(state.requires_video).toBe(false);
  });

  it('hides a held track, so a failed generation cannot lock a cohort out', async () => {
    const state = await getStudyVideoState(
      FILE,
      STUDENT,
      mockClient({
        nexus_class_recaps: [track({ readiness: 'held', hold_reason: 'thin_questions' })],
        nexus_study_file_reads: [],
        nexus_class_recap_sections: [],
        nexus_class_recap_progress: [],
      }),
    );
    expect(state.tracks).toHaveLength(0);
    expect(state.requires_video).toBe(false);
  });

  it('treats a missing readiness as ready, so rows predating the column still serve', async () => {
    const state = await getStudyVideoState(
      FILE,
      STUDENT,
      mockClient({
        nexus_class_recaps: [track({ readiness: null })],
        nexus_study_file_reads: [],
        nexus_class_recap_sections: [],
        nexus_class_recap_progress: [],
      }),
    );
    expect(state.requires_video).toBe(true);
  });
});

describe('getStudyVideoState: the picker', () => {
  it('puts English first so the list does not reshuffle between chapters', async () => {
    const state = await getStudyVideoState(
      FILE,
      STUDENT,
      mockClient({
        nexus_class_recaps: [
          track({ id: 'track-ta', language: 'ta', language_label: 'தமிழ்' }),
          track({ id: 'track-en' }),
        ],
        nexus_study_file_reads: [],
        nexus_class_recap_sections: [],
        nexus_class_recap_progress: [],
      }),
    );
    expect(state.tracks.map((t) => t.language)).toEqual(['en', 'ta']);
  });

  it('falls back to a default label when none was stored', async () => {
    const state = await getStudyVideoState(
      FILE,
      STUDENT,
      mockClient({
        nexus_class_recaps: [track({ language: 'ta', language_label: null })],
        nexus_study_file_reads: [],
        nexus_class_recap_sections: [],
        nexus_class_recap_progress: [],
      }),
    );
    expect(state.tracks[0].language_label).toBe('தமிழ்');
  });

  it('reports the chapter state and which language satisfied the video half', async () => {
    const state = await getStudyVideoState(
      FILE,
      STUDENT,
      mockClient({
        nexus_class_recaps: [track()],
        nexus_study_file_reads: [
          {
            video_completed_at: '2026-08-03T00:00:00Z',
            video_language: 'ta',
            test_passed_at: '2026-08-03T01:00:00Z',
            completed_at: '2026-08-03T01:00:00Z',
          },
        ],
        nexus_class_recap_sections: [],
        nexus_class_recap_progress: [],
      }),
    );
    expect(state.video_language).toBe('ta');
    expect(state.completed_at).not.toBeNull();
  });

  it('carries per-track progress and a resume point', async () => {
    const state = await getStudyVideoState(
      FILE,
      STUDENT,
      mockClient({
        nexus_class_recaps: [track()],
        nexus_study_file_reads: [],
        nexus_class_recap_sections: [],
        nexus_class_recap_progress: [
          { recap_id: 'track-en', status: 'in_progress', last_video_position_seconds: 412 },
        ],
      }),
    );
    expect(state.tracks[0].progress_status).toBe('in_progress');
    expect(state.tracks[0].resume_at).toBe(412);
  });
});

describe('listStudyVideoTracks: the staff view', () => {
  it('includes drafts and held tracks, because that is what a tutor has to fix', async () => {
    const tracks = await listStudyVideoTracks(
      FILE,
      mockClient({
        nexus_class_recaps: [
          track({ id: 'a', status: 'draft' }),
          track({ id: 'b', language: 'ta', readiness: 'held' }),
        ],
        nexus_class_recap_sections: [],
      }),
    );
    expect(tracks).toHaveLength(2);
    expect(tracks.map((t) => t.status)).toContain('draft');
    expect(tracks.map((t) => t.readiness)).toContain('held');
  });

  it('counts only live checkpoints, never archived ones', async () => {
    // An archived checkpoint is soft-deleted so student attempts survive.
    // Counting it would tell a tutor a track is ready when its live checkpoints
    // have all been archived away.
    const tracks = await listStudyVideoTracks(
      FILE,
      mockClient({
        nexus_class_recaps: [track({ id: 'a' })],
        nexus_class_recap_sections: [{ recap_id: 'a' }],
      }),
    );
    expect(tracks[0].section_count).toBe(1);
  });
});

describe('getStudyVideoState: a language nobody configured', () => {
  it('sorts an unknown code last instead of crashing', async () => {
    // The offered list is admin-editable now, so a chapter can hold a track in
    // a language that was later removed from it. That must degrade to "listed
    // last", never to a throw: the row is still published and a student is
    // still watching it.
    const state = await getStudyVideoState(
      FILE,
      STUDENT,
      mockClient({
        nexus_class_recaps: [
          track({ id: 'track-xx', language: 'zz', language_label: 'Retired' }),
          track({ id: 'track-en' }),
        ],
        nexus_study_file_reads: [],
        nexus_class_recap_sections: [],
        nexus_class_recap_progress: [],
      }),
    );
    expect(state.tracks.map((t) => t.language)).toEqual(['en', 'zz']);
  });

  it('honours the order the admin arranged when one is passed', async () => {
    const state = await getStudyVideoState(
      FILE,
      STUDENT,
      mockClient({
        nexus_class_recaps: [
          track({ id: 'track-en' }),
          track({ id: 'track-hi', language: 'hi', language_label: 'हिन्दी' }),
        ],
        nexus_study_file_reads: [],
        nexus_class_recap_sections: [],
        nexus_class_recap_progress: [],
      }),
      ['hi', 'en'],
    );
    expect(state.tracks.map((t) => t.language)).toEqual(['hi', 'en']);
  });
});

/**
 * Attaching a recording, and getting a removed one back.
 *
 * Two separate bugs converge on this function.
 *
 * The first: video_source was hardcoded to 'sharepoint' on insert, while the
 * serving side has always branched on that exact column and can hand back a
 * YouTube id. So a YouTube recording could be played but never attached. The
 * classification itself lives in the route, because the YouTube id parser is an
 * app module this package must not reach into.
 *
 * The second is worse, because it is a dead end with no way out of it. DELETE
 * archives a track rather than deleting it, since the attempt rows cascade from
 * its sections. But uq_class_recaps_study_file_language does not exclude
 * archived rows and listStudyVideoTracks hides them, so removing the English
 * recording left the slot held by a row nothing could see: the editor showed no
 * recordings while every attempt to add English again answered "this chapter
 * already has a en track". Two presses on the very first chapter and that
 * language was locked out of it permanently.
 */
function seedDb(extra: Record<string, unknown[]> = {}) {
  return createFakeDb({
    nexus_class_recaps: [],
    nexus_class_recap_sections: [],
    nexus_class_recap_questions: [],
    nexus_class_recap_attempts: [],
    nexus_test_placements: [],
    nexus_test_questions: [],
    nexus_tests: [],
    nexus_qb_questions: [],
    ...extra,
  });
}

const SP_URL = 'https://example.sharepoint.com/:v:/s/CommonClasses/abc';

describe('createStudyVideoTrack: the recording decides the player', () => {
  const base = { studyFileId: FILE, language: 'en', recordingUrl: SP_URL };

  it('stores a YouTube track when the route classifies it as one', async () => {
    const db = seedDb();
    const { track: made } = await createStudyVideoTrack(
      { ...base, recordingUrl: 'https://youtu.be/dQw4w9WgXcQ', videoSource: 'youtube' },
      db.client,
    );
    expect((made as any).video_source).toBe('youtube');
  });

  it('stores a SharePoint track when told so', async () => {
    const db = seedDb();
    const { track: made } = await createStudyVideoTrack({ ...base, videoSource: 'sharepoint' }, db.client);
    expect((made as any).video_source).toBe('sharepoint');
  });

  it('defaults to sharepoint, preserving the old behaviour for any caller that omits it', async () => {
    const db = seedDb();
    const { track: made } = await createStudyVideoTrack(base, db.client);
    expect((made as any).video_source).toBe('sharepoint');
  });

  it('never claims a class parent, so a track cannot leak into the catch-up journey', async () => {
    const db = seedDb();
    await createStudyVideoTrack(base, db.client);
    const row = db.tables.nexus_class_recaps[0];
    expect(row.scheduled_class_id).toBeNull();
    expect(row.classroom_id).toBeNull();
    expect(row.study_file_id).toBe(FILE);
  });

  it('accepts a language the fallback label map has never heard of', async () => {
    // The offered list lives in nexus_settings and the route passes the label
    // down. Without that, an admin-added language would reach a student as the
    // bare code.
    const db = seedDb();
    const { track: made } = await createStudyVideoTrack(
      { ...base, language: 'hi', languageLabel: 'हिन्दी' },
      db.client,
    );
    expect((made as any).language).toBe('hi');
    expect((made as any).language_label).toBe('हिन्दी');
  });
});

describe('createStudyVideoTrack: a language that was removed', () => {
  const archived = (over: Record<string, unknown> = {}) => ({
    id: 'old-en',
    study_file_id: FILE,
    language: 'en',
    language_label: 'English',
    title: 'English recording',
    status: 'archived',
    readiness: 'ready',
    recording_url: SP_URL,
    video_source: 'sharepoint',
    ...over,
  });

  it('revives the archived row rather than dead-ending on the unique slot', async () => {
    const db = seedDb({ nexus_class_recaps: [archived()] });
    const res = await createStudyVideoTrack(
      { studyFileId: FILE, language: 'en', recordingUrl: SP_URL },
      db.client,
    );
    expect(res.restored).toBe(true);
    expect(res.track.id).toBe('old-en');
    expect((res.track as any).status).toBe('draft');
    // One row, not two. A second would violate the unique index for real.
    expect(db.tables.nexus_class_recaps).toHaveLength(1);
  });

  it('keeps the checkpoints when the same recording comes back, so an accidental delete costs nothing', async () => {
    const db = seedDb({
      nexus_class_recaps: [archived()],
      nexus_class_recap_sections: [
        { id: 'sec-a', recap_id: 'old-en', sort_order: 0, archived_at: null },
      ],
    });
    const res = await createStudyVideoTrack(
      { studyFileId: FILE, language: 'en', recordingUrl: SP_URL },
      db.client,
    );
    expect(res.checkpointsCleared).toBe(false);
    expect(db.tables.nexus_class_recap_sections).toHaveLength(1);
    expect((res.track as any).readiness).toBe('ready');
  });

  it('clears the checkpoints when a DIFFERENT recording is attached', async () => {
    // They were cut from the old recording's transcript. Against a different
    // video their timestamps land mid-sentence, so the gate would stop the
    // student at nothing in particular.
    const db = seedDb({
      nexus_class_recaps: [archived()],
      nexus_class_recap_sections: [
        { id: 'sec-a', recap_id: 'old-en', sort_order: 0, archived_at: null },
      ],
    });
    const res = await createStudyVideoTrack(
      { studyFileId: FILE, language: 'en', recordingUrl: 'https://youtu.be/other', videoSource: 'youtube' },
      db.client,
    );
    expect(res.checkpointsCleared).toBe(true);
    expect(db.tables.nexus_class_recap_sections).toHaveLength(0);
    // Back to pending, so it cannot be published until a new transcript arrives.
    expect((res.track as any).readiness).toBe('pending');
    expect((res.track as any).video_source).toBe('youtube');
  });

  it('still refuses a language whose track is live', async () => {
    const db = seedDb({ nexus_class_recaps: [archived({ status: 'draft' })] });
    await expect(
      createStudyVideoTrack({ studyFileId: FILE, language: 'en', recordingUrl: SP_URL }, db.client),
    ).rejects.toThrow(TrackLanguageTakenError);
  });

  it('does not touch the other language while restoring one', async () => {
    const db = seedDb({
      nexus_class_recaps: [
        archived(),
        archived({ id: 'live-ta', language: 'ta', language_label: 'தமிழ்', status: 'published' }),
      ],
    });
    await createStudyVideoTrack(
      { studyFileId: FILE, language: 'en', recordingUrl: SP_URL },
      db.client,
    );
    const ta = db.tables.nexus_class_recaps.find((r: any) => r.id === 'live-ta');
    expect(ta.status).toBe('published');
  });
});
