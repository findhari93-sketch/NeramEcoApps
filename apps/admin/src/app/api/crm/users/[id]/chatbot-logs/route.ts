import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();
  const userId = params.id;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  const { data, error } = await (supabase
    .from('chatbot_conversations') as ReturnType<typeof supabase.from>)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by session for better display
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions: Record<string, any[]> = {};
  for (const msg of (data || []) as any[]) {
    const sid = msg.session_id;
    if (!sessions[sid]) sessions[sid] = [];
    sessions[sid].push(msg);
  }

  return NextResponse.json({
    conversations: data || [],
    sessions,
    total: data?.length || 0,
  });
}
