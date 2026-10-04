import { getQBStudyCatalog, studyChapterFor } from '@neram/database/queries/nexus';
import { getCachedQBWeightage } from '@/lib/qb-weightage-cache';
import { buildSectionWeightage, chapterReason, topChapters } from '@/lib/qb-weightage';
import type { ToolDef } from '@/lib/assistant/types';
import { EXAM_LABEL, EXAM_PARAM, NO_EXAM, readExam, weightageLink } from './shared';

export const whatToStudy: ToolDef = {
  name: 'what_to_study',
  description: 'The maths chapters an exam asks most, each with its NCERT chapter to read first. Use for "what should I study" or "where do I start in maths".',
  parameters: { type: 'object', properties: { exam: EXAM_PARAM }, required: ['exam'] },
  audience: 'student', kind: 'read', mode: 'exam', feature: 'questionBank',
  async run(_ctx, args) {
    const exam = readExam(args.exam);
    if (!exam) return NO_EXAM;
    const section = buildSectionWeightage(await getCachedQBWeightage(exam), 'math', 'all');
    const links = [weightageLink(exam)];
    if (!section) return { ok: true, reply: `The question bank does not have enough past ${EXAM_LABEL[exam]} maths papers yet.`, data: [], links };
    const catalog = await getQBStudyCatalog();
    const chapters = topChapters(section, 5).map((c) => ({
      chapter: c.label,
      why: chapterReason(c, 'all'),
      ncert: studyChapterFor(c.slug, catalog).ncert.slice(0, 3).map((r) => ({
        book: `Class ${r.class_level}, chapter ${r.chapter_no}: ${r.chapter_title}`,
        section: r.section_title,
        url: r.url,
      })),
    }));
    return { ok: true, data: { exam: EXAM_LABEL[exam], chapters }, links };
  },
};
