// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getDirectEnrollmentLinkById,
  updateDirectEnrollmentLink,
  deleteDirectEnrollmentLink,
} from '@neram/database';

// GET /api/direct-enrollment/[id] - Get link details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const link = await getDirectEnrollmentLinkById(id, supabase);
    if (!link) {
      return NextResponse.json(
        { error: 'Direct enrollment link not found' },
        { status: 404 }
      );
    }

    // Fetch course and batch names for display
    let courseName = null;
    let batchName = null;
    let centerName = null;

    if (link.course_id) {
      const { data: course } = await supabase
        .from('courses')
        .select('name')
        .eq('id', link.course_id)
        .single();
      courseName = course?.name || null;
    }

    if (link.batch_id) {
      const { data: batch } = await supabase
        .from('batches')
        .select('name')
        .eq('id', link.batch_id)
        .single();
      batchName = batch?.name || null;
    }

    if (link.center_id) {
      const { data: center } = await supabase
        .from('offline_centers')
        .select('name')
        .eq('id', link.center_id)
        .single();
      centerName = center?.name || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...link,
        course_name: courseName,
        batch_name: batchName,
        center_name: centerName,
      },
    });
  } catch (error) {
    console.error('Error fetching direct enrollment link:', error);
    return NextResponse.json(
      { error: 'Failed to fetch direct enrollment link' },
      { status: 500 }
    );
  }
}

// DELETE /api/direct-enrollment/[id] - Delete a cancelled/expired link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const existing = await getDirectEnrollmentLinkById(id, supabase);
    if (!existing) {
      return NextResponse.json(
        { error: 'Direct enrollment link not found' },
        { status: 404 }
      );
    }

    if (existing.status !== 'cancelled' && existing.status !== 'expired') {
      return NextResponse.json(
        { error: 'Only cancelled or expired links can be deleted' },
        { status: 400 }
      );
    }

    await deleteDirectEnrollmentLink(id, supabase);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting direct enrollment link:', error);
    return NextResponse.json(
      { error: 'Failed to delete direct enrollment link' },
      { status: 500 }
    );
  }
}

// PATCH /api/direct-enrollment/[id] - Update link (cancel, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, adminNotes } = body;

    const supabase = getSupabaseAdminClient();

    const existing = await getDirectEnrollmentLinkById(id, supabase);
    if (!existing) {
      return NextResponse.json(
        { error: 'Direct enrollment link not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.admin_notes = adminNotes;

    const link = await updateDirectEnrollmentLink(id, updateData, supabase);

    return NextResponse.json({
      success: true,
      data: link,
    });
  } catch (error) {
    console.error('Error updating direct enrollment link:', error);
    return NextResponse.json(
      { error: 'Failed to update direct enrollment link' },
      { status: 500 }
    );
  }
}