import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getGalleryFeed } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase.from('users').select('id, user_type').eq('ms_oid', msUser.oid).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const params = request.nextUrl.searchParams;
    const tagsParam = params.get('tags');
    const tagSlugs = tagsParam
      ? tagsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    // 'current' (default) excludes alumni; 'alumni' is the Hall of Fame; 'all' is both.
    const audienceParam = params.get('audience');
    const audience =
      audienceParam === 'alumni' || audienceParam === 'all' ? audienceParam : 'current';

    // Moderation: only teachers/admins may request hidden works. Students are
    // always forced to 'visible', so a hidden submission can never reach them.
    const isStaff = user.user_type === 'teacher' || user.user_type === 'admin';
    const visibilityParam = params.get('visibility');
    const visibility =
      isStaff && (visibilityParam === 'hidden' || visibilityParam === 'all') ? visibilityParam : 'visible';

    const category = params.get('category') || undefined;
    const academicYear = params.get('academicYear') || undefined;
    const collegeId = params.get('collegeId') || undefined;

    const posts = await getGalleryFeed(user.id, {
      tagSlugs,
      audience,
      visibility,
      category,
      academicYear,
      collegeId,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 12,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    });
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
