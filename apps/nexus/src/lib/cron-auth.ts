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
 *
 * `{ required: true }` refuses to run at all without the secret, instead of
 * waving the call through. Opt in for any route where an unauthenticated press
 * spends real money: the YouTube backup burns 1600 quota units of a 10,000 daily
 * allowance per video, so an open endpoint is six requests away from costing a
 * day of uploads. Everywhere else the permissive default still applies, so
 * adding this guard to a route stays a no-op until the secret is configured.
 */
export function assertCronRequest(
  request: Request,
  opts?: { required?: boolean },
): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return opts?.required
      ? NextResponse.json(
          { error: 'CRON_SECRET is not configured, so this route refuses to run.' },
          { status: 503 },
        )
      : null;
  }

  if (request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
