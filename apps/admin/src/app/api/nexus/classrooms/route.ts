// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/nexus/classrooms — List all active Nexus classrooms
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('nexus_classrooms')
      .select('id, name, type, is_active, onboarding_type')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error fetching classrooms:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch classrooms' }, { status: 500 });
  }
}
