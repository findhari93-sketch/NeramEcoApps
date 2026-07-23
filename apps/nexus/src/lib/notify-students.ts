import { getSupabaseAdminClient } from '@neram/database';
import { sendTeamsActivityNotification } from '@neram/auth';

/**
 * Reach a set of students on more than one channel.
 *
 * Extracted from the assignment nudge route so anything that needs to tell
 * students something urgent, a cancelled class, a moved class, a missed class,
 * delivers it the same way instead of each caller inventing its own fan-out.
 *
 * Two channels, in order of usefulness:
 *
 *  1. The Neram Assistant Teams app, an activity-feed ping. This is the one
 *     students actually see, because Teams is already open on their machine.
 *     Needs TEAMS_APP_CATALOG_ID and the student's ms_oid.
 *  2. An in-app notification, always. The bell is the durable record: a Teams
 *     ping that arrives while the phone is off is gone, the bell is not.
 *
 * Never throws. A student with no Microsoft identity still gets the in-app
 * notification, and a Teams outage must not roll back the thing being announced.
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
    | 'absence_reason_needed';
  /** Bell headline. */
  title: string;
  /** Bell body, and the Teams preview line. */
  message: string;
  /** Short Teams headline. Falls back to the title. */
  teamsText?: string;
  metadata?: Record<string, unknown>;
  /** Set false to write the bell notification only. */
  teams?: boolean;
}

export interface NotifyStudentsResult {
  recipients: number;
  teamsDelivered: number;
  inAppDelivered: number;
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
    return { recipients: 0, teamsDelivered: 0, inAppDelivered: 0 };
  }

  // The bell first: it is the record, so it should not depend on Teams working.
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
  if (!bellError) inAppDelivered = ids.length;

  let teamsDelivered = 0;
  const catalogAppId = process.env.TEAMS_APP_CATALOG_ID;
  if (input.teams !== false && catalogAppId) {
    const { data: users } = await supabase.from('users').select('id, ms_oid').in('id', ids);

    const results = await Promise.allSettled(
      (users || [])
        .filter((u: any) => u.ms_oid)
        .map((u: any) =>
          sendTeamsActivityNotification(u.ms_oid, {
            text: input.teamsText || input.title,
            preview: input.message,
            catalogAppId,
          }),
        ),
    );
    teamsDelivered = results.filter((r) => r.status === 'fulfilled' && (r.value as any)?.ok).length;
  }

  return { recipients: ids.length, teamsDelivered, inAppDelivered };
}
