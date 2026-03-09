// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getOnboardingStepDefinitionById,
  updateOnboardingStepDefinition,
  deleteOnboardingStepDefinition,
} from '@neram/database';

// GET /api/onboarding-steps/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();
    const step = await getOnboardingStepDefinitionById(id, supabase);

    return NextResponse.json({ success: true, data: step });
  } catch (error) {
    console.error('Error fetching onboarding step:', error);
    return NextResponse.json(
      { error: 'Failed to fetch onboarding step' },
      { status: 500 }
    );
  }
}

// PATCH /api/onboarding-steps/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const supabase = getSupabaseAdminClient();
    const step = await updateOnboardingStepDefinition(id, body, supabase);

    return NextResponse.json({ success: true, data: step });
  } catch (error) {
    console.error('Error updating onboarding step:', error);
    return NextResponse.json(
      { error: 'Failed to update onboarding step' },
      { status: 500 }
    );
  }
}

// DELETE /api/onboarding-steps/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();
    await deleteOnboardingStepDefinition(id, supabase);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting onboarding step:', error);
    return NextResponse.json(
      { error: 'Failed to delete onboarding step' },
      { status: 500 }
    );
  }
}
