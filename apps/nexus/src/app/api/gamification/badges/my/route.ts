import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getStudentBadges, getBadgeCatalogForStudent } from '@neram/database/queries/nexus';

/**
 * GET /api/gamification/badges/my
 *
 * Returns current user's earned badges + next closest badge.
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

    const [earned, catalog] = await Promise.all([
      getStudentBadges(user.id),
      getBadgeCatalogForStudent(user.id),
    ]);

    // Find next closest badge (first unearned common, then rare, etc.)
    const rarityOrder = ['common', 'rare', 'epic', 'legendary'];
    const unearned = catalog
      .filter(b => !b.earned)
      .sort((a, b) => rarityOrder.indexOf(a.rarity_tier) - rarityOrder.indexOf(b.rarity_tier));

    return NextResponse.json({
      earned,
      totalEarned: earned.length,
      totalAvailable: catalog.length,
      nextBadge: unearned[0] || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load badges';
    console.error('My badges error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
