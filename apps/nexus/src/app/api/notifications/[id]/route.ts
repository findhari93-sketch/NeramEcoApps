import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { httpStatusForError } from '@/lib/api-errors';
import { notificationHref } from '@/lib/notification-links';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getSupabaseAdminClient, markUserNotificationRead } from '@neram/database';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/notifications/:id
 *
 * One of the caller's own notifications, with the Nexus page it points at. This
 * is what the Neram Assistant's Teams tab shows when someone clicks an Activity
 * item: the deep link carries the notification id, and the tab cannot open the
 * Nexus page itself (Nexus refuses to be framed), so it shows the notification
 * in full with an "Open in Nexus" button to `href`.
 *
 * Auth: a Microsoft token, including the Teams tab's SSO token (ms-verify.ts
 * validates those through teams-sso.ts). Someone else's notification answers
 * 404, exactly like one that does not exist, so ids cannot be probed. Opening
 * it marks it read, the same as tapping it in the bell.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const id = String(params.id || '');
    if (!UUID.test(id)) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

    const supabase = getSupabaseAdminClient() as any;
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, user_type, staff_role')
      .eq('ms_oid', msUser.oid)
      .single();
    if (userError && userError.code !== 'PGRST116') {
      throw new Error(`users lookup failed: ${userError.code ?? ''} ${userError.message}`);
    }
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: row, error } = await supabase
      .from('user_notifications')
      .select('id, event_type, title, message, metadata, is_read, created_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new Error(`notification read failed: ${error.code ?? ''} ${error.message}`);
    if (!row) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

    // The same coarse role the bell routes with (api/auth/me's nexusRole).
    const staffRole = resolveStaffRole(user);
    const nexusRole = staffRole === 'admin' ? 'admin' : staffRole ? 'teacher' : 'student';

    if (!row.is_read) {
      // Best effort: failing to mark it read must not hide the notification.
      await markUserNotificationRead(row.id, user.id, supabase).catch((e: unknown) =>
        console.error('Notification mark-read failed:', e),
      );
    }

    const metadata = (row.metadata || {}) as Record<string, unknown>;
    return NextResponse.json(
      {
        id: row.id,
        event_type: row.event_type,
        title: row.title,
        message: row.message,
        created_at: row.created_at,
        items: Array.isArray(metadata.items) ? metadata.items : [],
        more: Number(metadata.more) || 0,
        href: notificationHref(row, nexusRole),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    console.error('Notification GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch notification' }, { status: httpStatusForError(err) });
  }
}
