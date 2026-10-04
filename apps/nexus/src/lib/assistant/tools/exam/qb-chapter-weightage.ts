import { getCachedQBWeightage } from '@/lib/qb-weightage-cache';
import { SECTION_LABELS, availableSections, buildSectionWeightage, chapterReason, topChapters, type WeightageSection } from '@/lib/qb-weightage';
import type { ToolDef } from '@/lib/assistant/types';
import { EXAM_LABEL, EXAM_PARAM, NO_EXAM, readExam, weightageLink } from './shared';

export const qbChapterWeightage: ToolDef = {
  name: 'qb_chapter_weightage',
  description: 'Which chapters past papers of an exam asked most, per section, from the Neram question bank. Use for "which chapters are important" or "how many questions come from a chapter".',
  parameters: {
    type: 'object',
    properties: { exam: EXAM_PARAM, section: { type: 'string', enum: ['math', 'aptitude', 'drawing', 'planning'] } },
    required: ['exam'],
  },
  audience: 'student', kind: 'read', mode: 'exam', feature: 'questionBank',
  async run(_ctx, args) {
    const exam = readExam(args.exam);
    if (!exam) return NO_EXAM;
    const payload = await getCachedQBWeightage(exam);
    const wanted = typeof args.section === 'string' ? args.section : null;
    const sections = availableSections(payload)
      .filter((s) => !wanted || s === wanted)
      .map((s: WeightageSection) => {
        const w = buildSectionWeightage(payload, s, 'all');
        if (!w) return null;
        return { section: SECTION_LABELS[s], years: w.countedYears, chapters: topChapters(w, 10).map((c) => ({ chapter: c.label, why: chapterReason(c, 'all') })) };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
    const links = [weightageLink(exam)];
    if (sections.length === 0) return { ok: true, reply: `The question bank does not have enough past papers for ${EXAM_LABEL[exam]} yet.`, data: [], links };
    return { ok: true, data: { exam: EXAM_LABEL[exam], sections }, links };
  },
};
