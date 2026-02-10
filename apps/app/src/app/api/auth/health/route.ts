import { NextResponse } from 'next/server';
import { verifyAdminConfig } from '@/lib/firebase-admin';

export async function GET() {
  const result = await verifyAdminConfig();
  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
  });
}
