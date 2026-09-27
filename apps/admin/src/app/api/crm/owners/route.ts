export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listCrmOwners } from '@neram/database';

/** GET /api/crm/owners - staff who can own a person in the CRM. */
export async function GET() {
  try {
    return NextResponse.json({ owners: await listCrmOwners() }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    console.error('CRM owners error:', error);
    return NextResponse.json({ error: 'Could not load staff.' }, { status: 500 });
  }
}
