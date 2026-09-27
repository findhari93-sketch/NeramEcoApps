import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_ID_HEADER,
  ADMIN_TYPE_HEADER,
  AdminCallerCache,
  isExemptApiPath,
  resolveAdminCaller,
} from '@/lib/admin-api-auth';

/**
 * Every admin API request must come from a signed-in staff member.
 *
 * The verified `users.id` is forwarded to the route as `x-neram-admin-id`. Any
 * value the client sent under that name is removed first, so a route can trust
 * the header and must never trust `adminId` from the body.
 *
 * ADMIN_API_AUTH_MODE:
 *   enforce (default)  refuse with 401 or 403
 *   report             let the request through and log the refusal (rollback lever)
 */

const cache = new AdminCallerCache();

function forward(request: NextRequest, caller?: { userId: string; userType: string }) {
  const headers = new Headers(request.headers);
  headers.delete(ADMIN_ID_HEADER);
  headers.delete(ADMIN_TYPE_HEADER);
  if (caller) {
    headers.set(ADMIN_ID_HEADER, caller.userId);
    headers.set(ADMIN_TYPE_HEADER, caller.userType);
  }
  return NextResponse.next({ request: { headers } });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.method === 'OPTIONS' || isExemptApiPath(pathname)) {
    return forward(request);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Admin API is not configured.' }, { status: 500 });
  }

  const caller = await resolveAdminCaller(request.headers.get('authorization'), {
    fetch,
    supabaseUrl,
    serviceKey,
    allowTestTokens: process.env.NODE_ENV !== 'production',
    cache,
  });

  if (caller.ok) return forward(request, caller);

  if (process.env.ADMIN_API_AUTH_MODE === 'report') {
    console.warn(`[admin-api-auth] would refuse ${request.method} ${pathname}: ${caller.status}`);
    return forward(request);
  }

  return NextResponse.json({ error: caller.error }, { status: caller.status });
}

export const config = {
  matcher: '/api/:path*',
};
