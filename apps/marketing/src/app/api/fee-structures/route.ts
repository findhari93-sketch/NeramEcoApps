export const dynamic = 'force-dynamic';

/**
 * GET /api/fee-structures
 * Returns active fee structures for public display
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveFeeStructures } from '@neram/database';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const courseType = searchParams.get('courseType') as any;
    const programType = searchParams.get('programType') as any;
    const excludeHidden = searchParams.get('excludeHidden') === 'true';

    const feeStructures = await getActiveFeeStructures({
      courseType: courseType || undefined,
      programType: programType || undefined,
      excludeHidden,
    });

    return NextResponse.json({ feeStructures });
  } catch (error) {
    console.error('Error fetching fee structures:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fee structures' },
      { status: 500 }
    );
  }
}