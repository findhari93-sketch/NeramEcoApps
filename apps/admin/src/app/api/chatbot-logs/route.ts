import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const userId = searchParams.get('userId');
  const sessionId = searchParams.get('sessionId');
  const search = searchParams.get('search');
  const source = searchParams.get('source');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('chatbot_conversations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  if (search) {
    query = query.ilike('user_message', `%${search}%`);
  }

  if (source) {
    query = query.eq('source', source);
  }

  if (dateFrom) {
    query = query.gte('created_at', dateFrom);
  }

  if (dateTo) {
    // Add 1 day to include the full end date
    const endDate = new Date(dateTo);
    endDate.setDate(endDate.getDate() + 1);
    query = query.lt('created_at', endDate.toISOString());
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Resolve user names for all conversations that have user_id
  const conversations = data || [];
  const userIdsToResolve = [
    ...new Set(
      conversations
        .filter((c: any) => c.user_id)
        .map((c: any) => c.user_id)
    ),
  ];

  let userNameMap: Record<string, { name: string; avatar_url: string | null }> = {};
  if (userIdsToResolve.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, first_name, last_name, avatar_url, phone')
      .in('id', userIdsToResolve);

    if (users) {
      for (const u of users) {
        const displayName = u.first_name
          ? `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}`
          : u.name || u.phone || null;
        if (displayName) {
          userNameMap[u.id] = { name: displayName, avatar_url: u.avatar_url };
        }
      }
    }
  }

  // Enrich conversations with resolved names
  const enriched = conversations.map((c: any) => ({
    ...c,
    resolved_name: userNameMap[c.user_id]?.name || c.lead_name || null,
    resolved_avatar: userNameMap[c.user_id]?.avatar_url || null,
  }));

  return NextResponse.json({
    conversations: enriched,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
