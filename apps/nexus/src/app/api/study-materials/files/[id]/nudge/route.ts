import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getFileById, sendEmail } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { extractBearerToken } from '@/lib/ms-verify';
import { sendTeamsChatMessage } from '@/lib/teams-messaging';

/**
 * POST /api/study-materials/files/[id]/nudge  (staff)
 * Send a message to selected students about this study file. Tries a Teams DM (delegated teacher
 * token); on any failure falls back per-recipient to an in-app notification + a Resend email.
 * Body: { studentIds: string[], subject?: string, body: string }. Returns per-recipient delivery.
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = request.headers.get('Authorization');
    const user = await getRequestUser(auth);
    assertStaff(user);
    const authToken = extractBearerToken(auth);

    const body = await request.json();
    const studentIds: string[] = Array.isArray(body?.studentIds) ? body.studentIds.filter((x: any) => typeof x === 'string') : [];
    const text = String(body?.body || '').trim();
    if (studentIds.length === 0) return NextResponse.json({ error: 'No recipients selected' }, { status: 400 });
    if (!text) return NextResponse.json({ error: 'Message is empty' }, { status: 400 });

    const file = await getFileById(params.id);
    const subject = String(body?.subject || '').trim() || `About: ${file?.title || 'your study material'}`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">${escapeHtml(text).replace(/\n/g, '<br/>')}</div>`;

    const supabase = getSupabaseAdminClient() as any;
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
        // Fallback: always record an in-app notification, plus email when we have an address.
        try {
          await supabase.from('user_notifications').insert({
            user_id: sid,
            event_type: 'study_material_nudge',
            title: subject,
            message: text,
            metadata: { file_id: params.id },
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
