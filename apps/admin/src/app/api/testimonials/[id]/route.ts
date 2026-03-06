// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getTestimonialById,
  updateTestimonial,
  deleteTestimonial,
} from '@neram/database';

// GET /api/testimonials/[id] - Get a single testimonial
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseAdminClient();
    const data = await getTestimonialById(id, client);

    if (!data) {
      return NextResponse.json(
        { error: 'Testimonial not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching testimonial:', error);
    return NextResponse.json(
      { error: 'Failed to fetch testimonial' },
      { status: 500 }
    );
  }
}

// PATCH /api/testimonials/[id] - Update a testimonial
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'student_name',
      'student_photo',
      'content',
      'exam_type',
      'score',
      'rank',
      'college_admitted',
      'year',
      'course_name',
      'course_slug',
      'city',
      'state',
      'learning_mode',
      'rating',
      'video_url',
      'is_featured',
      'is_homepage',
      'display_order',
      'is_active',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Validate exam_type if provided
    if (updates.exam_type && !['NATA', 'JEE_PAPER_2', 'BOTH'].includes(updates.exam_type as string)) {
      return NextResponse.json(
        { error: 'exam_type must be one of: NATA, JEE_PAPER_2, BOTH' },
        { status: 400 }
      );
    }

    // Validate learning_mode if provided
    if (updates.learning_mode && !['online', 'hybrid', 'offline'].includes(updates.learning_mode as string)) {
      return NextResponse.json(
        { error: 'learning_mode must be one of: online, hybrid, offline' },
        { status: 400 }
      );
    }

    const client = getSupabaseAdminClient();
    const data = await updateTestimonial(id, updates, client);

    if (!data) {
      return NextResponse.json(
        { error: 'Failed to update testimonial' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown> | null;
    console.error('Error updating testimonial:', {
      message: errObj?.message,
      code: errObj?.code,
    });

    let message = 'Failed to update testimonial';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/testimonials/[id] - Soft-delete a testimonial
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseAdminClient();
    const success = await deleteTestimonial(id, client);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete testimonial' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown> | null;
    console.error('Error deleting testimonial:', {
      message: errObj?.message,
    });

    let message = 'Failed to delete testimonial';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
