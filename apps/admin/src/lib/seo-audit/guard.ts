import { NextResponse } from 'next/server';
import { ADMIN_TYPE_HEADER } from '@/lib/admin-api-auth';
import { getRequestAdminId } from '@/lib/request-admin';

/**
 * SEO Health is admin only, like Marketing Intelligence. Fails closed: with no
 * verified caller the request is refused rather than trusted.
 */
export function requireSeoAdmin(request: Request): { ok: true; adminId: string } | { ok: false; response: NextResponse } {
  const adminId = getRequestAdminId(request);
  if (!adminId || request.headers.get(ADMIN_TYPE_HEADER) !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'SEO Health is available to admins only.' }, { status: 403 }) };
  }
  return { ok: true, adminId };
}

export function seoError(err: unknown, label: string) {
  const message = err instanceof Error ? err.message : 'unknown error';
  console.error(`[seo-audit] ${label}:`, message);
  return NextResponse.json({ error: message }, { status: 500 });
}
