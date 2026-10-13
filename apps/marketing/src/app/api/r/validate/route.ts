/**
 * GET /api/r/validate?token=...
 *
 * Public. No sign-in by design: the past student we are asking has no account to
 * sign into, which is why the link exists. The token is the only key, checked
 * here against the row (see review-requests.ts), never by RLS.
 *
 * Node runtime: createAdminClient is a Node client. A few hundred students a
 * year will ever call this, so the cost policy is not at stake.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { markReviewRequestOpened } from '@neram/database/queries';
import { NO_STORE, buildReviewView, jsonError, requestForToken } from '@/lib/review-request-server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const found = await requestForToken(new URL(request.url).searchParams.get('token'), supabase);
    if ('response' in found) return found.response;

    // Counting the visit must never be the reason a student cannot open the page.
    await markReviewRequestOpened(found.request, supabase);
    const view = await buildReviewView(found.request, supabase);
    return NextResponse.json({ ok: true, ...view }, { headers: NO_STORE });
  } catch (error: any) {
    console.error('[r/validate]', error?.message || error);
    return jsonError(500, 'ERROR', 'Something went wrong. Please try again.');
  }
}
