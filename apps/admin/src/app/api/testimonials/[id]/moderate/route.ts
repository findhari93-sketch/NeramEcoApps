export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { moderateTestimonial } from '@neram/database';
import type { ModerationAction } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

const ACTIONS: ModerationAction[] = ['approve', 'publish', 'reject', 'withdraw'];

/**
 * POST /api/testimonials/[id]/moderate  { action, note? }
 * Publishing a learner's testimonial needs their consent on record; a
 * rejection needs a reason.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: `action must be one of ${ACTIONS.join(', ')}.` }, { status: 400 });
  }
  try {
    const result = await moderateTestimonial(params.id, body.action, adminId, body.note ?? null);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.status) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Moderate testimonial error:', error);
    return NextResponse.json({ error: 'Could not update the testimonial.' }, { status: 500 });
  }
}
