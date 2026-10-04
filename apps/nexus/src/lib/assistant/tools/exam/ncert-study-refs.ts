import { getQBQuestionStudyView } from '@neram/database/queries/nexus';
import { baseIdOf } from '@/lib/practice-atoms';
import { isUuid } from '@/lib/assistant/ids';
import type { ToolDef } from '@/lib/assistant/types';
import { questionUrl } from './shared';

export const ncertStudyRefs: ToolDef = {
  name: 'ncert_study_refs',
  description: 'The chapter and NCERT readings behind one question bank question, and the concepts it uses. Use when the student asks what to read for a question.',
  parameters: { type: 'object', properties: { question_id: { type: 'string' } }, required: ['question_id'] },
  audience: 'student', kind: 'read', mode: 'exam', feature: 'questionBank',
  async run(ctx, args) {
    const id = baseIdOf(typeof args.question_id === 'string' ? args.question_id : '') ?? '';
    if (!isUuid(id)) return { ok: false, error: 'Open the question in the question bank and ask me there, so I know which one you mean.' };
    const { data: q } = await ctx.supabase.from('nexus_qb_questions').select('id, categories, is_active, status').eq('id', id).maybeSingle();
    if (!q || q.is_active === false || q.status !== 'active') return { ok: false, error: 'I could not find that question.' };
    const view = await getQBQuestionStudyView(id, q.categories);
    if (!view?.primary) return { ok: true, reply: 'There are no study references for that question yet.', data: null, links: [{ label: 'Open the question', url: questionUrl(id) }] };
    return {
      ok: true,
      data: {
        chapter: view.primary.label,
        ncert: view.primary.ncert.slice(0, 3).map((r) => ({ book: `Class ${r.class_level}, chapter ${r.chapter_no}: ${r.chapter_title}`, section: r.section_title, url: r.url })),
        also_uses: view.also_uses.map((c) => c.label),
        concepts: view.concepts.map((c) => c.name),
      },
      links: [{ label: 'Open the question', url: questionUrl(id) }],
    };
  },
};
