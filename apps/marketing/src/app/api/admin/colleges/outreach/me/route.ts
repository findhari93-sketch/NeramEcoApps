import { NextRequest, NextResponse } from 'next/server';
import { getStaffSessionOptional } from '@/lib/admin/staff-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getStaffSessionOptional(req);
  if (!session) {
    return NextResponse.json({ isStaff: false }, { status: 401 });
  }
  return NextResponse.json({ isStaff: true, name: session.name, email: session.email });
}
