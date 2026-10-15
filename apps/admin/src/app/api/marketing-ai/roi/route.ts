export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing-ai/roi
 * Per month of ad spend: sign-ups, demos, joined students and fees it brought
 * back, from Neram's own database. Admins only. Spec:
 * docs/superpowers/specs/2026-10-14-ads-roi-design.md.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { loadRoi } from '@/lib/marketing-ai/roi-store';
import { db } from '@/lib/marketing-ai/store';

export async function GET(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const report = await loadRoi(db());
    return NextResponse.json({ ...report, generatedAt: new Date().toISOString() });
  } catch (err) {
    return errorResponse(err, 'roi');
  }
}
