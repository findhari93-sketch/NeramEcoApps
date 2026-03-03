// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { updateOnboardingQuestion, deleteOnboardingQuestion } from '@neram/database';

// PUT /api/onboarding/questions/[id] - Update a question
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data = await updateOnboardingQuestion(id, body);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating onboarding question:', error);
    return NextResponse.json(
      { error: 'Failed to update onboarding question' },
      { status: 500 }
    );
  }
}

// DELETE /api/onboarding/questions/[id] - Delete a question
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteOnboardingQuestion(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting onboarding question:', error);
    return NextResponse.json(
      { error: 'Failed to delete onboarding question' },
      { status: 500 }
    );
  }
}