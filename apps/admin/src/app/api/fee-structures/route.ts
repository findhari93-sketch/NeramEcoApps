// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listFeeStructures, createFeeStructure } from '@neram/database';

// GET /api/fee-structures - List all fee structures
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('isActive');

    const options: { isActive?: boolean } = {};
    if (isActive !== null) {
      options.isActive = isActive === 'true';
    }

    const data = await listFeeStructures(options);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing fee structures:', error);
    return NextResponse.json(
      { error: 'Failed to list fee structures' },
      { status: 500 }
    );
  }
}

// POST /api/fee-structures - Create a fee structure
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      course_type,
      program_type,
      display_name,
      display_name_ta,
      fee_amount,
      combo_extra_fee,
      duration,
      schedule_summary,
      features,
      display_order,
      single_payment_discount,
      installment_1_amount,
      installment_2_amount,
      is_hidden_from_public,
    } = body;

    if (!course_type || !program_type || !display_name || !fee_amount || !duration) {
      return NextResponse.json(
        { error: 'course_type, program_type, display_name, fee_amount, and duration are required' },
        { status: 400 }
      );
    }

    const data = await createFeeStructure({
      course_type,
      program_type,
      display_name,
      display_name_ta,
      fee_amount: Number(fee_amount),
      combo_extra_fee: combo_extra_fee ? Number(combo_extra_fee) : 0,
      duration,
      schedule_summary: schedule_summary || undefined,
      features: features || [],
      display_order: display_order || 0,
      single_payment_discount: single_payment_discount ? Number(single_payment_discount) : 0,
      installment_1_amount: installment_1_amount ? Number(installment_1_amount) : undefined,
      installment_2_amount: installment_2_amount ? Number(installment_2_amount) : undefined,
      is_hidden_from_public: is_hidden_from_public || false,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating fee structure:', error);
    return NextResponse.json(
      { error: 'Failed to create fee structure' },
      { status: 500 }
    );
  }
}