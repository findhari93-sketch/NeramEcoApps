/**
 * GET /api/s/validate?token=...
 *
 * Public. No authentication, by design: the student we are asking has no account
 * they can sign into, which is the whole reason this link exists.
 *
 * Stays on the Node runtime rather than edge. It has the shape the cost policy wants
 * from an edge route (one indexed lookup), but createAdminClient is a Node client
 * and moving it would mean changing a shared package, which rebuilds all four apps.
 * Not worth it for a route a few dozen students will ever call.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import {
  getDetailRequestByToken,
  markDetailRequestOpened,
} from '@neram/database/queries';
import { publicDetailRequestView } from '@/lib/detail-request-view';

/** A token response must never sit in a CDN or a browser cache. */
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };

const REFUSAL_STATUS = {
  not_found: 404,
  expired: 410,
  cancelled: 410,
} as const;

const REFUSAL_MESSAGE = {
  not_found: 'This link is not valid. Please ask your teacher for a new one.',
  expired: 'This link has expired. Please ask your teacher for a new one.',
  cancelled: 'This link is no longer in use. Please ask your teacher for a new one.',
} as const;

export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get('token') || '';

    const supabase = createAdminClient();
    const found = await getDetailRequestByToken(token, supabase);

    if ('refusal' in found) {
      return NextResponse.json(
        { code: found.refusal.toUpperCase(), error: REFUSAL_MESSAGE[found.refusal] },
        { status: REFUSAL_STATUS[found.refusal], headers: NO_STORE },
      );
    }

    const { request: detailRequest } = found;

    const { data: user } = await supabase
      .from('users')
      .select('first_name, name, email')
      .eq('id', detailRequest.user_id)
      .maybeSingle();

    if (!user) {
      // The student's record has gone since the link was made. Say the same thing as
      // an unknown token: a stranger holding the link learns nothing either way.
      return NextResponse.json(
        { code: 'NOT_FOUND', error: REFUSAL_MESSAGE.not_found },
        { status: 404, headers: NO_STORE },
      );
    }

    // Counting the visit must never be the reason a student cannot open their form,
    // so this swallows its own errors.
    await markDetailRequestOpened(detailRequest, supabase);

    return NextResponse.json(
      {
        ok: true,
        // Exactly three keys. See the note in lib/detail-request-view.ts.
        ...publicDetailRequestView(user, detailRequest),
        alreadyAnswered: Boolean(detailRequest.answered_at),
      },
      { headers: NO_STORE },
    );
  } catch (error: any) {
    console.error('[s/validate]', error?.message || error);
    return NextResponse.json(
      { code: 'ERROR', error: 'Something went wrong. Please try again.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
