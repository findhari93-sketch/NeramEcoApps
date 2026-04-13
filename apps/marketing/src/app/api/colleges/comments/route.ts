// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

// GET /api/colleges/comments?college_id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const college_id = searchParams.get('college_id');
  if (!college_id) return NextResponse.json({ error: 'college_id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('college_comments')
    .select('id,parent_id,author_name,body,is_ambassador,created_at')
    .eq('college_id', college_id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Nest replies under their parent
  const topLevel = (data ?? []).filter((c) => !c.parent_id);
  const replies = (data ?? []).filter((c) => c.parent_id);
  const nested = topLevel.map((c) => ({
    ...c,
    replies: replies.filter((r) => r.parent_id === c.id),
  }));

  return NextResponse.json({ data: nested });
}

// POST /api/colleges/comments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { college_id, parent_id, author_name, comment_body, firebase_uid } = body;

    if (!college_id || !author_name || !comment_body) {
      return NextResponse.json(
        { error: 'Required: college_id, author_name, comment_body' },
        { status: 400 }
      );
    }
    if (comment_body.length < 5) {
      return NextResponse.json(
        { error: 'Comment must be at least 5 characters' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('college_comments')
      .insert({
        college_id,
        parent_id: parent_id ?? null,
        author_name,
        body: comment_body,
        firebase_uid: firebase_uid ?? null,
        status: 'approved',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
