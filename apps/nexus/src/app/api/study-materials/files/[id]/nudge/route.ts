import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getFileById, sendEmail } from '@neram/database';
import { sendTeamsActivityNotification } from '@neram/auth';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * POST /api/study-materials/files/[id]/nudge  (staff)
 * Remind selected students about this study file. Delivery per recipient:
 *   1. A Microsoft Teams Activity-feed ping ("Neram Assistant") when configured and
 *      the student has a Microsoft identity (lands in the Teams Activity feed, not a
 *      chat, so it never clutters a real conversation).
 *   2. Always an in-app notification.
 *   3. An email backstop, only when the Teams ping did not land.
 * Body: { studentIds: string[], subject?: string, body: string }. Returns per-channel counts.
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = request.headers.get('Authorization');
    const user = await getRequestUser(auth);
    assertStaff(user);

    const body = await request.json();
    const studentIds: string[] = Array.isArray(body?.studentIds) ? body.studentIds.filter((x: any) => typeof x === 'string') : [];
    const text = String(body?.body || '').trim();
    if (studentIds.length === 0) return NextResponse.json({ error: 'No recipients selected' }, { status: 400 });
    if (!text) return NextResponse.json({ error: 'Message is empty' }, { status: 400 });

    const file = await getFileById(params.id);
    const subject = String(body?.subject || '').trim() || `About: ${file?.title || 'your study material'}`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">${escapeHtml(text).replace(/\n/g, '<br/>')}</div>`;

    const catalogAppId = process.env.TEAMS_APP_CATALOG_ID || null;

    const supabase = getSupabaseAdminClient() as any;
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

    const results = await Promise.all(
      studentIds.map(async (sid) => {
        const u = usersBy.get(sid);
        if (!u) {
          return { studentId: sid, name: null, teams: false, inapp: false, email: false, ok: false, channel: 'none' };
        }

        let teams = false;
        const teamsUserId = u.ms_oid || teamsBy.get(sid) || null;
        if (catalogAppId && teamsUserId) {
          // headline = the subject line, preview = the staff member's own message.
          const r = await sendTeamsActivityNotification(teamsUserId, {
            text: subject,
            preview: text,
            catalogAppId,
          });
          teams = r.ok;
        }

        let inapp = false;
        try {
          const { error } = await supabase.from('user_notifications').insert({
            user_id: sid,
            event_type: 'study_material_nudge',
            title: subject,
            message: text,
            metadata: { file_id: params.id },
            is_read: false,
          });
          if (error) console.error('study_material_nudge notification insert failed:', error.message);
          else inapp = true;
        } catch (e) {
          console.error('study_material_nudge notification insert threw:', e);
        }

        let email = false;
        if (!teams && u.email) {
          const r = await sendEmail({ to: u.email, subject, html }).catch(() => ({ success: false }));
          email = !!r.success;
        }

        const parts = [teams ? 'teams' : '', inapp ? 'inapp' : '', email ? 'email' : ''].filter(Boolean);
        return {
          studentId: sid,
          name: u.name,
          teams,
          inapp,
          email,
          ok: parts.length > 0,
          channel: parts.length ? parts.join('+') : 'failed',
        };
      }),
    );

    const counts = {
      total: results.length,
      teams: results.filter((r) => r.teams).length,
      inapp: results.filter((r) => r.inapp).length,
      email: results.filter((r) => r.email).length,
      failed: results.filter((r) => !r.ok).length,
    };
    return NextResponse.json({ results, counts, viaTeams: counts.teams });
  } catch (err) {
    return errorResponse(err, 'Failed to send message');
  }
}
