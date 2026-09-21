// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * THE TWO-PUBLISH SEQUENCE. Publish, notify, somebody sits late, publish again,
 * notify again.
 *
 * Every per-task review of this feature passed because no test ever crossed a
 * publish boundary, and the defect that slipped through was invisible on either
 * side of it. The first publish wrote a nexus_exam_results row for every roster
 * student INCLUDING the ones whose personal window was still open. Notify then
 * stamped notified_at on all of those rows. Weeks later the late student sat the
 * paper, the teacher republished, and saveExamResults' upsert deliberately omits
 * notified_at so ON CONFLICT DO UPDATE preserved the old stamp. Notify filtered
 * on `!notified_at`, found nobody, and returned `{ notified: 0 }` while showing
 * the teacher a success message. The student's rank and marks reached no one,
 * and nothing in the UI could recover it.
 *
 * So this test drives the REAL route handlers against a fake that reproduces the
 * two database behaviours that matter: upsert on (exam_id, student_id) leaving
 * notified_at alone, and markExamResultsNotified stamping it.
 *
 * It never posts to Teams: the classroom fixture has no ms_team_id, so the whole
 * Graph branch is skipped. The one test that does exercise that branch mocks the
 * poster and asserts it was never called with a real token.
 */

const H = vi.hoisted(() => {
  interface Row {
    exam_id: string;
    student_id: string;
    attempt_id: string | null;
    rank: number | null;
    sitting: 'main' | 'second';
    score: number | null;
    total_marks: number | null;
    percentage: number | null;
    section_scores: unknown;
    is_provisional: boolean;
    absent: boolean;
    notified_at: string | null;
    published_at: string;
  }

  const state = {
    /** Stands in for the nexus_exam_results table. */
    table: [] as Row[],
    exam: {} as Record<string, unknown>,
    classroom: {} as Record<string, unknown>,
    /** What getExamResults should return on the next call. */
    results: null as any,
    roster: [] as Array<{ id: string; name: string; avatar_url: string | null }>,
    /** Every student id sendNudge was asked to reach, in order, with the text. */
    nudges: [] as Array<{ studentId: string; subject: string; plain: string }>,
    teamsPosts: [] as string[],
    /** Make the next Graph post fail. */
    teamsFails: false,
    /** Make storing the posted card's id fail, with the card already sent. */
    recordFails: false,
    pointEvents: [] as string[],
    badges: [] as string[],
    /**
     * What loadExamEligibilityFacts returns. Empty covered classes by default,
     * which makes everyone mandatory, so every scenario above the excused block
     * reads exactly as it did before eligibility reached publishing.
     */
    eligibility: null as any,
  };
  return state;
});

vi.mock('@neram/database', () => ({
  isRankedResultRow: (row: { absent: boolean; attempt_id?: string | null }) =>
    !row.absent && Boolean(row.attempt_id),
  recomputeExamScores: async () => {},
  getExamResults: async () => H.results,
  loadExamEligibilityFacts: async () => H.eligibility,
  /** The real one deletes WHERE attempt_id IS NULL; modelled the same way. */
  removePaperlessExamResults: async (examId: string, studentIds: string[]) => {
    for (let i = H.table.length - 1; i >= 0; i--) {
      const r = H.table[i];
      if (r.exam_id === examId && studentIds.includes(r.student_id) && r.attempt_id == null) H.table.splice(i, 1);
    }
  },
  /**
   * Upsert on (exam_id, student_id), and crucially notified_at is NOT in the
   * payload, so an existing row keeps whatever stamp it already had. That is
   * exactly what ON CONFLICT DO UPDATE does against the real column list.
   *
   * Plus the one clause that repairs it: the scoped
   * `UPDATE ... SET notified_at = NULL WHERE attempt_id IS NULL` the real
   * saveExamResults runs BEFORE the upsert, so a row that held no paper and is
   * now a result is pending again, while a row that already had a paper keeps
   * its stamp. Modelled here because it is the database's half of the bargain;
   * the real SQL is exercised directly in
   * packages/database/src/queries/nexus/exams.notified-reset.test.ts.
   */
  saveExamResults: async (examId: string, rows: any[]) => {
    for (const r of rows) {
      const at = H.table.findIndex((x) => x.exam_id === examId && x.student_id === r.student_id);
      const next = { ...r, exam_id: examId, published_at: new Date().toISOString() };
      if (at === -1) {
        H.table.push({ ...next, notified_at: null });
        continue;
      }
      const wasPaperless = H.table[at].attempt_id == null;
      H.table[at] = {
        ...H.table[at],
        ...next,
        ...(wasPaperless && r.attempt_id != null ? { notified_at: null } : {}),
      };
    }
  },
  getExamResultRows: async (examId: string) =>
    H.table.filter((r) => r.exam_id === examId).map((r) => ({ ...r })),
  markExamResultsNotified: async (examId: string, studentIds: string[]) => {
    for (const r of H.table) {
      if (r.exam_id === examId && studentIds.includes(r.student_id)) {
        r.notified_at = new Date().toISOString();
      }
    }
  },
  setExamResultsState: async (_examId: string, state: string) => {
    H.exam.results_state = state;
    // Stamped unconditionally, INCLUDING on a publish whose Teams post failed.
    // That is why the announce gate cannot read it.
    H.exam.results_published_at = new Date().toISOString();
  },
  recordExamTeamsPost: async (_examId: string, messageId: string | null) => {
    if (H.recordFails) throw new Error('write timed out');
    H.exam.teams_results_message_id = messageId;
  },
  recordPointEvent: async (e: any) => {
    H.pointEvents.push(e.student_id);
  },
  awardBadge: async (studentId: string, badgeId: string) => {
    const key = `${studentId}:${badgeId}`;
    if (H.badges.includes(key)) return false;
    H.badges.push(key);
    return true;
  },
  getSupabaseAdminClient: () => {
    const thenable = (data: unknown) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: () => chain,
        eq: () => chain,
        in: () => chain,
        not: () => chain,
        maybeSingle: async () => ({ data, error: null }),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(ok, bad),
      };
      return chain;
    };
    return {
      from(table: string) {
        if (table === 'nexus_classrooms') return thenable(H.classroom);
        if (table === 'nexus_exam_results') {
          // The gamification history read, and this chain HONOURS its filters
          // so the belt-and-braces .not('attempt_id', 'is', null) is genuinely
          // under test rather than assumed.
          let rows = H.table.slice();
          const chain: Record<string, unknown> = {
            select: () => chain,
            in: (col: string, vals: string[]) => {
              rows = rows.filter((r) => vals.includes((r as any)[col]));
              return chain;
            },
            eq: (col: string, val: unknown) => {
              rows = rows.filter((r) => (r as any)[col] === val);
              return chain;
            },
            not: (col: string, op: string, val: unknown) => {
              if (op === 'is' && val === null) rows = rows.filter((r) => (r as any)[col] != null);
              return chain;
            },
            then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
              Promise.resolve({
                data: rows.map((r) => ({
                  student_id: r.student_id,
                  exam_id: r.exam_id,
                  percentage: r.percentage,
                })),
                error: null,
              }).then(ok, bad),
          };
          return chain;
        }
        return thenable([]);
      },
    };
  },
}));

vi.mock('@/lib/exam-access', () => ({
  requireExamStaff: async () => ({ ok: true, caller: { id: 'staff-1' }, exam: H.exam }),
  loadExamRoster: async () => H.roster,
}));

vi.mock('@/lib/ms-verify', () => ({
  extractBearerToken: (header: string | null) => (header ? header.replace('Bearer ', '') : null),
}));

vi.mock('@/lib/teams-class-announcements', () => ({
  postChannelMessageDetailed: async () => {
    if (H.teamsFails) return { error: 'Graph said no' };
    const id = `msg-${H.teamsPosts.length + 1}`;
    H.teamsPosts.push(id);
    return { id };
  },
  isPostError: (v: any) => Boolean(v && 'error' in v),
  resolveMeetingChannelId: async () => 'channel-1',
}));

vi.mock('@/lib/nudge-delivery', () => ({
  sendNudge: async (input: { studentIds: string[]; subject: string; plain: string }) => {
    for (const id of input.studentIds) {
      H.nudges.push({ studentId: id, subject: input.subject, plain: input.plain });
    }
  },
}));

import { POST as publish } from './[examId]/publish/route';
import { POST as notify } from './[examId]/notify/route';

const EXAM_ID = 'ex-1';
const PARAMS = { params: { examId: EXAM_ID } };

const req = (body: unknown = {}) =>
  ({
    headers: { get: (k: string) => (k === 'Authorization' ? 'Bearer real_ms_token' : null) },
    json: async () => body,
  }) as never;

/** One candidate row in the shape getExamResults returns. */
const candidate = (over: Record<string, unknown>) => ({
  student_id: 'x',
  student_name: 'X',
  avatar_url: null,
  attempt_id: null,
  rank: null,
  sitting: null,
  sitting_size: 0,
  bucket: 'still_to_sit',
  window_closes_at: null,
  score: 0,
  total_marks: 50,
  percentage: 0,
  provisional: false,
  absent: false,
  time_spent_seconds: null,
  section_scores: [],
  ...over,
});

const examDay = (id: string, rank: number, pct: number) =>
  candidate({
    student_id: id,
    student_name: id,
    attempt_id: `att-${id}`,
    rank,
    sitting: 'main',
    sitting_size: 2,
    bucket: 'exam_day',
    score: pct / 2,
    percentage: pct,
  });

const stillToSit = (id: string) =>
  candidate({ student_id: id, student_name: id, bucket: 'still_to_sit', window_closes_at: '2026-10-01T00:00:00Z' });

const secondSitting = (id: string, pct: number) =>
  candidate({
    student_id: id,
    student_name: id,
    attempt_id: `att-${id}`,
    rank: 1,
    sitting: 'second',
    sitting_size: 1,
    bucket: 'second_sitting',
    score: pct / 2,
    percentage: pct,
  });

const absentee = (id: string) =>
  candidate({ student_id: id, student_name: id, bucket: 'absent', absent: true });

const summary = (rows: any[]) => {
  const day = rows.filter((r) => r.bucket === 'exam_day');
  const late = rows.filter((r) => r.bucket === 'second_sitting');
  const pcts = day.map((r) => r.percentage);
  return {
    rows,
    stats: {
      roster: rows.length,
      sat: day.length,
      absent: rows.filter((r) => r.bucket === 'absent').length,
      still_to_sit: rows.filter((r) => r.bucket === 'still_to_sit').length,
      average: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0,
      highest: pcts.length ? Math.max(...pcts) : 0,
      lowest: pcts.length ? Math.min(...pcts) : 0,
      passed: day.length,
      passing_pct: 40,
    },
    second: late.length === 0 ? null : { sat: late.length, average: late[0].percentage, highest: late[0].percentage, lowest: late[0].percentage, passed: 1 },
    section_averages: [],
    podium: day.filter((r) => r.rank != null && r.rank <= 3),
    drawings_ungraded: 0,
  };
};

beforeEach(() => {
  H.table.length = 0;
  H.nudges.length = 0;
  H.teamsPosts.length = 0;
  H.pointEvents.length = 0;
  H.badges.length = 0;
  H.teamsFails = false;
  H.recordFails = false;
  H.exam = {
    id: EXAM_ID,
    classroom_id: 'c1',
    scheduled_class_id: 'sc1',
    title: 'History of Architecture Test',
    closes_at: '2026-08-20T07:30:00Z',
    passing_pct: 40,
    results_state: 'unpublished',
    results_published_at: null,
    teams_results_message_id: null,
  };
  // No Teams channel, so the Graph branch is skipped entirely unless a test
  // deliberately links one. Nothing here can ever reach a real classroom.
  H.classroom = { id: 'c1', name: 'NATA 2027', ms_team_id: null, ms_channel_id: null };
  H.roster = [];
  H.results = null;
  H.eligibility = { coveredClasses: [], students: [], attendance: new Map(), absences: new Map(), overrides: new Map() };
});

describe('publishing twice, notifying twice', () => {
  const DAY_ONE = [examDay('arun', 1, 84), examDay('hari', 2, 76), stillToSit('kaveya'), absentee('meera')];
  const LATER = [examDay('arun', 1, 84), examDay('hari', 2, 76), secondSitting('kaveya', 90), absentee('meera')];

  it('reaches the late student exactly once, and nobody twice', async () => {
    H.results = summary(DAY_ONE);
    await publish(req(), PARAMS);
    await notify(req(), PARAMS);

    const firstRound = H.nudges.map((n) => n.studentId).sort();
    // Not kaveya: she has not sat it, so she has no result and gets no row.
    expect(firstRound).toEqual(['arun', 'hari', 'meera']);

    // Weeks later. Kaveya finishes her catch-up and sits the paper.
    H.results = summary(LATER);
    await publish(req({ post_to_teams: false }), PARAMS);
    const second = await notify(req(), PARAMS);
    const body = await (second as Response).json();

    expect(body.data.notified).toBe(1);
    const all = H.nudges.map((n) => n.studentId);
    // The assertion this whole file exists for. Before the fix this was 0.
    expect(all.filter((id) => id === 'kaveya')).toHaveLength(1);
    expect(all.filter((id) => id === 'arun')).toHaveLength(1);
    expect(all.filter((id) => id === 'hari')).toHaveLength(1);
    expect(all.filter((id) => id === 'meera')).toHaveLength(1);
  });

  it('tells the late student their rank inside the second sitting, not the whole class', async () => {
    H.results = summary(DAY_ONE);
    await publish(req(), PARAMS);
    await notify(req(), PARAMS);
    H.results = summary(LATER);
    await publish(req({ post_to_teams: false }), PARAMS);
    await notify(req(), PARAMS);

    const hers = H.nudges.find((n) => n.studentId === 'kaveya');
    expect(hers?.plain).toContain('You sat this in the second sitting');
    // The rank itself is no longer in the chat (founder, 2026-09-20): the
    // message carries a link and the page carries the number. What must
    // survive is that she is told WHICH sitting she was in, because being
    // ranked 1st of 1 without that sentence reads as first in the class.
    expect(hers?.plain).toContain('ready in Nexus');
    expect(hers?.plain).not.toMatch(/\d/);
  });

  it('never writes a row for a student whose window is still open', async () => {
    H.results = summary(DAY_ONE);
    await publish(req(), PARAMS);

    expect(H.table.map((r) => r.student_id).sort()).toEqual(['arun', 'hari', 'meera']);
    expect(H.table.find((r) => r.student_id === 'kaveya')).toBeUndefined();
  });

  it('counts the rows it wrote, not the roster it read', async () => {
    H.results = summary(DAY_ONE);
    const res = await publish(req(), PARAMS);
    const body = await (res as Response).json();

    // Four on the roster, three rows written. The sheet renders this number as
    // "Published to N students", and saying 4 claims kaveya got something.
    expect(body.data.students).toBe(3);
    expect(H.table).toHaveLength(3);
  });

  it('tells an exam-day student their rank out of the exam-day count alone', async () => {
    H.results = summary(DAY_ONE);
    await publish(req(), PARAMS);
    await notify(req(), PARAMS);

    const his = H.nudges.find((n) => n.studentId === 'hari');
    // This used to pin "Your rank: 2nd of 2", because the message and the
    // student's own card had to agree on the sitting size and once did not.
    // They cannot disagree any more: the message states no number at all, and
    // the page it links to reads the same snapshot the card does. The
    // invariant that remains is that no number leaks into a Teams preview.
    expect(his?.plain).toContain('ready in Nexus');
    expect(his?.plain).not.toMatch(/\d/);
    expect(his?.plain).not.toContain('Your rank:');
  });

  /**
   * THE ABSENT HALF OF THE SAME DEFECT, and the journey the product itself
   * signposts.
   *
   * An absent student is deliberately kept in the snapshot: the door shut on
   * them and that is a real answer, so they get a row and they are told
   * "You were marked absent... speak to your teacher: they can open a second
   * window for you." That message stamps notified_at.
   *
   * So they do exactly that. The teacher opens a window, they sit the paper,
   * the teacher republishes. The upsert omits notified_at, so day one's stamp
   * survived, notify found nobody pending and returned { notified: 0 }, and the
   * sheet printed it as a success. The student who followed the instruction was
   * the one person never told their result.
   */
  const MEERA_SAT_LATE = [
    examDay('arun', 1, 84),
    examDay('hari', 2, 76),
    stillToSit('kaveya'),
    secondSitting('meera', 68),
  ];

  it('tells an absent student their result once they sit the second window', async () => {
    H.results = summary(DAY_ONE);
    await publish(req(), PARAMS);
    await notify(req(), PARAMS);

    const dayOne = H.nudges.filter((n) => n.studentId === 'meera');
    expect(dayOne).toHaveLength(1);
    expect(dayOne[0].plain).toContain('You were marked absent');
    // The instruction the whole journey hangs on.
    expect(dayOne[0].plain).toContain('they can open a second window for you');

    // She speaks to her teacher, the window opens, she sits it.
    H.results = summary(MEERA_SAT_LATE);
    await publish(req({ post_to_teams: false }), PARAMS);
    const second = await notify(req(), PARAMS);
    const body = await (second as Response).json();

    // Before the fix: 0. Her row still carried day one's stamp.
    expect(body.data.notified).toBe(1);

    const hers = H.nudges.filter((n) => n.studentId === 'meera');
    // "ready in Nexus" is the has-a-paper message. The absent notice never
    // says it, so this still separates the two exactly as 'Your rank' did.
    const told = hers.filter((n) => n.plain.includes('ready in Nexus'));
    // Exactly one message carries her result: not none, and not a second copy
    // on the next republish either.
    expect(told).toHaveLength(1);
    expect(told[0].plain).toContain('You sat this in the second sitting');
    // Two messages in total, and the first one is the absent notice she was
    // correctly sent on the day. Clearing the stamp must not resend that.
    expect(hers).toHaveLength(2);

    // And the students who were correctly told on the day are not told again.
    const ids = H.nudges.map((n) => n.studentId);
    expect(ids.filter((id) => id === 'arun')).toHaveLength(1);
    expect(ids.filter((id) => id === 'hari')).toHaveLength(1);
    // Her window is still open, so she is still not a result.
    expect(ids.filter((id) => id === 'kaveya')).toHaveLength(0);
  });

  it('does not clear the stamp of a student who already had a paper', async () => {
    H.results = summary(DAY_ONE);
    await publish(req(), PARAMS);
    await notify(req(), PARAMS);
    const stampedOnTheDay = H.table.find((r) => r.student_id === 'hari')?.notified_at;
    expect(stampedOnTheDay).toBeTruthy();

    // A republish after the drawings are marked rewrites hari's row with the
    // same attempt. He was told correctly and must not be told twice.
    H.results = summary(MEERA_SAT_LATE);
    await publish(req({ post_to_teams: false }), PARAMS);

    expect(H.table.find((r) => r.student_id === 'hari')?.notified_at).toBe(stampedOnTheDay);
  });

  it('gives points to whoever sat, and nothing to the student still to sit', async () => {
    H.results = summary(DAY_ONE);
    await publish(req(), PARAMS);
    expect(H.pointEvents.sort()).toEqual(['arun', 'hari']);
    expect(H.badges.filter((b) => b.startsWith('kaveya:'))).toHaveLength(0);
  });

  /**
   * Critical 3, the gamification half of the same root cause.
   *
   * A paperless row on an EARLIER exam looks like a sat exam to the history
   * query. It pushed examsSat towards the Regular threshold, and because a
   * still_to_sit candidate carries percentage 0 rather than null it turned
   * previousBestPct from "no history" into "a previous best of 0", so any score
   * at all beat it and Personal Best landed on a student's genuinely first
   * exam. That is the exact outcome the badge's own comment says it prevents.
   */
  it('does not award a personal best off a paperless row on an earlier exam', async () => {
    // Written by the old publish route when arun's window on ex-0 was open.
    H.table.push({
      exam_id: 'ex-0',
      student_id: 'arun',
      attempt_id: null,
      rank: null,
      sitting: 'main',
      score: 0,
      total_marks: 0,
      percentage: 0,
      section_scores: [],
      is_provisional: false,
      absent: false,
      notified_at: null,
      published_at: '2026-08-01T00:00:00Z',
    });

    H.results = summary(DAY_ONE);
    await publish(req(), PARAMS);

    // This is arun's first real exam, so there is no previous best to beat.
    expect(H.badges).not.toContain('arun:exam_personal_best');
  });
});

describe('the Teams announcement', () => {
  const ROWS = [examDay('arun', 1, 84), examDay('hari', 2, 76)];

  beforeEach(() => {
    H.classroom = { id: 'c1', name: 'NATA 2027', ms_team_id: 'team-1', ms_channel_id: 'channel-1' };
    H.results = summary(ROWS);
  });

  it('can be retried after a failed Graph post', async () => {
    H.teamsFails = true;
    const first = await publish(req(), PARAMS);
    const firstBody = await (first as Response).json();
    expect(firstBody.data.teams_error).toBe('Graph said no');
    expect(H.teamsPosts).toHaveLength(0);
    // The timestamp is stamped all the same, which is exactly the trap.
    expect(H.exam.results_published_at).toBeTruthy();

    H.teamsFails = false;
    const second = await publish(req(), PARAMS);
    const secondBody = await (second as Response).json();
    expect(secondBody.data.teams_error).toBeNull();
    // Before the fix this was 0: alreadyAnnounced read results_published_at, so
    // one transient Graph error silenced the class forever.
    expect(H.teamsPosts).toHaveLength(1);
    expect(H.exam.teams_results_message_id).toBe('msg-1');
  });

  /**
   * Graph accepted the card and the id write then failed.
   *
   * Throwing there 500'd the handler with the card already in the channel and
   * nothing recorded, so the teacher read a failed publish and the next press
   * posted a SECOND card to the whole class. The post cannot be unsent, so the
   * only safe answer is to keep the knowledge that it went and say what
   * happened.
   */
  it('does not fail the publish when the posted card id cannot be stored', async () => {
    H.recordFails = true;
    const res = await publish(req(), PARAMS);
    const body = await (res as Response).json();

    expect((res as Response).status).toBe(200);
    expect(H.teamsPosts).toHaveLength(1);
    expect(body.data.published).toBe(true);
    // The post succeeded, so this is not a teams_error: that would tell the
    // teacher to press again, which is the one thing they must not do.
    expect(body.data.teams_error).toBeNull();
    expect(body.data.teams_message_id).toBe('msg-1');
    expect(body.data.teams_record_error).toContain('Do not publish again');
  });

  it('is never sent a second time once Graph has accepted it', async () => {
    await publish(req(), PARAMS);
    expect(H.teamsPosts).toHaveLength(1);

    await publish(req(), PARAMS);
    // The channel hears about an exam once. Naming a second sitting there would
    // tell forty classmates who missed the class.
    expect(H.teamsPosts).toHaveLength(1);
  });
});

/**
 * 2026-09-17, the 18 Aug exam. Five students enrolled 31 Aug to 8 Sep, after
 * the classes the exam covered. getExamResults bucketed each of them absent (no
 * paper, no open window), so the first publish would have written them absent
 * rows and told each one privately "You were marked absent".
 */
describe('students the exam was never set for', () => {
  const COVERED = [{ id: 'c-12', title: 'Indus to Dravidian', scheduled_date: '2026-08-12' }];
  const enrolled = (id: string, at: string) => ({ student_id: id, name: id, avatar_url: null, enrolled_at: at });

  beforeEach(() => {
    H.eligibility = {
      coveredClasses: COVERED,
      students: [
        enrolled('arun', '2026-03-21T00:00:00Z'),
        enrolled('meera', '2026-03-21T00:00:00Z'),
        enrolled('ananya', '2026-08-31T06:00:00Z'),
        enrolled('salai', '2026-09-10T06:00:00Z'),
      ],
      attendance: new Map([
        ['arun', new Map([['c-12', true]])],
        ['meera', new Map([['c-12', true]])],
      ]),
      absences: new Map(),
      overrides: new Map(),
    };
  });

  const ROWS = () => [
    examDay('arun', 1, 84),
    absentee('meera'),
    // Joined weeks later, never sat it, no window: the engine excuses her.
    absentee('ananya'),
    // Joined later too, but sat it anyway. A paper is its own answer.
    secondSitting('salai', 72),
  ];

  it('never writes an absent row for a late joiner, and never tells her she was absent', async () => {
    H.results = summary(ROWS());
    await publish(req(), PARAMS);
    await notify(req(), PARAMS);

    expect(H.table.find((r) => r.student_id === 'ananya')).toBeUndefined();
    expect(H.nudges.filter((n) => n.studentId === 'ananya')).toHaveLength(0);
    // The student who really was absent is still told.
    expect(H.nudges.find((n) => n.studentId === 'meera')?.plain).toContain('You were marked absent');
  });

  it('keeps a late joiner who did sit it, ranked and told', async () => {
    H.results = summary(ROWS());
    await publish(req(), PARAMS);
    await notify(req(), PARAMS);

    expect(H.table.find((r) => r.student_id === 'salai')?.attempt_id).toBe('att-salai');
    expect(H.nudges.find((n) => n.studentId === 'salai')?.plain).toContain('ready in Nexus');
  });

  it('tells the teacher how many are not part of the exam, and leaves them out of the roster', async () => {
    H.results = summary(ROWS());
    const { GET } = await import('./[examId]/publish/route');
    const res = await GET(req(), PARAMS);
    const body = await (res as Response).json();

    expect(body.data.results.excused).toEqual({ total: 1, new_joiner: 1, catching_up: 0, by_teacher: 0 });
    // Every row the sheet lists is in one of the four groups, and the excused
    // student is in none of them.
    expect(body.data.results.rows.map((r: any) => r.student_id).sort()).toEqual(['arun', 'meera', 'salai']);
    expect(body.data.results.stats.roster).toBe(3);
    expect(body.data.results.stats.absent).toBe(1);
  });

  it('clears an absent row written before the student was excused', async () => {
    // Day one, before anybody linked the covered classes: everyone mandatory.
    H.eligibility = { ...H.eligibility, coveredClasses: [] };
    H.results = summary(ROWS());
    await publish(req(), PARAMS);
    expect(H.table.find((r) => r.student_id === 'ananya')?.absent).toBe(true);

    // The teacher links the classes, so she is excused, and publishes again.
    H.eligibility = { ...H.eligibility, coveredClasses: COVERED };
    await publish(req({ post_to_teams: false }), PARAMS);
    expect(H.table.find((r) => r.student_id === 'ananya')).toBeUndefined();
    // Nobody who earned a result lost it.
    expect(H.table.map((r) => r.student_id).sort()).toEqual(['arun', 'meera', 'salai']);
  });
});
