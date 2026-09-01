import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * Replace one or more of a submission's image URLs in place.
 *
 * This exists so a teacher can bake a rotation into a sideways submission
 * without touching the review. It is deliberately NOT folded into the review
 * PATCH next door: that route's `draft` branch writes `|| null` across its
 * whole field set, so a rotate-only call through it would wipe an in-progress
 * review. Rotation also has to persist immediately, whether or not the teacher
 * has started grading.
 *
 * Only the keys actually present in the body are written, so a rotation of the
 * reference image can never disturb the original, and vice versa.
 */

const IMAGE_FIELDS = ['original_image_url', 'reviewed_image_url', 'corrected_image_url'] as const;
type ImageField = (typeof IMAGE_FIELDS)[number];

function isStorageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    for (const field of IMAGE_FIELDS) {
      const value = (body as Record<string, unknown>)[field];
      if (value === undefined) continue;
      if (!isStorageUrl(value)) {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
      updates[field] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No image fields to update' }, { status: 400 });
    }

    // Region annotations are percentages of the viewer box, so a quarter turn
    // invalidates them. The client asks for the clear only after the teacher
    // has confirmed losing them.
    if (body.clear_annotations === true) {
      updates.ai_overlay_annotations = null;
    }

    const { data: updated, error } = await (supabase.from('drawing_submissions' as any) as any)
      .update(updates)
      .eq('id', id)
      .select('id, original_image_url, reviewed_image_url, corrected_image_url, ai_overlay_annotations')
      .single();

    if (error) throw error;
    if (!updated) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // The superseded files are left in the bucket on purpose: earlier attempts
    // in the history timeline may still point at them, and the storage cost of
    // an orphaned JPEG is negligible next to breaking a past round's thumbnail.
    return NextResponse.json({ submission: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update images';
    console.error('Drawing images PATCH error:', message);
    const status = message.includes('Invalid Microsoft token') || message.includes('Authorization')
      ? 401
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
