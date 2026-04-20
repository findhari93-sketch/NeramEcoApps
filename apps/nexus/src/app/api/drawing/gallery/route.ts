import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getGalleryFeed } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const params = request.nextUrl.searchParams;
    const tagsParam = params.get('tags');
    const tagSlugs = tagsParam
      ? tagsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const posts = await getGalleryFeed(user.id, {
      tagSlugs,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 12,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    });
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
