// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/nexus/classrooms/[id]/batches — List batches for a Nexus classroom
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient() as any;

    const { data, error } = await supabase
      .from('nexus_batches')
      .select('id, name, description, is_active')
      .eq('classroom_id', id)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error fetching batches:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch batches' }, { status: 500 });
  }
}
