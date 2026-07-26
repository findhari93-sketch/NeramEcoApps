import { NextResponse } from 'next/server';

/**
 * Guard a cron route.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations
 * once the env var is set on the project. The check is deliberately conditional
 * on the secret existing, which is the pattern already used by
 * `api/cron/auto-close-issues`: adding this guard to a route is then a no-op
 * until the secret is configured, so it cannot break a working cron on deploy.
 *
 * Returns a 401 response when the call is not authorized, or null to proceed.
 */
export function assertCronRequest(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return null;

  if (request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
