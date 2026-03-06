import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getNataExamCenterById,
  updateNataExamCenter,
  deleteNataExamCenter,
} from '@neram/database';

// PATCH /api/exam-centers/[id] — Update single center
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseAdminClient();

    // Whitelist allowed update fields
    const allowedFields = [
      'state', 'city_brochure', 'brochure_ref', 'latitude', 'longitude',
      'city_population_tier', 'probable_center_1', 'center_1_address',
      'center_1_evidence', 'probable_center_2', 'center_2_address',
      'center_2_evidence', 'confidence', 'is_new_2025', 'was_in_2024',
      'tcs_ion_confirmed', 'has_barch_college', 'notes', 'year',
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Validate confidence enum if provided
    if (updates.confidence && !['HIGH', 'MEDIUM', 'LOW'].includes(updates.confidence as string)) {
      return NextResponse.json(
        { error: 'confidence must be HIGH, MEDIUM, or LOW' },
        { status: 400 }
      );
    }

    // Validate tier if provided
    if (updates.city_population_tier && !['Metro', 'Tier-1', 'Tier-2', 'Tier-3', 'International'].includes(updates.city_population_tier as string)) {
      return NextResponse.json(
        { error: 'city_population_tier must be Metro, Tier-1, Tier-2, Tier-3, or International' },
        { status: 400 }
      );
    }

    const updated = await updateNataExamCenter(id, updates, client);

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error updating exam center:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update exam center';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/exam-centers/[id] — Delete single center
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseAdminClient();

    // Verify center exists first
    const existing = await getNataExamCenterById(id, client);
    if (!existing) {
      return NextResponse.json({ error: 'Exam center not found' }, { status: 404 });
    }

    await deleteNataExamCenter(id, client);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting exam center:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete exam center';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
