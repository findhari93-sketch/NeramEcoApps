// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EDITABLE_FIELDS = [
  'admissions_email',
  'email',
  'email_source',
  'phone',
  'website',
  'city',
  'name',
  'naac_grade',
  'total_barch_seats',
  'annual_fee_approx',
  'affiliated_university',
  'type',
] as const;

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { college_id, ...updates } = body;

  if (!college_id) {
    return NextResponse.json({ error: 'college_id required' }, { status: 400 });
  }

  const safeUpdates: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in updates) {
      const val = updates[field];
      safeUpdates[field] = val === '' ? null : val;
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('colleges')
    .update(safeUpdates)
    .eq('id', college_id)
    .select('id, name, admissions_email, email, phone, website, city, naac_grade, total_barch_seats, annual_fee_approx, affiliated_university, type')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, college: data });
}
