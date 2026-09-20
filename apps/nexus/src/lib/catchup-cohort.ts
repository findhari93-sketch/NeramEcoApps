/**
 * Who in a classroom owes nothing at all.
 *
 * Two callers need this and neither of them needs the rest of the catch-up
 * overview: the Teams celebration post, which must re-derive the names rather
 * than trust a list the browser sent it, and the student wall, which shows the
 * same people to their classmates.
 *
 * It is a slimmer run of the same pipeline `/api/catchup/overview` uses, in the
 * same order, ending in the same two pure rules (`catchupBucket` and
 * `catchupStanding`). That matters: the wall, the post and the teacher's tab all
 * have to name the same students, and the only way to guarantee that is for the
 * verdict to come from one function rather than from three that agree today.
 *
 * The cheap version of this check, "no absence row with caught_up_at NULL", is
 * deliberately not what happens here. A student who watched the recap, did the
 * work and passed the test but never pressed "Mark caught up" resolves to `done`
 * with a null `caught_up_at`, so the cheap query would drop somebody the
 * teacher's screen is showing as clear.
 */
import {
  isTracked,
  loadClassroomRoster,
  readCatchupWindows,
  resolveCatchupBacklog,
  summariseCatchupBacklog,
  summariseCatchupClock,
  summariseMissedClasses,
  toFacts,
  istTodayYmd,
} from '@neram/database';
import { catchupBucket } from './catchup-buckets';
import { catchupStanding, type CatchupStanding } from './catchup-standing';
import { loadClassFactsForStudents } from './catchup-facts';

/** Same cap as the overview route, so one runaway classroom cannot stall a page. */
const MAX_ITEMS = 4000;

export interface AllClearStudent {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  standing: CatchupStanding;
}

/**
 * Every tracked student in this classroom with nothing outstanding and nothing
 * blocked, ordered by who finished most recently.
 *
 * Dormant students, removed enrolments and alumni are excluded by `isTracked`,
 * the same rule the teacher screen applies. A dormant student is not "clear",
 * they are not being counted at all, and putting them on a wall their classmates
 * read would announce a status decision that is nobody else's business.
 */
export interface StudentBacklog {
  studentId: string;
  /** The users row, for screens that name people. */
  user: any;
  /** Their raw absence rows, oldest class first. */
  items: any[];
  /** The resolved item for each row above, index for index. */
  resolved: any[];
  /**
   * Work the student can act on. Already EXCLUDES anything blocked on us:
   * summariseMissedClasses skips `blocked` and `pending_teacher` outright, and
   * summariseCatchupBacklog counts only items that `countsTowardPace`. Nothing
   * downstream should subtract `blockedOnUs` from this again.
   */
  openCount: number;
  /** No recording, or a recap we never published. Nobody can clear these. */
  blockedOnUs: number;
  /** Alias of `openCount`, named for readers who want the contrast explicit. */
  ownOpen: number;
  clock: ReturnType<typeof summariseCatchupClock>;
}

/**
 * Resolve the whole classroom catch-up backlog, once.
 *
 * Extracted because two screens needed the same answer, and a second
 * hand-written copy of this pipeline is exactly how the last two bugs in this
 * area happened. The wall, the Teams celebration post and the attendance
 * standing view all have to name the same people, and the only way to guarantee
 * that is for the verdict to come from one function rather than from three that
 * agree today.
 *
 * Every tracked student gets an entry, including those with no absence rows at
 * all. A missing key is indistinguishable from a failed read at the caller, and
 * "we could not tell" and "they owe nothing" are opposite answers.
 */
export async function loadClassroomBacklog(
  supabase: any,
  classroomId: string,
  today: string,
): Promise<Map<string, StudentBacklog>> {
  const out = new Map<string, StudentBacklog>();

  const roster = await loadClassroomRoster<any>(classroomId, {
    includeDormant: true,
    client: supabase,
  });

  const tracked = new Map<string, any>();
  for (const member of roster.members) {
    if (isTracked(member)) tracked.set(member.user_id, member.user);
  }
  if (tracked.size === 0) return out;

  const { data: rows } = await supabase
    .from('nexus_class_absences')
    .select(
      'id, student_id, scheduled_class_id, kind, recording_watched_at, caught_up_at, ' +
        'test_unlocked_at, test_passed_at, excused_at, followup_sent_at, activated_on, days_used, ' +
        'class:nexus_scheduled_classes(id, title, scheduled_date, start_time, status, ' +
        'recording_url, youtube_url)',
    )
    .eq('classroom_id', classroomId)
    .limit(MAX_ITEMS);

  const items = (rows || []).filter((r: any) => r.class && tracked.has(r.student_id));

  const byStudent = new Map<string, any[]>();
  for (const item of items) {
    const list = byStudent.get(item.student_id) || [];
    list.push(item);
    byStudent.set(item.student_id, list);
  }

  const windows = await readCatchupWindows(supabase, classroomId);

  const classIdsByStudent = new Map<string, string[]>();
  for (const [studentId, list] of byStudent) {
    classIdsByStudent.set(
      studentId,
      list.map((i: any) => i.scheduled_class_id),
    );
  }
  const factsByStudent = await loadClassFactsForStudents(supabase, classIdsByStudent);

  for (const [studentId, user] of tracked) {
    const studentItems = (byStudent.get(studentId) || []).sort((a: any, b: any) => {
      const d = String(a.class.scheduled_date).localeCompare(String(b.class.scheduled_date));
      if (d !== 0) return d;
      return String(a.class.start_time || '').localeCompare(String(b.class.start_time || ''));
    });

    const facts = factsByStudent.get(studentId);
    const resolved = facts
      ? resolveCatchupBacklog(
          studentItems.map((i: any) => toFacts(i, facts)),
          { today, windows },
        )
      : [];

    const totals = summariseCatchupBacklog(resolved);
    const missedTotals = summariseMissedClasses(resolved);
    const openCount = missedTotals.open + (totals.total - totals.completed);
    const blockedOnUs = resolved.filter(
      (r: any) => r.status === 'blocked' || r.status === 'pending_teacher',
    ).length;

    out.set(studentId, {
      studentId,
      user,
      items: studentItems,
      resolved,
      openCount,
      blockedOnUs,
      // NOT `openCount - blockedOnUs`. Both summaries above have already
      // dropped blocked and pending_teacher items, so subtracting again would
      // report a student with three of their own items and two of ours as
      // owing one, and catchupBucket's own `openCount` is documented the same
      // way. The two numbers are disjoint, not nested.
      ownOpen: openCount,
      clock: summariseCatchupClock(resolved),
    });
  }

  return out;
}

export async function loadAllClearStudents(
  supabase: any,
  classroomId: string,
): Promise<AllClearStudent[]> {
  const today = istTodayYmd();
  const backlog = await loadClassroomBacklog(supabase, classroomId, today);

  const out: AllClearStudent[] = [];

  for (const b of backlog.values()) {
    // `pace` and `clock` cannot change this answer: `all_clear` is the first
    // test in catchupBucket and depends only on the two counts above. They are
    // passed honestly anyway rather than faked, so that if the order of those
    // tests ever changes this call does not quietly start lying.
    const bucket = catchupBucket({
      openCount: b.openCount,
      blockedOnUs: b.blockedOnUs,
      clock: b.clock,
      pace: { state: b.openCount === 0 ? 'done' : 'on_track' },
    });
    if (bucket !== 'all_clear') continue;

    out.push({
      id: b.studentId,
      name: b.user?.name ?? null,
      email: b.user?.email ?? null,
      avatar_url: b.user?.avatar_url ?? null,
      standing: catchupStanding(
        b.items.map((i: any, idx: number) => ({
          kind: i.kind ?? null,
          status: b.resolved[idx].status,
          scheduledDate: String(i.class.scheduled_date),
          caughtUpAt: i.caught_up_at ?? null,
          followupSentAt: i.followup_sent_at ?? null,
          recordingWatchedAt: i.recording_watched_at ?? null,
          activatedOn: i.activated_on ?? null,
        })),
        today,
      ),
    });
  }

  // Most recently finished first, matching the wall. A student who never missed
  // anything has no `lastClearedAt` and sorts last by name: they belong here,
  // but they did not just do something.
  out.sort((a, b) => {
    const av = a.standing.lastClearedAt;
    const bv = b.standing.lastClearedAt;
    if (av && bv) return bv.localeCompare(av);
    if (av) return -1;
    if (bv) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  return out;
}
