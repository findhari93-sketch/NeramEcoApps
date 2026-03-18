import { getSupabaseAdminClient } from '@neram/database';

type TimetableEventType =
  | 'rsvp_attending'
  | 'rsvp_not_attending'
  | 'class_created'
  | 'class_cancelled'
  | 'class_rescheduled'
  | 'holiday_marked'
  | 'recording_available'
  | 'review_submitted';

interface NotifyParams {
  classroomId: string;
  eventType: TimetableEventType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  recipientUserIds: string[];
}

/**
 * Insert timetable notifications for multiple users.
 */
async function insertNotifications(params: NotifyParams) {
  if (params.recipientUserIds.length === 0) return;

  const supabase = getSupabaseAdminClient() as any;

  const rows = params.recipientUserIds.map((userId) => ({
    classroom_id: params.classroomId,
    user_id: userId,
    event_type: params.eventType,
    title: params.title,
    message: params.message,
    metadata: params.metadata || null,
  }));

  await supabase.from('nexus_timetable_notifications').insert(rows);
}

/**
 * Get all enrolled users by role in a classroom.
 */
async function getEnrolledUsers(classroomId: string, role: 'teacher' | 'student') {
  const supabase = getSupabaseAdminClient() as any;
  const { data } = await supabase
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', classroomId)
    .eq('role', role)
    .eq('is_active', true);

  return (data || []).map((e: any) => e.user_id as string);
}

/**
 * Notify all enrolled students when a class is created.
 */
export async function notifyClassCreated(
  classroomId: string,
  classTitle: string,
  scheduledDate: string,
  classId: string
) {
  const studentIds = await getEnrolledUsers(classroomId, 'student');
  await insertNotifications({
    classroomId,
    eventType: 'class_created',
    title: 'New Class Scheduled',
    message: `"${classTitle}" has been scheduled for ${scheduledDate}.`,
    metadata: { class_id: classId },
    recipientUserIds: studentIds,
  });
}

/**
 * Notify all enrolled students when a class is cancelled.
 */
export async function notifyClassCancelled(
  classroomId: string,
  classTitle: string,
  scheduledDate: string,
  classId: string
) {
  const studentIds = await getEnrolledUsers(classroomId, 'student');
  await insertNotifications({
    classroomId,
    eventType: 'class_cancelled',
    title: 'Class Cancelled',
    message: `"${classTitle}" on ${scheduledDate} has been cancelled.`,
    metadata: { class_id: classId },
    recipientUserIds: studentIds,
  });
}

/**
 * Notify teachers when a student RSVPs.
 */
export async function notifyRsvpToTeacher(
  classroomId: string,
  studentName: string,
  response: 'attending' | 'not_attending',
  reason: string | null,
  classTitle: string,
  classId: string
) {
  const teacherIds = await getEnrolledUsers(classroomId, 'teacher');

  const isAttending = response === 'attending';
  const message = isAttending
    ? `${studentName} will attend "${classTitle}".`
    : `${studentName} can't attend "${classTitle}"${reason ? `: "${reason}"` : '.'}`;

  await insertNotifications({
    classroomId,
    eventType: isAttending ? 'rsvp_attending' : 'rsvp_not_attending',
    title: isAttending ? 'Student RSVP: Attending' : 'Student RSVP: Not Attending',
    message,
    metadata: { class_id: classId, student_name: studentName, reason },
    recipientUserIds: teacherIds,
  });
}

/**
 * Notify all enrolled students when a holiday is marked.
 */
export async function notifyHolidayMarked(
  classroomId: string,
  holidayDate: string,
  holidayTitle: string
) {
  const studentIds = await getEnrolledUsers(classroomId, 'student');
  await insertNotifications({
    classroomId,
    eventType: 'holiday_marked',
    title: 'Holiday Declared',
    message: `${holidayTitle} on ${holidayDate}. No classes on this day.`,
    metadata: { holiday_date: holidayDate },
    recipientUserIds: studentIds,
  });
}

/**
 * Notify all enrolled students when a recording is available.
 */
export async function notifyRecordingAvailable(
  classroomId: string,
  classTitle: string,
  classId: string
) {
  const studentIds = await getEnrolledUsers(classroomId, 'student');
  await insertNotifications({
    classroomId,
    eventType: 'recording_available',
    title: 'Recording Available',
    message: `The recording for "${classTitle}" is now available.`,
    metadata: { class_id: classId },
    recipientUserIds: studentIds,
  });
}
