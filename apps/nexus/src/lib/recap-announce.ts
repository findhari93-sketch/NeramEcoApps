/**
 * Telling the students who missed a class that its catch-up is now open.
 *
 * The missing half of automatic publishing. Recaps have been generated and
 * published without a human for months, and in all that time nothing ever told a
 * student one existed. The only automatic messages about a missed class were the
 * chase messages, which arrive days later and open by saying they are behind.
 * Publishing fifteen minutes after a class is only worth doing if somebody finds
 * out it happened.
 *
 * Three rules, and each of them is load-bearing:
 *
 *   1. ONLY students who owe this class. An open row in `nexus_class_absences`
 *      means they missed it and have not caught up or been excused. A student who
 *      attended owes nothing, and messaging the whole room about every class
 *      teaches everyone to mute the channel the chase messages need.
 *   2. CLAIM BEFORE SENDING. `students_notified_at` is stamped with an
 *      `.is(null)` predicate and the send only happens if that update matched.
 *      The sweep runs every fifteen minutes and a repair republishes, so without
 *      this the same student is messaged again and again.
 *   3. Through `sendNudge` and nothing else, as the classroom's connected
 *      teacher, so the student can reply to a person.
 *
 * Never throws. An announcement that fails must not fail the publish that earned
 * it: the recap is live either way, and the student will still find it.
 */

import { sendNudge } from './nudge-delivery';
import { senderLookup } from './teams-sender';
import type { AutodraftOutcome } from './recap-autodraft';

/** Rows the announcer needs about a class it is about to talk about. */
interface AnnounceTarget {
  recapId: string;
  classId: string;
  classroomId: string | null;
  title: string | null;
}

/**
 * Stamp `students_notified_at`, and report whether WE were the ones who stamped
 * it.
 *
 * The `.is('students_notified_at', null)` in the predicate is the whole claim: a
 * second run, or an overlapping one, updates zero rows and is told so by the
 * empty `select`. Doing this before the send rather than after means a crash
 * mid-send costs one silent recap rather than a repeated message, which is the
 * right way round.
 */
async function claim(supabase: any, recapId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('nexus_class_recaps')
    .update({ students_notified_at: new Date().toISOString() })
    .eq('id', recapId)
    .is('students_notified_at', null)
    .select('id');

  if (error) {
    // A missing column (migration not yet applied) must not take the cron down.
    console.warn(`[recap-announce] could not claim ${recapId}:`, error.message);
    return false;
  }
  return (data || []).length > 0;
}

/** Students who missed this class and have neither caught up nor been excused. */
async function studentsOwing(supabase: any, classId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('nexus_class_absences')
    .select('student_id')
    .eq('scheduled_class_id', classId)
    .is('caught_up_at', null)
    .is('excused_at', null);

  if (error) throw new Error(error.message);
  return Array.from(new Set((data || []).map((r: any) => r.student_id).filter(Boolean)));
}

/** The classroom and title for each class we are announcing. */
async function readTargets(
  supabase: any,
  outcomes: AutodraftOutcome[],
): Promise<AnnounceTarget[]> {
  const published = outcomes.filter(
    (o): o is Extract<AutodraftOutcome, { ok: true }> => o.ok && !!o.published && !!o.recapId,
  );
  if (published.length === 0) return [];

  const { data, error } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, classroom_id, title')
    .in(
      'id',
      published.map((o) => o.classId),
    );
  if (error) throw new Error(error.message);

  const byId = new Map<string, any>((data || []).map((c: any) => [c.id, c]));
  return published.map((o) => ({
    recapId: o.recapId,
    classId: o.classId,
    classroomId: byId.get(o.classId)?.classroom_id ?? null,
    title: byId.get(o.classId)?.title ?? null,
  }));
}

/**
 * The message itself.
 *
 * Names the class, says what it costs them and where it goes, and does not
 * mention that they missed it. They know. The chase messages exist for the
 * students who let it slide; this one is the opposite of a chase, and the tone
 * has to say so or it reads as the same nagging arriving earlier.
 */
function compose(title: string | null): { subject: string; plain: string; teamsText: string } {
  const named = title && title.trim() ? title.trim() : 'the last class';
  return {
    subject: 'Your catch-up is ready',
    plain:
      `Hi {firstName}, the catch-up for ${named} is ready now.\n\n` +
      'It is the class recording with a few checkpoint questions along the way, ' +
      'so you can pick up exactly what you missed. Most people finish in about ' +
      'twenty minutes, and it clears the class off your list.',
    teamsText: `The catch-up for ${named} is ready`,
  };
}

export interface AnnounceSummary {
  /** Recaps this run claimed and announced. */
  announced: number;
  /** Students messaged across all of them. */
  students: number;
  /** Claimed by an earlier run, or by an overlapping one. */
  alreadyTold: number;
  errors: string[];
}

/**
 * Announce every recap in `outcomes` that this run published.
 *
 * Safe to call on every pass: an outcome that did not publish is ignored, and one
 * whose students have already been told loses the claim and is skipped.
 */
export async function announcePublishedRecaps(
  supabase: any,
  outcomes: AutodraftOutcome[],
): Promise<AnnounceSummary> {
  const summary: AnnounceSummary = { announced: 0, students: 0, alreadyTold: 0, errors: [] };

  let targets: AnnounceTarget[] = [];
  try {
    targets = await readTargets(supabase, outcomes);
  } catch (err) {
    summary.errors.push(err instanceof Error ? err.message : 'could not read classes');
    return summary;
  }
  if (targets.length === 0) return summary;

  const senderFor = senderLookup(supabase);

  for (const t of targets) {
    try {
      const studentIds = await studentsOwing(supabase, t.classId);
      // Nothing to say, and the claim would waste the one message this recap
      // gets: a student added to the class later still deserves to hear about it
      // from the ordinary catch-up screen rather than never.
      if (studentIds.length === 0) continue;

      if (!(await claim(supabase, t.recapId))) {
        summary.alreadyTold += 1;
        continue;
      }

      const { subject, plain, teamsText } = compose(t.title);
      await sendNudge({
        studentIds,
        ...(await senderFor(t.classroomId)),
        subject,
        plain,
        teamsText,
        eventType: 'recap_ready',
        metadata: { recap_id: t.recapId, scheduled_class_id: t.classId },
        source: { kind: 'recap_ready', refId: t.recapId },
      });

      summary.announced += 1;
      summary.students += studentIds.length;
    } catch (err) {
      summary.errors.push(
        `recap ${t.recapId}: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  return summary;
}
