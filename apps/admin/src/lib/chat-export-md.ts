/**
 * Formats Aintra chatbot_conversations rows into a single Markdown document,
 * grouped by session. Shared by the admin chat-history export endpoint.
 * Mirrors the one-off export in docs/aintra-chat-history.md.
 */

export interface ChatExportRow {
  id: string;
  user_id: string | null;
  session_id: string;
  source: string | null;
  created_at: string;
  user_message: string | null;
  ai_response: string | null;
  error: string | null;
  admin_correction: string | null;
  thumbs_up: boolean | null;
  promoted_to_kb: boolean | null;
  page_url: string | null;
  model_used: string | null;
  response_time_ms: number | null;
  lead_name: string | null;
}

const istFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const istDay = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
});
const fmt = (iso: string) => istFmt.format(new Date(iso)).replace(',', '');
const fmtDay = (iso: string) => istDay.format(new Date(iso));
const sourceLabel = (s: string | null) =>
  s === 'nata_chatbot' ? 'NATA' : s === 'general_chatbot' ? 'General' : s || 'Unknown';
const quote = (text: string) => String(text).split('\n').map((l) => '> ' + l).join('\n');

export function buildChatHistoryMarkdown(
  rows: ChatExportRow[],
  nameMap: Record<string, string>,
  meta: { dateFrom?: string | null; dateTo?: string | null; source?: string | null } = {}
): string {
  // Group by session
  const sessions = new Map<string, ChatExportRow[]>();
  for (const r of rows) {
    if (!sessions.has(r.session_id)) sessions.set(r.session_id, []);
    sessions.get(r.session_id)!.push(r);
  }
  for (const turns of sessions.values()) {
    turns.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  const sessionList = [...sessions.entries()]
    .map(([sid, turns]) => ({ sid, turns, last: new Date(turns[turns.length - 1].created_at).getTime() }))
    .sort((a, b) => b.last - a.last);

  // Stats
  const totalTurns = rows.length;
  const totalSessions = sessionList.length;
  const errorTurns = rows.filter((r) => r.error).length;
  const emptyTurns = rows.filter((r) => !r.error && (!r.ai_response || !r.ai_response.trim())).length;
  const correctedTurns = rows.filter((r) => r.admin_correction).length;

  const out: string[] = [];
  out.push('# Aintra AI, Chat History Export');
  out.push('');
  out.push('Exported from the `chatbot_conversations` table for question and answer quality review.');
  out.push('Timestamps are IST (Asia/Kolkata). Sessions are ordered most-recent first; turns within a session are chronological.');
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push('| Metric | Value |');
  out.push('| --- | --- |');
  out.push(`| Total conversations (sessions) | ${totalSessions} |`);
  out.push(`| Total turns (question and answer pairs) | ${totalTurns} |`);
  out.push(`| Turns with errors | ${errorTurns} |`);
  out.push(`| Turns with empty AI response | ${emptyTurns} |`);
  out.push(`| Turns with an admin correction | ${correctedTurns} |`);
  const rangeLabel = meta.dateFrom || meta.dateTo
    ? `${meta.dateFrom || 'start'} to ${meta.dateTo || 'now'}`
    : 'all dates';
  out.push(`| Date range filter | ${rangeLabel} |`);
  if (meta.source) out.push(`| Source filter | ${sourceLabel(meta.source)} |`);
  out.push('');
  out.push('> Turns that errored or returned an empty answer are tagged **`NEEDS REVIEW`** so weak spots are easy to find (search the file for that tag).');
  out.push('');
  out.push('---');
  out.push('');

  if (sessionList.length === 0) {
    out.push('_No conversations found for the selected filters._');
    out.push('');
    return out.join('\n');
  }

  let sNo = 0;
  for (const s of sessionList) {
    sNo += 1;
    const first = s.turns[0];
    const name = (first.user_id && nameMap[first.user_id]) || first.lead_name || 'Guest';
    const src = sourceLabel(first.source);
    const sessionHasIssue = s.turns.some((t) => t.error || !t.ai_response || !t.ai_response.trim());

    out.push(`## Session ${sNo}: ${name} (${src})${sessionHasIssue ? '  [NEEDS REVIEW]' : ''}`);
    out.push('');
    const metaLine = [`**${s.turns.length}** turn(s)`, fmtDay(first.created_at), '`' + s.sid + '`'];
    if (first.page_url) metaLine.push(`page: ${first.page_url}`);
    out.push(metaLine.join(' · '));
    out.push('');

    let tNo = 0;
    for (const t of s.turns) {
      tNo += 1;
      const needsReview = t.error || !t.ai_response || !t.ai_response.trim();
      out.push(`### Turn ${tNo} · ${fmt(t.created_at)} IST${needsReview ? '  `NEEDS REVIEW`' : ''}`);
      out.push('');
      out.push('**Student asked:**');
      out.push('');
      out.push(quote(t.user_message || '_(empty message)_'));
      out.push('');
      out.push('**Aintra answered:**');
      out.push('');
      out.push(t.ai_response && t.ai_response.trim() ? quote(t.ai_response) : '> _(no response generated)_');
      out.push('');
      const notes: string[] = [];
      if (t.error) notes.push(`**Error:** ${t.error}`);
      if (t.admin_correction) notes.push(`**Admin correction:** ${t.admin_correction}`);
      if (t.thumbs_up) notes.push('Marked as a good answer');
      if (t.promoted_to_kb) notes.push('Promoted to Aintra Knowledge Base');
      const tech: string[] = [];
      if (t.model_used) tech.push(`model: ${t.model_used}`);
      if (t.response_time_ms != null) tech.push(`${t.response_time_ms} ms`);
      if (tech.length) notes.push(`_${tech.join(' · ')}_`);
      if (notes.length) {
        for (const n of notes) out.push(n + '  ');
        out.push('');
      }
    }
    out.push('---');
    out.push('');
  }

  return out.join('\n');
}
