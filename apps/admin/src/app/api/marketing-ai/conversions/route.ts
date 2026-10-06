export const dynamic = 'force-dynamic';

/** GET /api/marketing-ai/conversions - The last 200 offline conversion uploads with their lead. Admins only. */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { db } from '@/lib/marketing-ai/store';

export async function GET(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const client = db();
    const { data, error } = await client
      .from('ads_conversion_uploads')
      .select('id, lead_profile_id, conversion_type, click_id_type, conversion_time, value_inr, status, error, created_at, uploaded_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const ids = [...new Set((data ?? []).map((r: any) => r.lead_profile_id))];
    const leads: Record<string, { name: string | null; application_number: string | null }> = {};
    for (let i = 0; i < ids.length; i += 100) {
      const { data: rows } = await client.from('lead_profiles').select('id, first_name, application_number').in('id', ids.slice(i, i + 100));
      for (const l of rows ?? []) leads[l.id] = { name: l.first_name, application_number: l.application_number };
    }
    return NextResponse.json({ items: (data ?? []).map((r: any) => ({ ...r, lead: leads[r.lead_profile_id] ?? null })) });
  } catch (err) {
    return errorResponse(err, 'conversions');
  }
}
