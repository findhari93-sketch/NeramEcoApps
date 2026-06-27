import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { listReferenceImages, createReferenceImage } from '@neram/database/queries/nexus';

async function resolveUser(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase.from('users').select('id, user_type').eq('ms_oid', msUser.oid).single();
  return user;
}

/** GET /api/drawing/references?category=&tag=  — browse the Reference Library. */
export async function GET(request: NextRequest) {
  try {
    const user = await resolveUser(request);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const params = request.nextUrl.searchParams;
    const isStaff = user.user_type === 'teacher' || user.user_type === 'admin';
    const references = await listReferenceImages({
      category: params.get('category') || undefined,
      tag: params.get('tag') || undefined,
      // Only staff may see archived references.
      includeInactive: isStaff && params.get('includeInactive') === 'true',
    });
    return NextResponse.json({ references });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

/** POST /api/drawing/references  — staff add a reference (image already uploaded). */
export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(request);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Only teachers can add references' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { title, category, tags, image_url, notes } = body;
    if (!title || !image_url) {
      return NextResponse.json({ error: 'title and image_url are required' }, { status: 400 });
    }

    const reference = await createReferenceImage({
      title: String(title).trim(),
      category: category || null,
      tags: Array.isArray(tags) ? tags.map((t: string) => String(t).trim()).filter(Boolean) : [],
      image_url,
      notes: notes || null,
      uploaded_by: user.id,
    });
    return NextResponse.json({ reference });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
