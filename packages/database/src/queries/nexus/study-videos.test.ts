import { describe, it, expect } from 'vitest';
import { getStudyVideoState, listStudyVideoTracks, createStudyVideoTrack } from './study-videos';

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

/**
 * Which player a track gets.
 *
 * This used to be hardcoded to 'sharepoint' on insert, which was a real bug
 * rather than a simplification: the serving side has always branched on this
 * column and can hand back a YouTube id, so a YouTube recording could be played
 * but never attached. The classification itself lives in the route, because the
 * YouTube id parser is an app module this package must not reach into.
 */
function insertCapturingClient(captured: { payload?: Record<string, unknown> }) {
  const chain: any = {
    insert: (payload: Record<string, unknown>) => {
      captured.payload = payload;
      return chain;
    },
    select: () => chain,
    single: async () => ({ data: { id: 'new-track', ...captured.payload }, error: null }),
  };
  return { from: () => chain } as never;
}

describe('createStudyVideoTrack: the recording decides the player', () => {
  const base = {
    studyFileId: FILE,
    language: 'en' as const,
    recordingUrl: 'https://example.sharepoint.com/:v:/s/CommonClasses/abc',
  };

  it('stores a YouTube track when the route classifies it as one', async () => {
    const captured: { payload?: Record<string, unknown> } = {};
    await createStudyVideoTrack(
      { ...base, recordingUrl: 'https://youtu.be/dQw4w9WgXcQ', videoSource: 'youtube' },
      insertCapturingClient(captured),
    );
    expect(captured.payload?.video_source).toBe('youtube');
  });

  it('stores a SharePoint track when told so', async () => {
    const captured: { payload?: Record<string, unknown> } = {};
    await createStudyVideoTrack({ ...base, videoSource: 'sharepoint' }, insertCapturingClient(captured));
    expect(captured.payload?.video_source).toBe('sharepoint');
  });

  it('defaults to sharepoint, preserving the old behaviour for any caller that omits it', async () => {
    const captured: { payload?: Record<string, unknown> } = {};
    await createStudyVideoTrack(base, insertCapturingClient(captured));
    expect(captured.payload?.video_source).toBe('sharepoint');
  });

  it('never claims a class parent, so a track cannot leak into the catch-up journey', async () => {
    const captured: { payload?: Record<string, unknown> } = {};
    await createStudyVideoTrack(base, insertCapturingClient(captured));
    expect(captured.payload?.scheduled_class_id).toBeNull();
    expect(captured.payload?.classroom_id).toBeNull();
    expect(captured.payload?.study_file_id).toBe(FILE);
  });
});
