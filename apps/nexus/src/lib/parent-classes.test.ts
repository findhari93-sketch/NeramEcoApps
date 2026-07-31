import { describe, it, expect } from 'vitest';
import {
  PARENT_CLASS_COLS,
  classPhase,
  toParentClass,
  type RawParentClassRow,
} from './parent-classes';

/**
 * The status-only contract, enforced.
 *
 * A parent may learn THAT a recording exists and whether their child watched it.
 * They may never learn how to watch it, and they may never receive a reference
 * material's link. The mapper is the boundary where that is decided, so this
 * file feeds it a row where every forbidden column carries a unique sentinel and
 * asserts that none of them survives the trip.
 *
 * If you are here because this test failed after you widened the select or
 * refactored the mapper: that is the test working. Do not update the expectation.
 */

const SENTINELS = {
  recording_url: 'SENTINEL-RECORDING-URL',
  youtube_url: 'SENTINEL-YOUTUBE-URL',
  teams_meeting_url: 'SENTINEL-TEAMS-URL',
  teams_meeting_join_url: 'SENTINEL-TEAMS-JOIN',
  teams_meeting_id: 'SENTINEL-TEAMS-ID',
  teams_calendar_event_id: 'SENTINEL-CALENDAR-EVENT',
  online_meeting_id: 'SENTINEL-ONLINE-MEETING',
  transcript_url: 'SENTINEL-TRANSCRIPT',
  notes: 'SENTINEL-TEACHER-NOTES',
};

/**
 * A row carrying every forbidden column, as if someone had widened the select to
 * `*`. The mapper must survive this without leaking, because belt 1 (the column
 * allowlist) is one careless edit away from gone.
 */
function hostileRow(over: Partial<RawParentClassRow> = {}): RawParentClassRow {
  return {
    id: 'c1',
    classroom_id: 'room1',
    batch_id: null,
    title: 'Coordinate Geometry Basics',
    description: 'Lines, slopes and the distance formula.',
    scheduled_date: '2026-07-20',
    start_time: '19:00:00',
    end_time: '20:30:00',
    status: 'completed',
    teacher: { id: 't1', name: 'Ar. Hari Babu', avatar_url: null },
    topic: { id: 'tp1', title: 'Coordinate Geometry' },
    course_topic: { id: 'ct1', title: 'Maths: Coordinate Geometry' },
    classroom: { id: 'room1', name: 'JEE B.Arch Session 1', type: 'jee' },
    class_resources: [{ count: 3 }],
    ...SENTINELS,
    // Things a future schema change might add that nobody thought about.
    secret_field: 'SENTINEL-UNKNOWN-FUTURE-COLUMN',
    ...over,
  };
}

describe('PARENT_CLASS_COLS', () => {
  it('never selects a star', () => {
    // `*` would defeat belt 1 entirely and hand a parent every column on the row.
    expect(PARENT_CLASS_COLS).not.toMatch(/(^|[\s,(])\*/);
  });

  it.each([
    'recording_url',
    'youtube_url',
  ])('selects %s only so availability can be computed', (col) => {
    // These two ARE selected, deliberately: `available` cannot be derived without
    // them. The mapper is what guarantees they go no further, which is the next
    // describe block.
    expect(PARENT_CLASS_COLS).toContain(col);
  });

  it.each([
    'teams_meeting_url',
    'teams_meeting_join_url',
    'teams_meeting_id',
    'teams_calendar_event_id',
    'teams_organizer_event_id',
    'teams_meeting_scope',
    'online_meeting_id',
    'transcript_url',
    'notes',
  ])('never selects %s', (col) => {
    expect(PARENT_CLASS_COLS).not.toContain(col);
  });

  it('withholds notes from the WINDOW read for size, not for secrecy', () => {
    // `notes` was once excluded here as "the teacher's private notes". It is not
    // that any more: the Wrap Up panel writes the class's detailed description
    // into that column and tells the teacher, in the field's helper text, that
    // students and parents read it in full. The detail read (PARENT_DETAIL_COLS)
    // therefore DOES select it and surfaces it as whatHappened.note.
    //
    // It stays out of THIS list for one reason only: a thirty-class month would
    // carry thirty paragraphs nobody has opened. Same rule as summary_bullets,
    // which is likewise detail-only. Deleting this test to "restore" the old
    // exclusion would silently take the class recap away from the parents who
    // are the point of the parent portal.
    expect(PARENT_CLASS_COLS).not.toContain('notes');
    expect(PARENT_CLASS_COLS).not.toContain('summary_bullets');
  });

  it('does not join the resources table at all', () => {
    // Counting happens in a separate ids-only read (loadResourceCounts) rather
    // than an embed. An embed is one careless edit away from
    // CLASS_RESOURCES_EMBED, which carries url, thumb_url and study_file_id, and
    // it would also make the whole calendar 500 in any environment that has not
    // applied the nexus_class_resources migration yet.
    expect(PARENT_CLASS_COLS).not.toContain('nexus_class_resources');
    expect(PARENT_CLASS_COLS).not.toContain('thumb_url');
    expect(PARENT_CLASS_COLS).not.toContain('study_file_id');
  });
});

describe('toParentClass leaks nothing', () => {
  const serialised = JSON.stringify(toParentClass(hostileRow()));

  it.each(Object.entries(SENTINELS))(
    'drops %s on the floor',
    (_col, sentinel) => {
      expect(serialised).not.toContain(sentinel);
    }
  );

  it('drops unknown columns a future migration might add', () => {
    expect(serialised).not.toContain('SENTINEL-UNKNOWN-FUTURE-COLUMN');
  });

  it('matches no url-shaped or media-shaped key anywhere in the payload', () => {
    // The same assertion the E2E suite runs against the live responses, applied
    // here where it fails in milliseconds instead of minutes.
    expect(serialised).not.toMatch(
      /recording_url|youtube_url|teams_meeting|sharepoint|\.mp4|study_file_id|transcript/i
    );
  });

  it('still reports THAT a recording exists', () => {
    // The point of the contract is status without content, not silence.
    expect(toParentClass(hostileRow()).recording.available).toBe(true);
  });

  it('reports no recording when neither url is set', () => {
    const cls = toParentClass(hostileRow({ recording_url: null, youtube_url: null }));
    expect(cls.recording.available).toBe(false);
  });

  it('counts resources without naming them', () => {
    const cls = toParentClass(hostileRow(), { resourceCount: 3 });
    expect(cls.resources).toEqual({ count: 3 });
  });

  it('ignores any resource rows that arrive on the row anyway', () => {
    // Belt 2 again: even if a future edit re-adds an embed, the count comes from
    // extras and the rows on the raw record are never read.
    const cls = toParentClass(
      hostileRow({
        class_resources: [
          { id: 'r1', url: 'SENTINEL-RESOURCE-URL', thumb_url: 'SENTINEL-THUMB' },
        ],
      })
    );
    expect(cls.resources).toEqual({ count: 0 });
    expect(JSON.stringify(cls)).not.toContain('SENTINEL-RESOURCE');
    expect(JSON.stringify(cls)).not.toContain('SENTINEL-THUMB');
  });

  it('emits a fixed set of keys, so nothing rides along', () => {
    expect(Object.keys(toParentClass(hostileRow())).sort()).toEqual([
      'assignmentBadge',
      'attendance',
      'catchupBadge',
      'classroom',
      'description',
      'end_time',
      'id',
      'phase',
      'recording',
      'resources',
      'scheduled_date',
      'start_time',
      'status',
      'teacher',
      'testBadge',
      'title',
      'topicTitle',
    ]);
  });
});

describe('watchedByChild distinguishes "not applicable" from "not done"', () => {
  it('is null when the child has no catch-up context, meaning they were there', () => {
    // Reporting false here would tell a parent their child "has not watched the
    // recording" of a class they sat through.
    expect(toParentClass(hostileRow()).recording.watchedByChild).toBeNull();
  });

  it('is false when the child missed the class and has not watched', () => {
    const cls = toParentClass(hostileRow(), {
      recording: { watched: false, watchedAt: null, proof: null },
    });
    expect(cls.recording.watchedByChild).toBe(false);
  });

  it('is true with the proof recorded when they have watched', () => {
    const cls = toParentClass(hostileRow(), {
      recording: {
        watched: true,
        watchedAt: '2026-07-22T10:00:00Z',
        proof: 'recap_completed',
      },
    });
    expect(cls.recording.watchedByChild).toBe(true);
    expect(cls.recording.proof).toBe('recap_completed');
  });
});

describe('classPhase', () => {
  const cls = {
    scheduled_date: '2026-07-20',
    start_time: '19:00:00',
    end_time: '20:30:00',
    status: 'scheduled',
  };

  // 2026-07-20 19:00 IST is 13:30Z. 20:30 IST is 15:00Z.
  const beforeStart = Date.parse('2026-07-20T13:29:00Z');
  const duringClass = Date.parse('2026-07-20T14:00:00Z');
  const afterEnd = Date.parse('2026-07-20T15:01:00Z');

  it('is upcoming before the class starts', () => {
    expect(classPhase(cls, beforeStart)).toBe('upcoming');
  });

  it('is live during the class', () => {
    expect(classPhase(cls, duringClass)).toBe('live');
  });

  it('is past one minute after it ends', () => {
    expect(classPhase(cls, afterEnd)).toBe('past');
  });

  it('reads the times as IST even though the server clock is UTC', () => {
    // The bug this guards: `new Date('2026-07-20T19:00')` on a UTC box is
    // 19:00Z, which is 00:30 IST the NEXT day, so a class that finished at
    // 8:30pm would stay "upcoming" for another five and a half hours.
    //
    // 14:00Z is 19:30 IST, inside the class. A UTC reading would call it
    // "upcoming" because 14:00 is before 19:00.
    expect(classPhase(cls, Date.parse('2026-07-20T14:00:00Z'))).toBe('live');
  });

  it('is cancelled regardless of the clock', () => {
    expect(classPhase({ ...cls, status: 'cancelled' }, afterEnd)).toBe('cancelled');
    expect(classPhase({ ...cls, status: 'cancelled' }, beforeStart)).toBe('cancelled');
  });

  it('treats rescheduled as cancelled, because it did not happen here', () => {
    expect(classPhase({ ...cls, status: 'rescheduled' }, afterEnd)).toBe('cancelled');
  });

  it('falls back to the stored status when the times are unparseable', () => {
    const broken = { ...cls, start_time: 'nonsense', end_time: 'nonsense' };
    expect(classPhase({ ...broken, status: 'completed' }, afterEnd)).toBe('past');
    expect(classPhase(broken, afterEnd)).toBe('upcoming');
  });
});

describe('attendance is never attached to a class that has not happened', () => {
  const future = {
    scheduled_date: '2026-07-20',
    start_time: '19:00:00',
    end_time: '20:30:00',
  };
  const beforeStart = Date.parse('2026-07-20T13:00:00Z');

  const view = {
    classId: 'c1',
    title: 'Class',
    date: '2026-07-20',
    startTime: '19:00:00',
    endTime: '20:30:00',
    scheduledMinutes: 90,
    measurement: 'not_measured' as const,
    label: 'not_recorded' as const,
    attended: null,
    joinedAt: null,
    leftAt: null,
    durationMinutes: null,
    late: null,
    leftEarly: null,
    droppedMidClass: null,
    segments: [],
    reasonCode: null,
    reasonNote: null,
    reasonSource: null,
  };

  it('drops an attendance view on an upcoming class', () => {
    // Otherwise a class scheduled for next week renders "Not recorded", which a
    // parent reads as a class their child has already failed to attend.
    const cls = toParentClass(hostileRow({ ...future, status: 'scheduled' }), {
      nowMs: beforeStart,
      attendance: view,
    });
    expect(cls.phase).toBe('upcoming');
    expect(cls.attendance).toBeNull();
  });

  it('drops an attendance view on a cancelled class', () => {
    const cls = toParentClass(hostileRow({ ...future, status: 'cancelled' }), {
      attendance: view,
    });
    expect(cls.attendance).toBeNull();
  });

  it('keeps it on a class that has finished', () => {
    const cls = toParentClass(hostileRow({ ...future, status: 'completed' }), {
      nowMs: Date.parse('2026-07-20T16:00:00Z'),
      attendance: view,
    });
    expect(cls.phase).toBe('past');
    expect(cls.attendance).toEqual(view);
  });
});
