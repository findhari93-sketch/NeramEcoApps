// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getNewJobApplicationsCount } from '@neram/database';

// GET /api/careers/applications/count - Get count of new applications
export async function GET() {
  try {
    const count = await getNewJobApplicationsCount();
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error fetching new applications count:', error);
    return NextResponse.json({ count: 0 });
  }
}
