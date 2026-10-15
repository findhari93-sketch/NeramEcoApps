export const dynamic = 'force-dynamic';

/**
 * PUT /api/marketing-ai/roi/spend { month: 'YYYY-MM', amount: number | null }
 * The month's Google Ads spend, typed by an admin until the Ads API is
 * connected. null clears the month. Every change is audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse, readJson } from '@/lib/marketing-ai/http';
import { validateSpendInput } from '@/lib/marketing-ai/roi';
import { saveManualSpend } from '@/lib/marketing-ai/roi-store';
import { db } from '@/lib/marketing-ai/store';

export async function PUT(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const { month, amount } = await readJson(request);
    const currentMonth = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
    const bad = validateSpendInput(month, amount ?? null, currentMonth);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const spend = await saveManualSpend(db(), month, amount ?? null, guard.adminId);
    return NextResponse.json({ spend });
  } catch (err) {
    return errorResponse(err, 'roi spend');
  }
}
