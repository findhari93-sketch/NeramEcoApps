/**
 * POST /api/r/track  { token, event: 'google_click' | 'google_posted' | 'secondary_click' }
 *
 * What the student did after submitting, so staff can see who reached Google.
 * Best effort: the page never waits on it.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { recordReviewRequestEvent, type ReviewRequestEvent } from '@neram/database/queries';
import { NO_STORE, jsonError, requestForToken } from '@/lib/review-request-server';

const EVENTS: ReviewRequestEvent[] = ['google_click', 'google_posted', 'secondary_click'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!EVENTS.includes(body?.event)) return jsonError(400, 'BAD_REQUEST', 'Unknown event.');
    const supabase = createAdminClient();
    const found = await requestForToken(body.token, supabase);
    if ('response' in found) return found.response;
    if (!found.request.submitted_at) return jsonError(409, 'NOT_SUBMITTED', 'Send your review first.');
    await recordReviewRequestEvent(found.request, body.event, supabase);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error: any) {
    console.error('[r/track]', error?.message || error);
    return jsonError(500, 'ERROR', 'Could not record that.');
  }
}
