/**
 * Server helpers shared by the /api/r/* routes behind the review link.
 *
 * One place for the refusal sentences, the no-store headers and the view build,
 * so validate, submit, compose and track all answer the same way.
 */
import { NextResponse } from 'next/server';
import type { ReviewRequest } from '@neram/database';
import {
  MAX_AI_CALLS_PER_REQUEST,
  getReviewRequestByToken,
  loadReviewTargets,
  type ReviewRequestRefusal,
} from '@neram/database/queries';
import { publicReviewView, type PublicReviewView } from './review-request-view';

/** The service-role client, typed the way the shared queries take it. */
type SupabaseClient = Parameters<typeof getReviewRequestByToken>[1];

/** A token response must never sit in a CDN or a browser cache. */
export const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };

const REFUSAL_STATUS: Record<ReviewRequestRefusal, number> = { not_found: 404, expired: 410, cancelled: 410 };

const REFUSAL_MESSAGE: Record<ReviewRequestRefusal, string> = {
  not_found: 'This link is not valid. Please ask Neram Classes for a new one.',
  expired: 'This link has expired. Please ask Neram Classes for a new one.',
  cancelled: 'This link is no longer in use. Please ask Neram Classes for a new one.',
};

export function jsonError(status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ code, error, ...extra }, { status, headers: NO_STORE });
}

/** The live request for a token, or the response that explains why not. */
export async function requestForToken(
  token: unknown,
  supabase: SupabaseClient,
): Promise<{ request: ReviewRequest } | { response: NextResponse }> {
  const found = await getReviewRequestByToken(typeof token === 'string' ? token : '', supabase);
  if ('refusal' in found) {
    return { response: jsonError(REFUSAL_STATUS[found.refusal], found.refusal.toUpperCase(), REFUSAL_MESSAGE[found.refusal]) };
  }
  return { request: found.request };
}

/** Everything the page needs, in the shape pinned by PUBLIC_REVIEW_VIEW_KEYS. */
export async function buildReviewView(request: ReviewRequest, supabase: SupabaseClient): Promise<PublicReviewView> {
  const [targets, centre, testimonial] = await Promise.all([
    loadReviewTargets(request, supabase),
    request.center_id
      ? supabase.from('offline_centers').select('name, city').eq('id', request.center_id).maybeSingle()
      : Promise.resolve({ data: null }),
    request.testimonial_id
      ? supabase
          .from('testimonials')
          .select('content, rating, consent_display_name, student_name, publication_status, original_text')
          .eq('id', request.testimonial_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const centreRow = (centre as { data: { name: string; city: string | null } | null }).data;
  return publicReviewView({
    request,
    centreName: centreRow ? centreRow.city || centreRow.name : null,
    testimonial: (testimonial as { data: any }).data ?? null,
    targets: {
      google: targets.google ? { url: targets.google.url, centreName: targets.google.centerName } : null,
      secondary: targets.secondary,
    },
    maxAiCalls: MAX_AI_CALLS_PER_REQUEST,
  });
}
