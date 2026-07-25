import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, recordAssignmentReminder } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { sendNudge, escapeHtml, plainToHtml } from '@/lib/nudge-delivery';

/**
 * POST /api/assignments/nudge  (staff)
 * Remind selected students about one or more assignments. The three-tier
 * delivery (Teams activity feed, in-app bell, email backstop) lives in
 * @/lib/nudge-delivery and is shared with the photo-review queue and the
 * inactivity watchlist. This route's job is the assignment-specific part:
 * resolving titles into links, and logging one nexus_assignment_reminders row
 * per (assignment, student) so any staff member can see who was already
 * reminded, when, and by whom (no double-nagging).
 *
 * Body: { studentIds: string[], assignmentIds?: string[], subject?: string, body: string, template?: string }
 * Returns per-recipient delivery + per-channel counts.
 */

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('Authorization');
    const user = await getRequestUser(auth);
    assertStaff(user);

    const body = await request.json();
    const studentIds: string[] = Array.isArray(body?.studentIds)
      ? body.studentIds.filter((x: any) => typeof x === 'string')
      : [];
    const assignmentIds: string[] = Array.isArray(body?.assignmentIds)
      ? body.assignmentIds.filter((x: any) => typeof x === 'string')
      : [];
    const template = typeof body?.template === 'string' ? body.template : null;
    const text = String(body?.body || '').trim();
    if (studentIds.length === 0) return NextResponse.json({ error: 'No recipients selected' }, { status: 400 });
    if (!text) return NextResponse.json({ error: 'Message is empty' }, { status: 400 });

    const supabase = getSupabaseAdminClient() as any;
    const origin = new URL(request.url).origin;

    // Resolve assignment titles for the email link section and the Teams ping text.
    let linksHtml = '';
    let linksText = '';
    let primaryTitle = 'your assignments';
    if (assignmentIds.length) {
      const { data: assns } = await supabase
        .from('nexus_class_assignments')
        .select('id, title')
        .in('id', assignmentIds);
      const rows = (assns || []) as { id: string; title: string }[];
      if (rows.length) {
        primaryTitle = rows.length === 1 ? rows[0].title : `${rows.length} assignments`;
        linksHtml =
          '<div style="margin-top:12px"><strong>Assignment' +
          (rows.length > 1 ? 's' : '') +
          ':</strong><ul style="margin:6px 0 0;padding-left:18px">' +
          rows
            .map(
              (r) =>
                `<li><a href="${origin}/student/assignments/${r.id}">${escapeHtml(r.title)}</a></li>`,
            )
            .join('') +
          '</ul></div>';
        linksText =
          '\n\n' + rows.map((r) => `- ${r.title}: ${origin}/student/assignments/${r.id}`).join('\n');
      }
    }

    const subject = String(body?.subject || '').trim() || 'About your assignments';
    // Concise line for the Teams activity feed (bell). Names the assignment when known.
    const teamsText = assignmentIds.length ? `${subject}: ${primaryTitle}` : subject;

    const { results, counts } = await sendNudge({
      studentIds,
      subject,
      plain: text + linksText,
      html: plainToHtml(text) + linksHtml,
      teamsText,
      eventType: 'assignment_nudge',
      metadata: { assignment_ids: assignmentIds },
    });

    // Log one reminder row per (assignment, student) so staff see prior nudges.
    await Promise.all(
      results.flatMap((r) =>
        assignmentIds.map((aid) =>
          recordAssignmentReminder({
            assignment_id: aid,
            student_id: r.studentId,
            sent_by: user.id,
            channel: r.channel,
            template,
          }),
        ),
      ),
    );

    // viaTeams kept for backward compatibility with older clients.
    return NextResponse.json({ results, counts, viaTeams: counts.teams });
  } catch (err) {
    return errorResponse(err, 'Failed to send message');
  }
}
