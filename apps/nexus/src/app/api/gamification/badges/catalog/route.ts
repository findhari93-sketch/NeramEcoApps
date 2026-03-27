import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getBadgeCatalogForStudent } from '@neram/database/queries/nexus';

/**
 * GET /api/gamification/badges/catalog?student_id={id}
 *
 * Returns all badge definitions with earned/locked status.
 * If student_id not provided, uses current user.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const studentId = request.nextUrl.searchParams.get('student_id') || user.id;
    const catalog = await getBadgeCatalogForStudent(studentId);

    // Group by category
    const grouped = {
      attendance: catalog.filter(b => b.category === 'attendance'),
      checklist: catalog.filter(b => b.category === 'checklist'),
      growth: catalog.filter(b => b.category === 'growth'),
      leaderboard: catalog.filter(b => b.category === 'leaderboard'),
    };

    return NextResponse.json({ catalog, grouped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load badge catalog';
    console.error('Badge catalog error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
