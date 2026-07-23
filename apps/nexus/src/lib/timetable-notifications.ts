import { getSupabaseAdminClient } from '@neram/database';

type TimetableEventType =
  | 'rsvp_attending'
  | 'rsvp_not_attending'
  | 'class_created'
  | 'class_cancelled'
  | 'class_rescheduled'
  | 'holiday_marked'
  | 'recording_available'
  | 'review_submitted'
  | 'assignment_published'
  | 'assignment_reviewed'
  | 'week_published';

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
 * Notify all enrolled students that a week's schedule is now live.
 *
 * One notification for the whole week, replacing one per class. A five-class
 * week used to fire five separate "New Class Scheduled" alerts as the teacher
 * built it, which is exactly the noise that trains students to ignore the bell.
 */
export async function notifyWeekPublished(
  classroomId: string,
  weekStart: string,
  classCount: number,
) {
  const studentIds = await getEnrolledUsers(classroomId, 'student');
  const label = new Date(`${weekStart}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
  await insertNotifications({
    classroomId,
    eventType: 'week_published',
    title: 'This week is ready',
    message:
      classCount === 1
        ? `1 class is scheduled for the week of ${label}. Open your timetable to see it.`
        : `${classCount} classes are scheduled for the week of ${label}. Open your timetable to see them.`,
    metadata: { week_start: weekStart, class_count: classCount },
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

/**
 * Notify all enrolled students when an assignment is published.
 */
export async function notifyAssignmentPublished(
  classroomId: string,
  assignmentTitle: string,
  assignmentId: string,
  dueAt?: string | null
) {
  const studentIds = await getEnrolledUsers(classroomId, 'student');
  const dueLine = dueAt
    ? ` Due ${new Date(dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`
    : '';
  await insertNotifications({
    classroomId,
    eventType: 'assignment_published',
    title: 'New Assignment',
    message: `"${assignmentTitle}" has been assigned.${dueLine}`,
    metadata: { assignment_id: assignmentId },
    recipientUserIds: studentIds,
  });
}

/**
 * Notify a single student when their submission has been reviewed.
 */
export async function notifyAssignmentReviewed(
  classroomId: string,
  studentId: string,
  assignmentTitle: string,
  assignmentId: string,
  action: 'complete' | 'redo'
) {
  const message =
    action === 'redo'
      ? `Your teacher asked you to redo "${assignmentTitle}". Open it to see the feedback.`
      : `Your submission for "${assignmentTitle}" has been marked.`;
  await insertNotifications({
    classroomId,
    eventType: 'assignment_reviewed',
    title: action === 'redo' ? 'Please redo your work' : 'Assignment marked',
    message,
    metadata: { assignment_id: assignmentId, action },
    recipientUserIds: [studentId],
  });
}
