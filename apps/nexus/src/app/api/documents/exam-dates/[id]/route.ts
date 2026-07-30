import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * Fields a staff member may write. Everything else in the body is dropped.
 *
 * This used to be `.update({ ...body })`, which let any active teacher rewrite
 * created_by, id or created_at by putting them in the request. That mattered
 * little while this table only fed a document checklist; it matters a lot now
 * that date_confidence here decides what every student and parent is told about
 * when their exam is (20260804090000).
 */
const WRITABLE_FIELDS = [
  'exam_type',
  'year',
  'phase',
  'attempt_number',
  'exam_date',
  'label',
  'registration_deadline',
  'date_confidence',
  'date_note',
  'is_active',
] as const;

/**
 * PATCH /api/documents/exam-dates/[id]
 *
 * The one place the official date lands once the conducting body announces it.
 * Editing a date propagates to every countdown in the app on the next request.
 *
 * Gate mirrors PATCH /api/teaching-plans/[id]: ordinary edits need
 * structure.batch.manage (manager and above), while flipping a date to
 * 'confirmed' publishes an assertion school-wide and needs system.settings
 * (admin only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(user, 'structure.batch.manage');

    const body = await request.json();

    const updates: Record<string, unknown> = {};
    for (const key of WRITABLE_FIELDS) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No writable fields in request' }, { status: 400 });
    }

    if (updates.date_confidence !== undefined) {
      if (updates.date_confidence !== 'expected' && updates.date_confidence !== 'confirmed') {
        return NextResponse.json(
          { error: "date_confidence must be 'expected' or 'confirmed'" },
          { status: 400 },
        );
      }
      if (updates.date_confidence === 'confirmed') {
        assertCapability(user, 'system.settings');
        // A confirmed date needs no excuse, and leaving a stale "we are guessing"
        // note attached to an official date is worse than having none.
        updates.date_note = null;
      }
    }

    updates.updated_at = new Date().toISOString();

    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any)
      .from('nexus_exam_dates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ exam_date: data });
  } catch (err) {
    return errorResponse(err, 'Failed to update exam date');
  }
}

/**
 * DELETE /api/documents/exam-dates/[id]
 * Soft delete: sets is_active = false.
 *
 * Any plan pointing at this row keeps its target_exam_date_id (the FK is
 * ON DELETE SET NULL and this is not a hard delete anyway), so the countdown
 * resolver checks is_active and degrades to the plan's own date. See the column
 * comment on nexus_teaching_plans.target_exam_date_id.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(user, 'structure.batch.manage');

    const supabase = getSupabaseAdminClient();
    const { error } = await (supabase as any)
      .from('nexus_exam_dates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Failed to delete exam date');
  }
}
