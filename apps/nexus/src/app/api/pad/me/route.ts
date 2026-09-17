import { NextRequest } from 'next/server';
import { resolvePadCaller } from '@/lib/pad/caller';
import { padErrorResponse, padJson } from '@/lib/pad/rpc';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pad/me
 *
 * Which Answer Pad screen this person gets: the teacher console or the student
 * pad. The Teams side panel is one URL for everyone, so it asks here first.
 * 404 while the Answer Pad is switched off for their surface, like every other
 * pad route.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    return padJson({ role: caller.role, name: caller.user.name ?? null });
  } catch (err) {
    return padErrorResponse(err, 'me');
  }
}
