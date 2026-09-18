/**
 * Chasing the students whose catch-up is standing between them and a test.
 *
 * On the 18 Aug exam five students had joined after the covered classes, owed
 * one or two classes of catch-up, and had never sat the paper. Nobody had ever
 * messaged any of them about it. The teacher's loop was to read the Students
 * tab, search each name, and ask them one at a time.
 *
 * WHY THIS GROUP AND NOT "EVERYONE WHO HAS NOT SAT IT". A message is only worth
 * sending when the person can act on it. Finishing the catch-up calls
 * grantClassTestWindowForClass, which opens that student's own window on the
 * exam placement, so the loop closes without a teacher touching it. A student
 * who is caught up and still has not sat it needs a door opened, and that is a
 * decision rather than a reminder.
 *
 * WHY IT RIDES ON THE OVERDUE SWEEP rather than its own cron. That job already
 * messages some of these students about the same classes on the same morning,
 * and two notifications about one conversation is how students learn to mute
 * the app. It is handed the ids that sweep just reached and skips them, so at
 * most one message per student per morning leaves this route.
 *
 * NO NEW TABLE. nexus_class_test_reminders is already the send log keyed on
 * placement, student and template, which is exactly the key this needs, and its
 * `sent_by IS NULL` already means "the machine sent this".
 *
 * The decision half is pure. The I/O half reads, decides, sends, and logs.
 */

import {
  getSupabaseAdminClient,
  listCoveredClasses,
  loadAttendanceAndAbsences,
  loadRunSittings,
  recordClassTestReminder,
} from '@neram/database';
import { buildRunCatchup, outstandingClassNames } from './run-catchup';
import { sendNudge } from './nudge-delivery';
import { senderLookup } from './teams-sender';

/** A student who joined this week is not behind, they are new. */
export const CHASE_GRACE_DAYS = 7;
/** Never twice in a week about the same run. */
export const CHASE_COOLDOWN_DAYS = 6;
/** Three messages, then it is a person's job. */
export const CHASE_MAX_STEPS = 3;
/** The send log template, distinct so a teacher's own message keeps its own cooldown. */
export const CHASE_TEMPLATE = 'catchup_then_test';
/** Written once when a student stops being chased, so the hand-off happens once. */
export const CHASE_HANDOFF_TEMPLATE = 'catchup_then_test_handoff';
/** A cohort-wide blast is never the right answer. */
export const MAX_CHASES_PER_RUN = 40;
/** Past this the exam is history and chasing it is noise. */
export const CHASE_EXAM_MAX_AGE_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ChaseOutstandingClass {
  id: string;
  title: string | null;
  date: string;
}

export interface ChaseCandidate {
  studentId: string;
  classroomId: string;
  placementId: string;
  testTitle: string;
  /** nexus_enrollments.enrolled_at, which is what the grace period is measured from. */
  enrolledAt: string | null;
  /** The classes in the way, oldest first. Empty means nothing to chase. */
  outstanding: ChaseOutstandingClass[];
  sat: boolean;
  dormant: boolean;
  /** Chase messages already sent to this student about this run. */
  stepsSent: number;
  lastSentAt: string | null;
  /** A hand-off has already been written, so the teacher has been told once. */
  handedOff: boolean;
}

export interface ChaseSend extends ChaseCandidate {
  step: number;
}

export interface ChaseDecision {
  send: ChaseSend[];
  handOff: ChaseCandidate[];
  /** More students qualified than the cap allows, so this run is partial. */
  capped: boolean;
}

export interface DecideChaseOptions {
  now: number;
  /** Students another pass has already messaged this morning. */
  skipStudentIds?: ReadonlySet<string>;
  max?: number;
}

/**
 * PURE. Who gets a message, who gets handed to a teacher, and who is left alone.
 *
 * The order of the guards is the feature. A student who has sat it is never
 * chased however far behind their catch-up is, and a paused student is never
 * chased at all: pausing somebody means staff have stopped tracking them, and a
 * cron that keeps messaging them says the opposite.
 */
export function decideTestChase(
  candidates: ChaseCandidate[],
  opts: DecideChaseOptions,
): ChaseDecision {
  const skip = opts.skipStudentIds ?? new Set<string>();
  const max = opts.max ?? MAX_CHASES_PER_RUN;
  const send: ChaseSend[] = [];
  const handOff: ChaseCandidate[] = [];

  for (const c of candidates || []) {
    if (c.sat) continue;
    if (c.dormant) continue;
    if (!c.outstanding || c.outstanding.length === 0) continue;
    if (skip.has(c.studentId)) continue;

    const lastMs = c.lastSentAt ? Date.parse(c.lastSentAt) : NaN;
    const waited = !Number.isFinite(lastMs) || opts.now - lastMs >= CHASE_COOLDOWN_DAYS * DAY_MS;

    // Three ignored messages is the end of what a machine should do. The teacher
    // is told once, through the hand-off log row, and the student is left alone.
    if (c.stepsSent >= CHASE_MAX_STEPS) {
      if (!c.handedOff && waited) handOff.push(c);
      continue;
    }

    const joinedMs = c.enrolledAt ? Date.parse(c.enrolledAt) : NaN;
    if (Number.isFinite(joinedMs) && opts.now - joinedMs < CHASE_GRACE_DAYS * DAY_MS) continue;

    if (!waited) continue;

    send.push({ ...c, step: c.stepsSent + 1 });
  }

  // Furthest behind first, then whoever joined longest ago, so a capped run
  // still reaches the students it matters most for.
  send.sort(
    (a, b) =>
      b.outstanding.length - a.outstanding.length ||
      (Date.parse(a.enrolledAt || '') || 0) - (Date.parse(b.enrolledAt || '') || 0),
  );

  return { send: send.slice(0, max), handOff, capped: send.length > max };
}

export interface ChaseMessage {
  subject: string;
  plain: string;
  teamsText: string;
}

/**
 * PURE. What each step actually says.
 *
 * Firmer each time and never threatening: the last one says a teacher will be
 * in touch, which is true, rather than inventing a consequence.
 */
export function chaseMessage(
  step: number,
  input: { testTitle: string; outstanding: ChaseOutstandingClass[] },
): ChaseMessage {
  const classes = outstandingClassNames(input.outstanding);
  const n = input.outstanding.length;
  const opens = 'Finish the catch-up and the test opens for you on its own.';

  if (step <= 1) {
    const lead = `You have not sat ${input.testTitle} yet, and there is catch-up waiting first.`;
    return {
      subject: `Catch up, then sit: ${input.testTitle}`,
      plain: [
        lead,
        '',
        `Still to catch up: ${classes}.`,
        '',
        `${opens} You do not need to ask a teacher first.`,
        '',
        'If something is stopping you, reply and say what it is.',
      ].join('\n'),
      teamsText: lead,
    };
  }

  if (step === 2) {
    const lead = `${n} ${n === 1 ? 'class' : 'classes'} of catch-up is still holding up ${input.testTitle}.`;
    return {
      subject: `Still waiting: ${input.testTitle}`,
      plain: [
        lead,
        '',
        `Still to catch up: ${classes}.`,
        '',
        `${opens} Please make a start this week.`,
        '',
        'If you are stuck on any of it, reply and tell me where.',
      ].join('\n'),
      teamsText: lead,
    };
  }

  const lead = `This is my last reminder about ${input.testTitle}.`;
  return {
    subject: `Last reminder: ${input.testTitle}`,
    plain: [
      lead,
      '',
      `Still to catch up: ${classes}.`,
      '',
      `${opens} If I do not hear from you, a teacher will be in touch to work out what is going on.`,
      '',
      'Reply here if that is easier.',
    ].join('\n'),
    teamsText: lead,
  };
}

export interface ChaseSweepResult {
  runs: number;
  candidates: number;
  chased: number;
  handedOff: number;
  capped: boolean;
  errors: string[];
  /** Named, so a dry run can be read without opening the database. */
  preview: Array<{ student_id: string; test: string; step: number; classes: string }>;
}

export interface ChaseSweepOptions {
  /** Students already messaged in this run, who must not get a second alert. */
  skipStudentIds?: ReadonlySet<string>;
  /** Decide and report, send nothing and write nothing. */
  dryRun?: boolean;
  now?: number;
}

/**
 * Every recently closed exam whose results are not final, and who on it is
 * still held up by catch-up.
 *
 * Scoped to exams because that is the only door with a hard window and a roster
 * of who owed it. A practice pool has nobody who owes it, and production has
 * zero class_test placements.
 */
export async function sweepTestChase(
  client?: any,
  options: ChaseSweepOptions = {},
): Promise<ChaseSweepResult> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const now = options.now ?? Date.now();
  const result: ChaseSweepResult = {
    runs: 0,
    candidates: 0,
    chased: 0,
    handedOff: 0,
    capped: false,
    errors: [],
    preview: [],
  };

  const since = new Date(now - CHASE_EXAM_MAX_AGE_DAYS * DAY_MS).toISOString();
  const { data: exams, error: examErr } = await supabase
    .from('nexus_exams')
    .select('id, classroom_id, scheduled_class_id, title, closes_at, results_state')
    .gte('closes_at', since)
    .lte('closes_at', new Date(now).toISOString())
    .neq('results_state', 'final');
  if (examErr) throw examErr;
  if (!exams || exams.length === 0) return result;

  const { data: placements, error: placementErr } = await supabase
    .from('nexus_test_placements')
    .select('id, test_id, context_type, context_id, available_from, available_until')
    .eq('context_type', 'exam')
    .eq('is_active', true)
    .in(
      'context_id',
      (exams as any[]).map((e) => e.scheduled_class_id),
    );
  if (placementErr) throw placementErr;

  const placementByClass = new Map<string, any>();
  for (const p of (placements || []) as any[]) placementByClass.set(p.context_id, p);

  const senderFor = senderLookup(supabase);
  // Grows as the sweep goes, so a student behind on two overdue exams hears
  // about one of them this morning rather than both.
  const reached = new Set<string>(options.skipStudentIds ?? []);

  for (const exam of exams as any[]) {
    const placement = placementByClass.get(exam.scheduled_class_id);
    if (!placement) continue;
    result.runs += 1;

    try {
      const candidates = await loadChaseCandidates(exam, placement, supabase);
      result.candidates += candidates.length;

      const decision = decideTestChase(candidates, {
        now,
        skipStudentIds: reached,
        max: Math.max(0, MAX_CHASES_PER_RUN - result.chased),
      });
      result.capped = result.capped || decision.capped;

      for (const target of decision.send) {
        const message = chaseMessage(target.step, {
          testTitle: target.testTitle,
          outstanding: target.outstanding,
        });
        result.preview.push({
          student_id: target.studentId,
          test: target.testTitle,
          step: target.step,
          classes: outstandingClassNames(target.outstanding),
        });
        if (options.dryRun) {
          reached.add(target.studentId);
          result.chased += 1;
          continue;
        }
        try {
          const { results: sent } = await sendNudge({
            studentIds: [target.studentId],
            // As the classroom's connected teacher, so the student can reply
            // to a person. {} when nobody has connected Teams, and the feed
            // and the bell carry it alone.
            ...(await senderFor(target.classroomId)),
            subject: message.subject,
            plain: message.plain,
            teamsText: message.teamsText,
            // An existing enum value on production, with a bell colour and a
            // navigation case already. A new one needs its own migration and
            // has gone missing on prod before, which silently drops the send.
            eventType: 'class_test_due',
            metadata: {
              placement_id: target.placementId,
              scheduled_class_id: exam.scheduled_class_id,
              outstanding: target.outstanding.length,
              step: target.step,
              source: 'test_chase',
            },
          });
          await recordClassTestReminder(
            {
              placement_id: target.placementId,
              student_id: target.studentId,
              sent_by: null,
              channel: sent?.[0]?.channel ?? null,
              template: CHASE_TEMPLATE,
            },
            supabase,
          );
          reached.add(target.studentId);
          result.chased += 1;
        } catch (err) {
          result.errors.push(
            `chase ${target.studentId}: ${err instanceof Error ? err.message : 'unknown error'}`,
          );
        }
      }

      if (decision.handOff.length > 0) {
        result.handedOff += decision.handOff.length;
        if (!options.dryRun) {
          await handOffToStaff(exam, decision.handOff, supabase).catch((err) => {
            result.errors.push(
              `hand-off ${exam.id}: ${err instanceof Error ? err.message : 'unknown error'}`,
            );
          });
        }
      }
    } catch (err) {
      result.errors.push(`exam ${exam.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  if (result.capped) {
    // Said out loud, so a bounded run is never read as full coverage.
    console.warn(`[test chase] capped at ${MAX_CHASES_PER_RUN}; more students qualified`);
  }

  return result;
}

/** One exam's roster, catch-up, sittings and send history, in batched reads. */
async function loadChaseCandidates(
  exam: { id: string; classroom_id: string; title: string | null },
  placement: { id: string; test_id: string },
  supabase: any,
): Promise<ChaseCandidate[]> {
  const { data: enrolments, error } = await supabase
    .from('nexus_enrollments')
    .select('user_id, enrolled_at, participation_status')
    .eq('classroom_id', exam.classroom_id)
    .eq('role', 'student')
    .eq('is_active', true);
  if (error) throw error;

  const rows = (enrolments || []) as any[];
  const studentIds = rows.map((r) => r.user_id as string);
  if (studentIds.length === 0) return [];

  // An exam that covers no class gates nobody, so nobody can be behind on it.
  const covered = await listCoveredClasses(exam.id, supabase);
  if (covered.length === 0) return [];

  const [facts, sittings, history] = await Promise.all([
    loadAttendanceAndAbsences(
      studentIds,
      covered.map((c) => c.id),
      supabase,
    ),
    loadRunSittings<any>([placement as any], { studentIds }, supabase),
    loadChaseHistory(placement.id, supabase),
  ]);

  const catchup = buildRunCatchup({
    studentIds,
    coveredClasses: covered as any,
    attendance: facts.attendance,
    absences: facts.absences,
  });
  const sat = new Set(((sittings.get(placement.id) || []) as any[]).map((s) => s.student_id));

  return rows.map((r) => {
    const own = history.get(r.user_id) ?? { steps: 0, lastSentAt: null, handedOff: false };
    const state = catchup[r.user_id];
    return {
      studentId: r.user_id,
      classroomId: exam.classroom_id,
      placementId: placement.id,
      testTitle: exam.title || 'this test',
      enrolledAt: r.enrolled_at ?? null,
      outstanding: state?.state === 'behind' ? state.outstanding : [],
      sat: sat.has(r.user_id),
      dormant: r.participation_status === 'dormant',
      stepsSent: own.steps,
      lastSentAt: own.lastSentAt,
      handedOff: own.handedOff,
    };
  });
}

/** How often each student has been chased about this run, and when it last went out. */
async function loadChaseHistory(
  placementId: string,
  supabase: any,
): Promise<Map<string, { steps: number; lastSentAt: string | null; handedOff: boolean }>> {
  const out = new Map<string, { steps: number; lastSentAt: string | null; handedOff: boolean }>();
  const { data } = await supabase
    .from('nexus_class_test_reminders')
    .select('student_id, template, sent_at')
    .eq('placement_id', placementId)
    .in('template', [CHASE_TEMPLATE, CHASE_HANDOFF_TEMPLATE]);

  for (const row of (data || []) as any[]) {
    const own = out.get(row.student_id) ?? { steps: 0, lastSentAt: null, handedOff: false };
    if (row.template === CHASE_HANDOFF_TEMPLATE) {
      own.handedOff = true;
    } else {
      own.steps += 1;
      if (!own.lastSentAt || String(row.sent_at) > own.lastSentAt) own.lastSentAt = row.sent_at;
    }
    out.set(row.student_id, own);
  }
  return out;
}

/**
 * Stop messaging and put the names on the teachers' list.
 *
 * The log row is written per student, because it is what stops the hand-off
 * repeating every morning. The teacher notification is one row per classroom: a
 * row per student would bury it.
 */
async function handOffToStaff(
  exam: { id: string; classroom_id: string; scheduled_class_id: string; title: string | null },
  students: ChaseCandidate[],
  supabase: any,
): Promise<void> {
  for (const s of students) {
    await recordClassTestReminder(
      {
        placement_id: s.placementId,
        student_id: s.studentId,
        sent_by: null,
        channel: 'handoff',
        template: CHASE_HANDOFF_TEMPLATE,
      },
      supabase,
    );
  }

  const { data: staff } = await supabase
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', exam.classroom_id)
    .eq('role', 'teacher')
    .eq('is_active', true);

  const count = students.length;
  const notifications = ((staff || []) as any[]).map((s) => ({
    classroom_id: exam.classroom_id,
    user_id: s.user_id,
    event_type: 'catchup_needs_attention',
    title: `${count} ${count === 1 ? 'student needs' : 'students need'} a call about ${exam.title || 'a test'}`,
    message: 'They have had three reminders to catch up and sit it, and have not.',
    metadata: { count, exam_id: exam.id, scheduled_class_id: exam.scheduled_class_id },
  }));

  if (notifications.length > 0) {
    await supabase.from('nexus_timetable_notifications').insert(notifications);
  }
}
