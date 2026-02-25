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

    // Sanitize: only pass known DB columns
    const updates: Record<string, unknown> = {};
    const allowedFields = [
      'course_type', 'program_type', 'display_name', 'display_name_ta',
      'fee_amount', 'combo_extra_fee', 'duration', 'schedule_summary',
      'features', 'is_active', 'display_order', 'single_payment_discount',
      'installment_1_amount', 'installment_2_amount', 'is_hidden_from_public',
    ];
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

    const data = await updateFeeStructure(id, updates);
    return NextResponse.json({ data });
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown> | null;
    console.error('Error updating fee structure:', {
      message: errObj?.message,
      code: errObj?.code,
      details: errObj?.details,
      hint: errObj?.hint,
    });

    let message = 'Failed to update fee structure';
    if (error instanceof Error) {
      message = error.message;
    } else if (errObj?.message && typeof errObj.message === 'string') {
      message = errObj.message;
    }

    return NextResponse.json({ error: message }, { status: 500 });
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
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown> | null;
    console.error('Error deleting fee structure:', {
      message: errObj?.message,
      code: errObj?.code,
      details: errObj?.details,
    });

    let message = 'Failed to delete fee structure';
    if (error instanceof Error) {
      message = error.message;
    } else if (errObj?.message && typeof errObj.message === 'string') {
      message = errObj.message;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
