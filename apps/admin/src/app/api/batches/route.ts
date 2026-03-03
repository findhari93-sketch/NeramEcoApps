export const dynamic = 'force-dynamic';

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

// GET /api/batches - List batches
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('isActive');

    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from('batches')
      .select('id, name, course_id, start_date, end_date, capacity, enrolled_count, is_active')
      .order('name', { ascending: true });

    if (isActive === 'true') {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('Error listing batches:', error);
    return NextResponse.json(
      { error: 'Failed to list batches' },
      { status: 500 }
    );
  }
}