import type { QBExamType } from '@neram/database';
import type { ToolResult } from '@/lib/assistant/types';

/** Inlined, not read from lib/qb-exam-routes.ts, which imports React (as the weightage route does). */
export const QB_EXAMS: readonly QBExamType[] = ['JEE_PAPER_2', 'JEE_PAPER_2B', 'NATA'];
export const EXAM_SLUG: Record<QBExamType, string> = { JEE_PAPER_2: 'jee-paper-2', JEE_PAPER_2B: 'jee-paper-2b', NATA: 'nata' };
export const EXAM_LABEL: Record<QBExamType, string> = { JEE_PAPER_2: 'JEE Paper 2A (B.Arch)', JEE_PAPER_2B: 'JEE Paper 2B (B.Planning)', NATA: 'NATA' };

export const EXAM_PARAM = {
  type: 'string',
  enum: [...QB_EXAMS],
  description: 'JEE_PAPER_2 is JEE Main Paper 2A (B.Arch), JEE_PAPER_2B is Paper 2B (B.Planning), NATA is NATA.',
};

export function readExam(v: unknown): QBExamType | null {
  return QB_EXAMS.includes(v as QBExamType) ? (v as QBExamType) : null;
}

export const NO_EXAM: ToolResult = { ok: false, error: 'Say which exam: NATA, JEE Paper 2A or JEE Paper 2B.' };

export const weightageLink = (exam: QBExamType) => ({ label: 'Chapter weightage', url: `/student/question-bank/${EXAM_SLUG[exam]}/weightage` });
export const questionUrl = (id: string) => `/student/question-bank/questions/${id}`;
