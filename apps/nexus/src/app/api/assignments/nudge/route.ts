import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, sendEmail } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { extractBearerToken } from '@/lib/ms-verify';
import { sendTeamsChatMessage } from '@/lib/teams-messaging';

/**
 * POST /api/assignments/nudge  (staff)
 * Message selected students about one or more assignments. Tries a Teams DM
 * (delegated teacher token); on any failure falls back per-recipient to an
 * in-app notification + a Resend email. The selected assignment links are
 * appended to the message so students can jump straight to the work.
 *
 * Body: { studentIds: string[], assignmentIds?: string[], subject?: string, body: string }
 * Returns per-recipient delivery + how many went via Teams.
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('Authorization');
    const user = await getRequestUser(auth);
    assertStaff(user);
    const authToken = extractBearerToken(auth);

    const body = await request.json();
    const studentIds: string[] = Array.isArray(body?.studentIds)
      ? body.studentIds.filter((x: any) => typeof x === 'string')
      : [];
    const assignmentIds: string[] = Array.isArray(body?.assignmentIds)
      ? body.assignmentIds.filter((x: any) => typeof x === 'string')
      : [];
    const text = String(body?.body || '').trim();
    if (studentIds.length === 0) return NextResponse.json({ error: 'No recipients selected' }, { status: 400 });
    if (!text) return NextResponse.json({ error: 'Message is empty' }, { status: 400 });

    const supabase = getSupabaseAdminClient() as any;

    // Resolve assignment titles for the link section (absolute URLs for Teams).
    const origin = new URL(request.url).origin;
    let linksHtml = '';
    let linksText = '';
    if (assignmentIds.length) {
      const { data: assns } = await supabase
        .from('nexus_class_assignments')
        .select('id, title')
        .in('id', assignmentIds);
      const rows = (assns || []) as { id: string; title: string }[];
      if (rows.length) {
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
    const html =
      `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">${escapeHtml(text).replace(/\n/g, '<br/>')}</div>` +
      linksHtml;
    const plain = text + linksText;

    const [{ data: users }, { data: profiles }] = await Promise.all([
      supabase.from('users').select('id, name, email').in('id', studentIds),
      supabase.from('student_profiles').select('user_id, ms_teams_email').in('user_id', studentIds),
    ]);
    const usersBy = new Map<string, { id: string; name: string | null; email: string | null }>(
      (users || []).map((u: any) => [u.id, u]),
    );
    const teamsBy = new Map<string, string | null>(
      (profiles || []).map((p: any) => [p.user_id, p.ms_teams_email]),
    );

    const results: { studentId: string; name: string | null; channel: string; ok: boolean }[] = [];
    for (const sid of studentIds) {
      const u = usersBy.get(sid);
      if (!u) {
        results.push({ studentId: sid, name: null, channel: 'none', ok: false });
        continue;
      }
      const upn = teamsBy.get(sid);
      let channel = '';
      let ok = false;

      if (upn && authToken) {
        const sent = await sendTeamsChatMessage(authToken, upn, html);
        if (sent) {
          ok = true;
          channel = 'teams';
        }
      }

      if (!ok) {
        try {
          await supabase.from('user_notifications').insert({
            user_id: sid,
            event_type: 'assignment_nudge',
            title: subject,
            message: plain,
            metadata: { assignment_ids: assignmentIds },
            is_read: false,
          });
        } catch {
          /* table may be unavailable; email is still attempted */
        }
        let emailed = false;
        if (u.email) {
          const r = await sendEmail({ to: u.email, subject, html }).catch(() => ({ success: false }));
          emailed = !!r.success;
        }
        ok = true;
        channel = emailed ? 'inapp+email' : 'inapp';
      }

      results.push({ studentId: sid, name: u.name, channel, ok });
    }

    const viaTeams = results.filter((r) => r.channel === 'teams').length;
    return NextResponse.json({ results, viaTeams });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send message';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
