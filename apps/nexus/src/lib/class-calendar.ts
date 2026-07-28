/**
 * Putting a class on people's calendars.
 *
 * Shared by the meeting-create route and the repair action, because both have to
 * answer the same two questions and must answer them identically: who gets
 * invited, and what address do we invite them at.
 *
 * The address question is the one that bites. `users.email` is often still a
 * student's personal Gmail, which delivers an external ICS mail rather than an
 * entry in their Teams calendar, and some rows carry no email at all. So resolve
 * through pickClassroomEmail, which prefers the @neramclasses.com mailbox, and
 * hand back the names that could not be resolved instead of dropping them
 * silently. A teacher who is told "3 students have no email on file" can fix it.
 */
import { getSupabaseAdminClient } from '@neram/database';
import { pickClassroomEmail } from '@/lib/classroom-email';
import type { GraphAttendee } from '@/lib/class-attendees';

export interface ClassAttendeeResult {
  attendees: GraphAttendee[];
  /** Names of enrolled people with no usable email. Surfaced, never swallowed. */
  skipped: string[];
}

/** Pad a bare HH:MM to HH:MM:SS. Graph rejects the short form. */
export function ensureSeconds(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

/**
 * Fetch enrolled students AND teachers as calendar attendees.
 * Excludes the meeting creator, who is already the organizer.
 */
export async function resolveClassAttendees(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  classroomId: string,
  batchId: string | null,
  creatorEmail: string,
  extraAttendees: GraphAttendee[] = [],
): Promise<ClassAttendeeResult> {
  let query = supabase
    .from('nexus_enrollments')
    .select('user_id, role, users!nexus_enrollments_user_id_fkey!inner(email, name, linked_classroom_email)')
    .eq('classroom_id', classroomId)
    .eq('is_active', true);

  // Batch filtering only applies to students; teachers always get invited.
  if (batchId) {
    query = query.or(`batch_id.eq.${batchId},role.eq.teacher`);
  }

  const { data: enrollments } = await query;
  const rows = (enrollments || []) as Record<string, unknown>[];

  // The tenant mailbox lives on student_profiles, not users. One extra read for
  // the whole classroom, the same shape geo-students.ts and nudge-delivery use.
  const userIds = rows.map((e) => e.user_id as string).filter(Boolean);
  const msTeamsByUser = new Map<string, string | null>();
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('student_profiles')
      .select('user_id, ms_teams_email')
      .in('user_id', userIds);
    for (const p of (profiles || []) as Record<string, unknown>[]) {
      msTeamsByUser.set(p.user_id as string, (p.ms_teams_email as string) ?? null);
    }
  }

  const enrolled: GraphAttendee[] = [];
  const skipped: string[] = [];
  for (const e of rows) {
    const u = e.users as Record<string, unknown> | null;
    const name = (u?.name as string) || '';
    const { email } = pickClassroomEmail({
      ms_teams_email: msTeamsByUser.get(e.user_id as string) ?? null,
      linked_classroom_email: (u?.linked_classroom_email as string) ?? null,
      email: (u?.email as string) ?? null,
    });
    if (!email) {
      skipped.push(name || 'a student with no email on file');
      continue;
    }
    enrolled.push({
      emailAddress: { address: email, name: name || email },
      type: 'required',
    });
  }

  // Merge enrolled + extra (staff) attendees, drop the organizer, and de-dupe by
  // email. A 'required' entry wins over an 'optional' one for the same person.
  const byEmail = new Map<string, GraphAttendee>();
  for (const a of [...enrolled, ...extraAttendees]) {
    const key = a.emailAddress.address.toLowerCase();
    if (!key || key === creatorEmail?.toLowerCase()) continue;
    const existing = byEmail.get(key);
    if (!existing || (existing.type === 'optional' && a.type === 'required')) {
      byEmail.set(key, a);
    }
  }
  return { attendees: Array.from(byEmail.values()), skipped };
}

export interface CalendarEventClass {
  title?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
}

/**
 * Put an EXISTING Teams meeting on the organizer's calendar and invite everyone.
 *
 * Deliberately does not set `isOnlineMeeting: true`. That flag makes Graph mint a
 * brand new meeting and a brand new join link, which would orphan the link
 * already posted to the Teams channel, the group chat and any WhatsApp message.
 * Instead the existing join URL is carried in the body, so every link that has
 * already gone out keeps working.
 *
 * Returns the event id, or an empty string if Graph refused.
 */
export async function createCalendarEventForJoinUrl(
  token: string,
  cls: CalendarEventClass,
  joinUrl: string,
  attendees: GraphAttendee[],
): Promise<{ eventId: string; error?: string }> {
  const desc = cls.description?.trim();
  const payload = {
    subject: cls.title || 'Class',
    start: {
      dateTime: `${cls.scheduled_date}T${ensureSeconds(cls.start_time || '00:00')}`,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: `${cls.scheduled_date}T${ensureSeconds(cls.end_time || '00:00')}`,
      timeZone: 'Asia/Kolkata',
    },
    attendees,
    body: {
      contentType: 'HTML',
      content: `<p>You are invited to <strong>${cls.title || 'this class'}</strong>.</p>${
        desc ? `\n<p>${desc.replace(/\n/g, '<br/>')}</p>` : ''
      }
<p><a href="${joinUrl}">Join Microsoft Teams Meeting</a></p>`,
    },
  };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('Failed to create calendar event for existing meeting:', res.status, errText);
    return { eventId: '', error: `${res.status} ${errText}` };
  }

  const event = await res.json().catch(() => null);
  return { eventId: (event?.id as string) || '' };
}
