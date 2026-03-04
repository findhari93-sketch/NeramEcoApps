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

  const { data, error } = await supabase
    .from('chatbot_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by session for better display
  const sessions: Record<string, typeof data> = {};
  for (const msg of data || []) {
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
