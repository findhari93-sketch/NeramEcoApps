/**
 * A classroom's next classes, as the student dashboard has always listed them:
 * scheduled or live, today onwards, with today's already-ended classes dropped.
 * Extracted from app/api/dashboard/student/route.ts so the assistant's brief,
 * `my_schedule` and the cannot-attend flow read exactly what the dashboard shows.
 */

export const UPCOMING_CLASS_SELECT =
  'id, title, classroom_id, scheduled_date, start_time, end_time, status, teams_meeting_url, ' +
  'topic:nexus_topics(title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(name)';

export interface UpcomingClass {
  id: string;
  title: string;
  classroom_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  teams_meeting_url: string | null;
  topic?: { title: string; category: string } | null;
  teacher?: { name: string } | null;
}

/** IST calendar date and clock, so a Vercel UTC server agrees with the student's evening. */
export function istNow(now: Date = new Date()): { today: string; nowHHMM: string } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const nowHHMM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return { today, nowHHMM };
}

/** Today's classes whose end time has passed are over; everything else stays. Pure. */
export function dropEnded<T extends { scheduled_date: string; end_time: string }>(rows: T[], today: string, nowHHMM: string): T[] {
  return rows.filter((cls) => (cls.scheduled_date > today ? true : cls.end_time > nowHHMM));
}

export async function loadUpcomingClasses(
  supabase: any,
  classroomId: string,
  opts: { today?: string; nowHHMM?: string; limit?: number } = {},
): Promise<UpcomingClass[]> {
  const { today, nowHHMM } = { ...istNow(), ...opts };
  const limit = opts.limit ?? 5;
  // Over-fetch: today's ended classes are dropped in code, and the limit applies after.
  const { data, error } = await supabase
    .from('nexus_scheduled_classes')
    .select(UPCOMING_CLASS_SELECT)
    .eq('classroom_id', classroomId)
    .gte('scheduled_date', today)
    .in('status', ['scheduled', 'live'])
    .order('scheduled_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(limit + 5);
  if (error) throw error;
  return dropEnded((data || []) as UpcomingClass[], today, nowHHMM).slice(0, limit);
}

/** Which of these classes the student has already said they will miss. */
export async function loadDeclinedClassIds(supabase: any, studentId: string, classIds: string[]): Promise<Set<string>> {
  if (classIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('nexus_class_rsvp')
    .select('scheduled_class_id, response')
    .eq('student_id', studentId)
    .in('scheduled_class_id', classIds);
  if (error) throw error;
  return new Set(((data || []) as Array<{ scheduled_class_id: string; response: string }>).filter((r) => r.response === 'not_attending').map((r) => r.scheduled_class_id));
}
