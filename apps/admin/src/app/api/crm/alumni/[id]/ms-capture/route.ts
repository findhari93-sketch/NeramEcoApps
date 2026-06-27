// @ts-nocheck
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { checkGraphConnection } from '@neram/auth';
import { captureMicrosoftProfile } from '@/lib/ms-offboard';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/crm/alumni/[id]/ms-capture
 * Capture the alumnus's Microsoft photo + profile snapshot WITHOUT touching their
 * license/sign-in. Useful to pull a photo for someone already offboarded.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid alumnus id.' }, { status: 400 });
    }
    const conn = await checkGraphConnection();
    if (!conn.ok) {
      return NextResponse.json({ success: false, configError: conn.error });
    }
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, ms_oid')
      .eq('id', params.id)
      .maybeSingle();
    if (!user) return NextResponse.json({ error: 'Alumnus not found.' }, { status: 404 });
    if (!user.ms_oid) return NextResponse.json({ success: false, error: 'No Microsoft account linked.' });

    const cap = await captureMicrosoftProfile(supabase, user);
    return NextResponse.json({ success: true, ...cap });
  } catch (error: any) {
    console.error('CRM alumni ms-capture error:', error);
    return NextResponse.json({ error: error.message || 'Failed to capture Microsoft profile' }, { status: 500 });
  }
}
