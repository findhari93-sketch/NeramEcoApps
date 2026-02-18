// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { updateFeeStructure, deleteFeeStructure } from '@neram/database';

// PUT /api/fee-structures/[id] - Update a fee structure
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data = await updateFeeStructure(id, body);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error updating fee structure:', error);
    return NextResponse.json(
      { error: 'Failed to update fee structure' },
      { status: 500 }
    );
  }
}

// DELETE /api/fee-structures/[id] - Delete a fee structure
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteFeeStructure(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting fee structure:', error);
    return NextResponse.json(
      { error: 'Failed to delete fee structure' },
      { status: 500 }
    );
  }
}
