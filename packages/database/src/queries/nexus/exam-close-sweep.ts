/**
 * Which open exam papers the hourly close sweep should submit.
 *
 * A paper is due when THE STUDENT'S door has shut: their reopen, else their
 * make-up, else the exam's own window, decided by resolveExamWindowForStudent
 * exactly as the attempt route and submitAttempt decide it.
 *
 * The sweep used to list exams whose MAIN window closed in the last week and
 * submit every open attempt on their door. That cut a reopened student's live
 * sitting short at the next hourly run, and it never swept a reopened student
 * who walked away after their own window shut if the exam had closed more than
 * a week earlier.
 *
 * The week's lookback now applies to the student's own close. It bounds the
 * scan and means a paper abandoned long ago is not graded out of the blue.
 */
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { resolveExamWindowForStudent, type ExamMakeup } from './exams';
import { EXAM_SUBMIT_GRACE_MS } from './test-repository';

const LOOKBACK_MS = 7 * 86_400_000;

export interface ExamAttemptDueForClose {
  attemptId: string;
  studentId: string;
  examId: string;
  /** The close that applied to this student. */
  closesAt: string;
}

export async function listExamAttemptsDueForClose(
  client?: TypedSupabaseClient,
  now: number = Date.now(),
): Promise<ExamAttemptDueForClose[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: placements, error: pErr } = await supabase
    .from('nexus_test_placements')
    .select('id, context_id, gating, available_until')
    .eq('context_type', 'exam')
    .eq('is_active', true);
  if (pErr) throw pErr;
  const doors = (placements || []) as Array<{
    id: string;
    context_id: string | null;
    gating: { exam_id?: string } | null;
    available_until: string | null;
  }>;
  if (doors.length === 0) return [];

  const { data: attempts, error: aErr } = await supabase
    .from('nexus_test_attempts')
    .select('id, student_id, placement_id')
    .in('placement_id', doors.map((d) => d.id))
    .eq('status', 'in_progress');
  if (aErr) throw aErr;
  const open = (attempts || []) as Array<{ id: string; student_id: string; placement_id: string }>;
  if (open.length === 0) return [];

  const liveDoors = doors.filter((d) => open.some((a) => a.placement_id === d.id));
  const [examsById, examsByClass] = await loadExams(supabase, liveDoors);
  const examIds = [...new Set([...examsById.values()].map((e) => e.id))];

  const [{ data: makeups, error: mErr }, { data: grants, error: gErr }] = await Promise.all([
    examIds.length
      ? supabase.from('nexus_exam_makeups').select('*').in('exam_id', examIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('nexus_test_access_requests')
      .select('placement_id, student_id, status, opens_at, closes_at')
      .in('placement_id', liveDoors.map((d) => d.id))
      .eq('status', 'granted'),
  ]);
  if (mErr) throw mErr;
  if (gErr) throw gErr;

  const due: ExamAttemptDueForClose[] = [];
  for (const attempt of open) {
    const door = liveDoors.find((d) => d.id === attempt.placement_id)!;
    const exam =
      (door.gating?.exam_id ? examsById.get(door.gating.exam_id) : undefined) ??
      (door.context_id ? examsByClass.get(door.context_id) : undefined);
    if (!exam) continue;

    const makeup = ((makeups || []) as ExamMakeup[]).find(
      (m) => m.exam_id === exam.id && m.student_id === attempt.student_id,
    );
    const grant = ((grants || []) as any[]).find(
      (g) => g.placement_id === door.id && g.student_id === attempt.student_id,
    );
    const window = resolveExamWindowForStudent(exam, makeup ?? null, grant ?? null);

    const closesAt = Date.parse(window.closes_at);
    if (!Number.isFinite(closesAt)) continue;
    const shut = now > closesAt + EXAM_SUBMIT_GRACE_MS;
    const recent = closesAt > now - LOOKBACK_MS;
    if (shut && recent) {
      due.push({ attemptId: attempt.id, studentId: attempt.student_id, examId: exam.id, closesAt: window.closes_at });
    }
  }
  return due;
}

type ExamWindowRow = { id: string; scheduled_class_id: string | null; opens_at: string; closes_at: string };

async function loadExams(
  supabase: any,
  doors: Array<{ context_id: string | null; gating: { exam_id?: string } | null }>,
): Promise<[Map<string, ExamWindowRow>, Map<string, ExamWindowRow>]> {
  const ids = [...new Set(doors.map((d) => d.gating?.exam_id).filter(Boolean))] as string[];
  const classIds = [...new Set(doors.map((d) => d.context_id).filter(Boolean))] as string[];

  const [byId, byClass] = await Promise.all([
    ids.length
      ? supabase.from('nexus_exams').select('id, scheduled_class_id, opens_at, closes_at').in('id', ids)
      : Promise.resolve({ data: [], error: null }),
    classIds.length
      ? supabase.from('nexus_exams').select('id, scheduled_class_id, opens_at, closes_at').in('scheduled_class_id', classIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (byId.error) throw byId.error;
  if (byClass.error) throw byClass.error;

  const idMap = new Map<string, ExamWindowRow>();
  const classMap = new Map<string, ExamWindowRow>();
  for (const e of [...(byId.data || []), ...(byClass.data || [])] as ExamWindowRow[]) {
    idMap.set(e.id, e);
    if (e.scheduled_class_id) classMap.set(e.scheduled_class_id, e);
  }
  return [idMap, classMap];
}
