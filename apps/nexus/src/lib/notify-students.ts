import { getSupabaseAdminClient } from '@neram/database';
import { sendNudge } from './nudge-delivery';

/**
 * Tell a class (or part of it) about something that happened to the CLASS: a
 * cancelled or moved class, a new assignment, a scheduled test, a missed class.
 *
 * Two records, then the one door:
 *
 *  1. The timetable bell (nexus_timetable_notifications), the classroom-scoped
 *     list on the timetable page. Written first: it is the class's own record.
 *  2. sendNudge, like every other student message (founder rule): a Teams chat
 *     from the teacher when one is passed, the Teams activity feed otherwise, and
 *     the main Nexus bell, with a receipt per student.
 *
 * Dormant students are included on purpose. A message that exists because a
 * class exists (it moved, it was cancelled) still reaches a paused student, who
 * keeps their access and their invites; only "you have not done X" chasing stops.
 *
 * Never throws. A Teams outage must not roll back the thing being announced.
 */

export interface NotifyStudentsInput {
  classroomId: string;
  /** Omit to reach every active student in the classroom. */
  studentIds?: string[];
  eventType:
    | 'class_cancelled'
    | 'class_rescheduled'
    | 'class_created'
    | 'recording_available'
    | 'week_published'
    | 'absence_reason_needed'
    | 'test_scheduled'
    | 'assignment_published'
    | 'assignment_linked';
  /** Bell headline. */
  title: string;
  /** Bell body, the Teams preview line and the chat text. */
  message: string;
  /** Short Teams headline. Falls back to the title. */
  teamsText?: string;
  metadata?: Record<string, unknown>;
  /** Set false for the bells only: no Teams chat, no activity feed. */
  teams?: boolean;
  /** The teacher acting, so each student gets it as that teacher's own Teams chat. */
  teacher?: { authHeader: string | null; userId: string };
  /** @deprecated Every notice now reaches the main bell through sendNudge. Kept so callers compile. */
  topBar?: boolean;
}

export interface NotifyStudentsResult {
  recipients: number;
  /** Reached on Teams, by chat or activity feed. */
  teamsDelivered: number;
  inAppDelivered: number;
  /** Rows written to the main Nexus bell. */
  topBarDelivered: number;
}

export async function notifyStudents(input: NotifyStudentsInput): Promise<NotifyStudentsResult> {
  const supabase = getSupabaseAdminClient() as any;

  let studentIds = input.studentIds;
  if (!studentIds) {
    const { data } = await supabase
      .from('nexus_enrollments')
      .select('user_id')
      .eq('classroom_id', input.classroomId)
      .eq('role', 'student')
      .eq('is_active', true);
    studentIds = (data || []).map((e: any) => e.user_id as string);
  }

  const ids = [...new Set(studentIds || [])];
  if (ids.length === 0) {
    return { recipients: 0, teamsDelivered: 0, inAppDelivered: 0, topBarDelivered: 0 };
  }

  // The timetable bell first: it is the class's record, so it should not depend on Teams.
  let inAppDelivered = 0;
  const { error: bellError } = await supabase.from('nexus_timetable_notifications').insert(
    ids.map((userId) => ({
      classroom_id: input.classroomId,
      user_id: userId,
      event_type: input.eventType,
      title: input.title,
      message: input.message,
      metadata: input.metadata || null,
    })),
  );
  if (bellError) console.error(`${input.eventType} timetable bell failed:`, bellError.message);
  else inAppDelivered = ids.length;

  try {
    const { counts } = await sendNudge({
      studentIds: ids,
      respectDormancy: false,
      subject: input.title,
      plain: input.message,
      teamsText: input.teamsText || input.title,
      eventType: input.eventType,
      metadata: { classroom_id: input.classroomId, ...(input.metadata || {}) },
      // A class notice is an announcement, not a conversation: the class was
      // created, moved, cancelled, its recording is up, the week is published.
      // Nobody wrote it to any one student, so it goes out as Neram Assistant
      // with no teacher's name on it (founders, 2026-09-20 and 2026-09-24).
      ...(input.teams === false ? { bellOnly: true } : { assistant: {} }),
      source: { kind: input.eventType, refId: input.classroomId },
    });
    return { recipients: ids.length, teamsDelivered: counts.chat + counts.teams, inAppDelivered, topBarDelivered: counts.inapp };
  } catch (err) {
    console.error(`${input.eventType} sendNudge failed:`, err);
    return { recipients: ids.length, teamsDelivered: 0, inAppDelivered, topBarDelivered: 0 };
  }
}
