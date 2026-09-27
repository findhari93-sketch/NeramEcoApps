export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listTestimonialsForModeration, countPendingTestimonials } from '@neram/database';
import type { PublicationStatus } from '@neram/database';

const STATUSES = ['private', 'pending_moderation', 'approved', 'published', 'rejected', 'withdrawn', 'all'];

/** GET /api/testimonials/moderation?status=pending_moderation&source=learner|staff|all */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const status = STATUSES.includes(sp.get('status') || '') ? (sp.get('status') as PublicationStatus | 'all') : 'pending_moderation';
  const sourceParam = sp.get('source');
  const source = sourceParam === 'learner' || sourceParam === 'staff' ? sourceParam : 'all';
  try {
    const [testimonials, pending] = await Promise.all([
      listTestimonialsForModeration({ status, source }),
      countPendingTestimonials(),
    ]);
    return NextResponse.json({ testimonials, pending }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Testimonial moderation list error:', error);
    return NextResponse.json({ error: 'Could not load testimonials.' }, { status: 500 });
  }
}
