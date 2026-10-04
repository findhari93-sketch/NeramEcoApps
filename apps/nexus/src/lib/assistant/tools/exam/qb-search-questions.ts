import { orderByIds, searchQBQuestionIds } from '@neram/database/queries/nexus';
import type { ToolDef } from '@/lib/assistant/types';
import { EXAM_LABEL, EXAM_PARAM, questionUrl, readExam } from './shared';

export const qbSearchQuestions: ToolDef = {
  name: 'qb_search_questions',
  description: 'Search past exam questions in the Neram question bank by words or topic. Returns up to five questions with the paper and year they came from, never the answers.',
  parameters: { type: 'object', properties: { query: { type: 'string' }, exam: EXAM_PARAM }, required: ['query'] },
  audience: 'student', kind: 'read', mode: 'exam', feature: 'questionBank',
  async run(ctx, args) {
    const query = typeof args.query === 'string' ? args.query.trim().slice(0, 200) : '';
    if (!query) return { ok: false, error: 'Tell me what to search for.' };
    const exam = readExam(args.exam);
    const filters = exam ? { exam_relevance: exam === 'NATA' ? ('NATA' as const) : ('JEE' as const) } : {};
    const page = await searchQBQuestionIds(ctx.supabase, filters, { query, role: 'student', onlyActive: true, limit: 5, offset: 0 });
    if (page.ids.length === 0) return { ok: true, reply: `No past questions matched "${query}".`, data: [] };
    const [{ data: rows }, { data: sources }] = await Promise.all([
      // No options, no key, no explanation: this list is read before the student answers.
      ctx.supabase.from('nexus_qb_questions').select('id, question_text, section').in('id', page.ids).eq('is_active', true).eq('status', 'active'),
      ctx.supabase.from('nexus_qb_question_sources').select('question_id, exam_type, year').in('question_id', page.ids),
    ]);
    const ordered = orderByIds((rows || []) as Array<{ id: string; question_text: string | null; section: string | null }>, page.ids);
    const data = ordered.map((q) => ({
      question_id: q.id,
      text: String(q.question_text || '').slice(0, 300),
      section: q.section,
      asked_in: ((sources || []) as Array<{ question_id: string; exam_type: keyof typeof EXAM_LABEL; year: number }>)
        .filter((s) => s.question_id === q.id)
        .map((s) => `${s.exam_type === 'NATA' ? 'NATA' : EXAM_LABEL[s.exam_type] ?? s.exam_type} ${s.year}`),
    }));
    return { ok: true, data, links: ordered.slice(0, 3).map((q, i) => ({ label: `Question ${i + 1}`, url: questionUrl(q.id) })) };
  },
};
