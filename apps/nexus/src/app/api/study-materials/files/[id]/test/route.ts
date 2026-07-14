import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
  getTestWithQuestionsForStaff,
  getTestForStudent,
  upsertTestWithQuestions,
  deleteTestForFile,
} from '@neram/database';
import { getRequestUser, isStaff, assertStaff, getStudentExamSet } from '@/lib/study-materials';
import type { NexusStudyTestQuestionInput } from '@neram/database/types';

/**
 * Per-file test.
 *   GET    -> staff: full test + questions (with answers) for authoring/preview;
 *             student: student-safe test (no answers) for taking. 404 when none.
 *   POST   -> staff: create/replace the test. Body { title?, passingPct, questions[] }.
 *   DELETE -> staff: remove the test.
 */

async function assertStudentCanSee(userId: string, studentProgram: string | null, fileId: string) {
  const file = await getFileById(fileId);
  if (!file) throw new Error('File not found');
  const folder = await getFolderById(file.folder_id);
  if (!folder) throw new Error('File not found');
  const exams = await getStudentExamSet(userId);
  if (!isFolderVisibleToStudent(folder, exams, studentProgram)) throw new Error('Not authorized');
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (isStaff(user)) {
      const test = await getTestWithQuestionsForStaff(params.id);
      return NextResponse.json({ test });
    }
    await assertStudentCanSee(user.id, user.student_program, params.id);
    const test = await getTestForStudent(params.id);
    return NextResponse.json({ test });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load test';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json();
    const rawQuestions = Array.isArray(body?.questions) ? body.questions : [];
    // Validate + normalise each question (needs a stem, 2+ options, and a correct option present).
    const questions: NexusStudyTestQuestionInput[] = [];
    for (const q of rawQuestions) {
      const correct = String(q?.correct_option || '').toLowerCase();
      const opt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      const a = opt(q?.option_a);
      const b = opt(q?.option_b);
      const c = opt(q?.option_c);
      const d = opt(q?.option_d);
      const text = opt(q?.question_text);
      if (!text || !a || !b || !['a', 'b', 'c', 'd'].includes(correct)) continue;
      if (correct === 'c' && !c) continue;
      if (correct === 'd' && !d) continue;
      questions.push({
        question_text: text,
        option_a: a,
        option_b: b,
        option_c: c,
        option_d: d,
        correct_option: correct as 'a' | 'b' | 'c' | 'd',
        explanation: opt(q?.explanation),
      });
    }
    if (questions.length === 0) {
      return NextResponse.json({ error: 'Add at least one valid question.' }, { status: 400 });
    }

    const passingPct = Number(body?.passingPct);
    const result = await upsertTestWithQuestions({
      fileId: params.id,
      title: typeof body?.title === 'string' ? body.title.trim() || null : null,
      passingPct: Number.isFinite(passingPct) ? passingPct : 70,
      questions,
      createdBy: user.id,
    });
    return NextResponse.json({ test: { id: result.id, question_count: questions.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save test';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    await deleteTestForFile(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete test';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
