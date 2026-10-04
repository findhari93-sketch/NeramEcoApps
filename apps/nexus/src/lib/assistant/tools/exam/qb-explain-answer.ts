import { baseIdOf } from '@/lib/practice-atoms';
import { isUuid } from '@/lib/assistant/ids';
import type { ToolDef } from '@/lib/assistant/types';
import { questionUrl } from './shared';

type Option = { id?: string | null; text?: string | null; is_correct?: boolean };

/**
 * One bank question for the model to explain. The answer key and stored
 * explanation are given only once this student has answered the question in
 * the bank, and never while one of their tests is open (D3): the bank itself
 * strips answers before a student answers. The caller's attempts decide which;
 * nothing about them is returned.
 */
export const qbExplainAnswer: ToolDef = {
  name: 'qb_explain_answer',
  description: 'Load one question from the Neram question bank by its id so you can explain it. Returns the question and options, plus the stored answer key and explanation when the student may see them; otherwise hint_only.',
  parameters: { type: 'object', properties: { question_id: { type: 'string' } }, required: ['question_id'] },
  audience: 'student', kind: 'read', mode: 'exam', feature: 'questionBank',
  async run(ctx, args) {
    const id = baseIdOf(typeof args.question_id === 'string' ? args.question_id : '') ?? '';
    if (!isUuid(id)) return { ok: false, error: 'Open the question in the question bank and ask me there, so I know which one you mean.' };
    const [{ data: q }, { data: openTests }, { data: tried }] = await Promise.all([
      ctx.supabase.from('nexus_qb_questions').select('id, question_text, options, correct_answer, explanation_brief, explanation_detailed, is_active, status').eq('id', id).maybeSingle(),
      ctx.supabase.from('nexus_test_attempts').select('id').eq('student_id', ctx.caller.id).eq('status', 'in_progress').limit(1),
      ctx.supabase.from('nexus_qb_student_attempts').select('question_id').eq('student_id', ctx.caller.id).eq('question_id', id).limit(1),
    ]);
    if (!q || q.is_active === false || q.status !== 'active') return { ok: false, error: 'I could not find that question.' };
    if ((openTests || []).length > 0) {
      return { ok: true, reply: 'Finish the test you have open first. I can explain questions after you submit it.', data: { refused: 'test_in_progress' } };
    }
    const raw: Option[] = Array.isArray(q.options) ? q.options : [];
    const options = raw.map((o) => ({ id: o?.id ?? null, text: o?.text ?? '' }));
    const links = [{ label: 'Open the question', url: questionUrl(id) }];
    if ((tried || []).length === 0) return { ok: true, data: { hint_only: true, question: q.question_text, options }, links };
    return {
      ok: true,
      data: {
        question: q.question_text,
        options,
        correct_options: raw.filter((o) => o?.is_correct).map((o) => o.id ?? null),
        correct_answer: q.correct_answer ?? null,
        explanation: q.explanation_detailed || q.explanation_brief || null,
      },
      links,
    };
  },
};
