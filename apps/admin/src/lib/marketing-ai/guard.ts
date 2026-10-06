import { NextResponse } from 'next/server';
import { ADMIN_TYPE_HEADER } from '@/lib/admin-api-auth';
import { getRequestAdminId } from '@/lib/request-admin';

/**
 * Marketing Intelligence is admin only. The middleware lets every staff member
 * (admin and teacher) through to /api; this narrows it to user_type 'admin'.
 *
 * Fails closed: with no verified caller (an exempt path, or the middleware in
 * `report` mode) the request is refused rather than trusted. Ad spend and the
 * power to change campaigns are not something to leave open during a rollback.
 */
export function requireAdminRole(request: Request): { ok: true; adminId: string } | { ok: false; response: NextResponse } {
  const adminId = getRequestAdminId(request);
  const type = request.headers.get(ADMIN_TYPE_HEADER);
  if (!adminId || type !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Marketing Intelligence is available to admins only.' }, { status: 403 }),
    };
  }
  return { ok: true, adminId };
}

/** Same check as the identity-sweep cron: a missing CRON_SECRET refuses the call. */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Vercel runs crons on production only. Until the real account is connected
 * (GOOGLE_ADS_MODE=live), production stays quiet instead of filling its tables
 * with the sample account every morning. Manual runs from the app still work.
 */
export function cronIdleReason(env: Record<string, string | undefined> = process.env): string | null {
  if (env.VERCEL_ENV === 'production' && env.GOOGLE_ADS_MODE !== 'live') return 'GOOGLE_ADS_MODE is not live on production';
  return null;
}

/** The cron preamble: 401 without the secret, a skipped 200 while idle, else null to go on. */
export function cronGate(request: Request): NextResponse | null {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const idle = cronIdleReason();
  return idle ? NextResponse.json({ success: true, skipped: idle }) : null;
}
