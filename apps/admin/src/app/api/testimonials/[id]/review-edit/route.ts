export const dynamic = 'force-dynamic';

/**
 * PATCH /api/testimonials/[id]/review-edit  { text?, rating?, displayName?, photoUrl?, collegeAdmitted?, rank?, percentile?, year?, city? }
 *
 * Staff have full control over what our site shows. The student's own words stay
 * in original_text and are never touched, so there is always a record of what they
 * actually said next to what was published. Edits change our site only: a
 * student's Google review is always in their own words.
 *
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { staffEditTestimonial, type StaffTestimonialEdit } from '@neram/database/queries';
import { getRequestAdminId } from '@/lib/request-admin';
import { revalidateMarketing, TESTIMONIAL_TAGS } from '@/lib/marketing-revalidate';

const numOrNull = (v: unknown) => (v === null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : undefined);

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  const edit: StaffTestimonialEdit = {};
  if (typeof body.text === 'string') edit.text = body.text;
  if (body.rating !== undefined) edit.rating = Number(body.rating);
  if (typeof body.displayName === 'string') edit.displayName = body.displayName;
  if (body.photoUrl !== undefined) edit.photoUrl = typeof body.photoUrl === 'string' ? body.photoUrl : null;
  if (body.collegeAdmitted !== undefined) edit.collegeAdmitted = body.collegeAdmitted;
  if (body.rank !== undefined) edit.rank = numOrNull(body.rank) ?? null;
  if (body.percentile !== undefined) edit.percentile = numOrNull(body.percentile) ?? null;
  if (body.year !== undefined && Number.isInteger(Number(body.year))) edit.year = Number(body.year);
  if (typeof body.city === 'string') edit.city = body.city;

  try {
    await staffEditTestimonial(params.id, edit, adminId, getSupabaseAdminClient() as any);
    // A published review changes on the site at once (bounded wait, never fails the save).
    await revalidateMarketing(TESTIMONIAL_TAGS, { adminOrigin: request.nextUrl.origin });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.status) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[testimonials] review-edit', error?.message || error);
    return NextResponse.json({ error: 'Could not save the review.' }, { status: 500 });
  }
}
