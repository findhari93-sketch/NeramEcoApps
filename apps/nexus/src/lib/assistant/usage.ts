/**
 * Model answers and their cost per student since `sinceIso`, for the admin
 * Assistant section. Paged in 1000s (PostgREST caps a read at 1000 rows) and
 * joined to threads and users in chunks, so a long .in() list never forms.
 */
const PAGE = 1000;
const CHUNK = 100;

export async function loadAssistantMonthUsage(supabase: any, sinceIso: string): Promise<Array<{ studentId: string; name: string | null; questions: number; costUsd: number }>> {
  const byThread = new Map<string, { questions: number; costUsd: number }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('nexus_assistant_messages')
      .select('thread_id, cost_usd')
      .eq('role', 'assistant')
      .eq('llm', true)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const m of (data || []) as Array<{ thread_id: string; cost_usd: number | null }>) {
      const t = byThread.get(m.thread_id) ?? { questions: 0, costUsd: 0 };
      t.questions += 1;
      t.costUsd += Number(m.cost_usd) || 0;
      byThread.set(m.thread_id, t);
    }
    if (!data || data.length < PAGE) break;
  }

  const threadIds = [...byThread.keys()];
  const owner = new Map<string, string>();
  for (let i = 0; i < threadIds.length; i += CHUNK) {
    const { data, error } = await supabase.from('nexus_assistant_threads').select('id, user_id').in('id', threadIds.slice(i, i + CHUNK));
    if (error) throw error;
    for (const t of (data || []) as Array<{ id: string; user_id: string }>) owner.set(t.id, t.user_id);
  }

  const byStudent = new Map<string, { questions: number; costUsd: number }>();
  for (const [threadId, u] of byThread) {
    const sid = owner.get(threadId);
    if (!sid) continue;
    const s = byStudent.get(sid) ?? { questions: 0, costUsd: 0 };
    s.questions += u.questions;
    s.costUsd += u.costUsd;
    byStudent.set(sid, s);
  }

  const ids = [...byStudent.keys()];
  const names = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase.from('users').select('id, name').in('id', ids.slice(i, i + CHUNK));
    if (error) throw error;
    for (const u of (data || []) as Array<{ id: string; name: string | null }>) names.set(u.id, u.name);
  }

  return ids
    .map((studentId) => ({ studentId, name: names.get(studentId) ?? null, ...byStudent.get(studentId)! }))
    .sort((a, b) => b.costUsd - a.costUsd || b.questions - a.questions);
}
