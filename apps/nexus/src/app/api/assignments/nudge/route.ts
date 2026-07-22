import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, sendEmail, recordAssignmentReminder } from '@neram/database';
import { sendTeamsActivityNotification } from '@neram/auth';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * POST /api/assignments/nudge  (staff)
 * Remind selected students about one or more assignments. Delivery per recipient:
 *   1. A Microsoft Teams Activity-feed ping ("Neram Assistant") when configured and
 *      the student has a Microsoft identity. This lands in the Teams Activity feed
 *      (the bell), NOT in a 1:1 chat, so templated reminders never clutter a real
 *      conversation.
 *   2. Always an in-app notification (the persistent record + the in-Nexus bell).
 *   3. An email backstop, only when the Teams ping did not land (so Teams-reachable
 *      students are not double-messaged; and it is the sole external channel until
 *      the Teams bot admin setup is done).
 * Every send is logged to nexus_assignment_reminders so any staff member can see
 * who was already reminded, when, and by whom (no double-nagging).
 *
 * Body: { studentIds: string[], assignmentIds?: string[], subject?: string, body: string, template?: string }
 * Returns per-recipient delivery + per-channel counts.
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

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
    // The "Neram Assistant" Teams app catalog id. When unset the Teams tier is
    // skipped and delivery is in-app + email (Part A behaviour), which lets the
    // reminder feature work before the one-time Teams admin setup is complete.
    const catalogAppId = process.env.TEAMS_APP_CATALOG_ID || null;

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
    const html =
      `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">${escapeHtml(text).replace(/\n/g, '<br/>')}</div>` +
      linksHtml;
    const plain = text + linksText;

    const [{ data: users }, { data: profiles }] = await Promise.all([
      supabase.from('users').select('id, name, email, ms_oid').in('id', studentIds),
      supabase.from('student_profiles').select('user_id, ms_teams_email').in('user_id', studentIds),
    ]);
    const usersBy = new Map<string, { id: string; name: string | null; email: string | null; ms_oid: string | null }>(
      (users || []).map((u: any) => [u.id, u]),
    );
    const teamsBy = new Map<string, string | null>(
      (profiles || []).map((p: any) => [p.user_id, p.ms_teams_email]),
    );

    // Process recipients in parallel to stay within the serverless time budget.
    const results = await Promise.all(
      studentIds.map(async (sid) => {
        const u = usersBy.get(sid);
        if (!u) {
          return { studentId: sid, name: null, teams: false, inapp: false, email: false, ok: false, channel: 'none' };
        }

        // 1) Teams Activity-feed ping (clean channel). ms_oid is preferred; the UPN
        //    (ms_teams_email) is a fallback identifier when the oid is missing.
        let teams = false;
        const teamsUserId = u.ms_oid || teamsBy.get(sid) || null;
        if (catalogAppId && teamsUserId) {
          const r = await sendTeamsActivityNotification(teamsUserId, { text: teamsText, catalogAppId });
          teams = r.ok;
        }

        // 2) Always record the in-app notification (persistent record + Nexus bell).
        let inapp = false;
        try {
          const { error } = await supabase.from('user_notifications').insert({
            user_id: sid,
            event_type: 'assignment_nudge',
            title: subject,
            message: plain,
            metadata: { assignment_ids: assignmentIds },
            is_read: false,
          });
          if (error) console.error('assignment_nudge notification insert failed:', error.message);
          else inapp = true;
        } catch (e) {
          console.error('assignment_nudge notification insert threw:', e);
        }

        // 3) Email backstop, only when the Teams ping did not land.
        let email = false;
        if (!teams && u.email) {
          const r = await sendEmail({ to: u.email, subject, html }).catch(() => ({ success: false }));
          email = !!r.success;
        }

        const parts = [teams ? 'teams' : '', inapp ? 'inapp' : '', email ? 'email' : ''].filter(Boolean);
        const channel = parts.length ? parts.join('+') : 'failed';
        const ok = parts.length > 0;

        // Log one reminder row per (assignment, student) so staff see prior nudges.
        for (const aid of assignmentIds) {
          await recordAssignmentReminder({
            assignment_id: aid,
            student_id: sid,
            sent_by: user.id,
            channel,
            template,
          });
        }

        return { studentId: sid, name: u.name, teams, inapp, email, ok, channel };
      }),
    );

    const counts = {
      total: results.length,
      teams: results.filter((r) => r.teams).length,
      inapp: results.filter((r) => r.inapp).length,
      email: results.filter((r) => r.email).length,
      failed: results.filter((r) => !r.ok).length,
    };
    // viaTeams kept for backward compatibility with older clients.
    return NextResponse.json({ results, counts, viaTeams: counts.teams });
  } catch (err) {
    return errorResponse(err, 'Failed to send message');
  }
}
