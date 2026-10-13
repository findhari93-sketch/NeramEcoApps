/**
 * POST /api/r/submit
 *
 * The student's rating and review. The first submit creates a learner testimonial
 * (held hidden by the database trigger); later submits through the same link edit
 * it until staff moderate it, after which the link is locked.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getReviewRequestByToken, submitReviewFromRequest } from '@neram/database/queries';
import { NO_STORE, buildReviewView, jsonError, requestForToken } from '@/lib/review-request-server';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Please try again.');
  }

  try {
    const supabase = createAdminClient();
    const found = await requestForToken(body.token, supabase);
    if ('response' in found) return found.response;

    const result = await submitReviewFromRequest(
      found.request,
      {
        text: typeof body.text === 'string' ? body.text : '',
        rating: Number(body.rating),
        displayName: typeof body.displayName === 'string' ? body.displayName : '',
        consentToPublish: body.consentToPublish === true,
        photoConsent: body.photoConsent === true,
        isMinor: body.isMinor === true,
        guardianConsent: body.guardianConsent === true,
        inputMode: body.inputMode === 'voice' ? 'voice' : 'typed',
        voiceTranscript: typeof body.voiceTranscript === 'string' ? body.voiceTranscript : null,
        corrections: body.corrections,
      },
      supabase,
    );

    if (!result.ok) {
      if (result.refusal === 'locked') {
        return jsonError(409, 'LOCKED', 'Neram Classes has already reviewed this. To change it, please message us on WhatsApp.');
      }
      if (result.refusal === 'no_consent') {
        return jsonError(400, 'NO_CONSENT', 'Please tick the box to let us show your review.');
      }
      return jsonError(400, 'INVALID', 'Please check the highlighted fields.', { fieldErrors: result.errors });
    }

    // Read the row again so the page shows exactly what was saved.
    const fresh = await getReviewRequestByToken(String(body.token), supabase);
    const view = 'request' in fresh ? await buildReviewView(fresh.request, supabase) : null;
    return NextResponse.json({ ok: true, updated: result.updated, view }, { headers: NO_STORE });
  } catch (error: any) {
    console.error('[r/submit]', error?.message || error);
    return jsonError(500, 'ERROR', 'We could not save your review. Please try again.');
  }
}
