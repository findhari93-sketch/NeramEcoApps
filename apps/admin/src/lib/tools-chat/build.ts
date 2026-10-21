/**
 * Admin > Aintra Inbox > Tools chat: what students ask Aintra (Tools app) (the chat
 * in the Tools app), built from ask_messages rows. Pure, so the numbers are
 * unit-tested; the route only loads rows and users.
 *
 * A "gated" question is one a guest asked after their free answers for the day
 * (logged with error SIGNUP_REQUIRED, never answered). A "failed" answer is an
 * assistant row with any other error.
 */

export interface ToolsChatRow {
  id: string;
  thread_id: string;
  user_id: string | null;
  anon_id: string | null;
  role: 'user' | 'assistant';
  text: string;
  cards: unknown[];
  tool_calls: Array<{ name: string; args?: unknown; ok: boolean; ms?: number }> | null;
  error: string | null;
  response_ms: number | null;
  created_at: string;
}

export interface ToolsChatThread {
  id: string;
  userId: string | null;
  anonId: string | null;
  /** The first question, as the thread's title. */
  firstQuestion: string;
  lastQuestion: string;
  questions: number;
  answers: number;
  failed: number;
  gated: number;
  tools: string[];
  startedAt: string;
  lastAt: string;
}

export interface ToolsChatStats {
  threads: number;
  questions: number;
  answers: number;
  signedInThreads: number;
  guestThreads: number;
  gatedQuestions: number;
  failedAnswers: number;
  /** Median answer time in ms, null when no answer had a time. */
  medianMs: number | null;
}

export interface ToolUse {
  name: string;
  calls: number;
  failed: number;
}

export interface ToolsChatView {
  stats: ToolsChatStats;
  threads: ToolsChatThread[];
  tools: ToolUse[];
  /** What the chat had to ask for, by how often (from missing_input tool results). */
  missing: Array<{ name: string; count: number }>;
}

export const SIGNUP_REQUIRED = 'SIGNUP_REQUIRED';

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export function buildToolsChat(rows: ToolsChatRow[]): ToolsChatView {
  const byThread = new Map<string, ToolsChatRow[]>();
  for (const r of rows) {
    const list = byThread.get(r.thread_id) ?? [];
    list.push(r);
    byThread.set(r.thread_id, list);
  }

  const toolMap = new Map<string, ToolUse>();
  const missing = new Map<string, number>();
  const times: number[] = [];
  const threads: ToolsChatThread[] = [];

  for (const [id, list] of byThread) {
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const asked = sorted.filter((r) => r.role === 'user');
    const answered = sorted.filter((r) => r.role === 'assistant');
    const tools = new Set<string>();
    for (const a of answered) {
      if (a.response_ms != null && !a.error) times.push(a.response_ms);
      for (const t of a.tool_calls ?? []) {
        tools.add(t.name);
        const use = toolMap.get(t.name) ?? { name: t.name, calls: 0, failed: 0 };
        use.calls += 1;
        if (!t.ok) use.failed += 1;
        toolMap.set(t.name, use);
      }
    }
    const owner = sorted.find((r) => r.user_id) ?? sorted[0];
    threads.push({
      id,
      userId: owner.user_id,
      anonId: owner.user_id ? null : owner.anon_id,
      firstQuestion: asked[0]?.text ?? '',
      lastQuestion: asked[asked.length - 1]?.text ?? '',
      questions: asked.length,
      answers: answered.filter((a) => !a.error).length,
      failed: answered.filter((a) => a.error && a.error !== SIGNUP_REQUIRED).length,
      gated: asked.filter((q) => q.error === SIGNUP_REQUIRED).length,
      tools: [...tools],
      startedAt: sorted[0].created_at,
      lastAt: sorted[sorted.length - 1].created_at,
    });
  }

  // "missing_input" results carry what the chat had to ask for. They are in the
  // tool args the route logged, so count the asks by tool name.
  for (const r of rows) {
    if (r.role !== 'assistant') continue;
    for (const t of r.tool_calls ?? []) if (!t.ok) missing.set(t.name, (missing.get(t.name) ?? 0) + 1);
  }

  threads.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const stats: ToolsChatStats = {
    threads: threads.length,
    questions: threads.reduce((n, t) => n + t.questions, 0),
    answers: threads.reduce((n, t) => n + t.answers, 0),
    signedInThreads: threads.filter((t) => t.userId).length,
    guestThreads: threads.filter((t) => !t.userId).length,
    gatedQuestions: threads.reduce((n, t) => n + t.gated, 0),
    failedAnswers: threads.reduce((n, t) => n + t.failed, 0),
    medianMs: median(times),
  };
  return {
    stats,
    threads,
    tools: [...toolMap.values()].sort((a, b) => b.calls - a.calls),
    missing: [...missing.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

/** Plain names for the tools, as staff read them. */
export const TOOL_LABELS: Record<string, string> = {
  calculate_cutoff: 'Cutoff',
  predict_colleges: 'Colleges',
  predict_rank: 'Rank',
  find_exam_centres: 'Exam centres',
  check_coa_approval: 'COA check',
  estimate_cost: 'Cost',
  check_eligibility: 'Eligibility',
  exam_dates: 'Exam dates',
  save_my_details: 'Saved details',
  open_tool: 'Tool link',
  get_my_account: 'My account',
  get_my_fees: 'My fees',
  prepare_ticket: 'Support ticket',
  prepare_exam_year: 'Exam year',
  get_saved_colleges: 'Saved colleges',
  get_notifications: 'Notifications',
};

export const toolLabel = (name: string) => TOOL_LABELS[name] ?? name;
