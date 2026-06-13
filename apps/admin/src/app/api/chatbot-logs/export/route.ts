import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { buildChatHistoryMarkdown, type ChatExportRow } from '@/lib/chat-export-md';

export const dynamic = 'force-dynamic';

const COLUMNS =
  'id, user_id, session_id, source, created_at, user_message, ai_response, error, admin_correction, thumbs_up, promoted_to_kb, page_url, model_used, response_time_ms, lead_name';

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);

  const source = searchParams.get('source');
  const search = searchParams.get('search');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  // Build the base filter once; reused per page.
  const applyFilters = (q: any) => {
    if (source) q = q.eq('source', source);
    if (search) q = q.ilike('user_message', `%${search}%`);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1); // include the full end day
      q = q.lt('created_at', end.toISOString());
    }
    return q;
  };

  // Fetch ALL matching rows (paginate so we are not capped at the default 1000).
  const rows: ChatExportRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('chatbot_conversations')
      .select(COLUMNS)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    query = applyFilters(query);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const batch = (data || []) as unknown as ChatExportRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  // Resolve user display names for rows that carry a user_id.
  const userIds = [...new Set(rows.filter((r) => r.user_id).map((r) => r.user_id as string))];
  const nameMap: Record<string, string> = {};
  if (userIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, first_name, last_name, phone')
      .in('id', userIds);
    for (const u of users || []) {
      const display = u.first_name
        ? `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}`
        : u.name || u.phone || null;
      if (display) nameMap[u.id] = display;
    }
  }

  const markdown = buildChatHistoryMarkdown(rows, nameMap, { dateFrom, dateTo, source });

  const stamp = (s: string | null) => (s ? s : '');
  const rangePart =
    dateFrom || dateTo ? `_${stamp(dateFrom) || 'start'}_to_${stamp(dateTo) || 'now'}` : '_all';
  const filename = `aintra-chat-history${rangePart}.md`;

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
