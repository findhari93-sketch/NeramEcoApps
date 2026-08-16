/**
 * I/O for exam eligibility: which class(es) an exam covers, and the batched
 * facts (roster, attendance, catch-up, teacher overrides) the pure engine in
 * apps/nexus/src/lib/exam-eligibility-roster.ts turns into a per-student
 * bucket. See that file for the actual decision rules.
 *
 * Every read here is batched across the whole roster in ONE query, never one
 * query per student or per covered class -- this runs on the "who is this
 * mandatory for" preview inside ExamScheduleDialog, which has to stay fast
 * enough to feel live as a teacher ticks classes on and off.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { loadClassroomRoster, type RosterMember } from './roster';

const COVERED = 'nexus_exam_covered_classes' as any;
const OVERRIDES = 'nexus_exam_eligibility_overrides' as any;
const CLASSES = 'nexus_scheduled_classes' as any;
const ATTENDANCE = 'nexus_attendance' as any;
const ABSENCES = 'nexus_class_absences' as any;

export interface CoveredClass {
  id: string;
  title: string | null;
  scheduled_date: string;
}

export interface EligibilityOverride {
  override: 'mandatory' | 'excused';
  note: string | null;
  set_by: string | null;
  set_at: string;
}

export interface EligibilityAbsenceFacts {
  kind: string;
  caught_up_at: string | null;
  excused_at: string | null;
}

export interface EligibilityRosterStudent {
  student_id: string;
  name: string | null;
  avatar_url: string | null;
  enrolled_at: string;
}

/**
 * Replace-all, same "retire the set, insert the new one" shape as
 * upsertExamPlacement in exams.ts. `scheduledClassIds` must already have been
 * validated (by the caller) to belong to the exam's own classroom and to be
 * `kind = 'lecture'` rows -- this function does the validation itself as a
 * second belt, since it is cheap and the consequence of skipping it (linking
 * a test to another exam, or to a different classroom's class) is confusing
 * enough to be worth double-checking.
 */
export async function linkExamToClasses(
  examId: string,
  classroomId: string,
  scheduledClassIds: string[],
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const ids = [...new Set(scheduledClassIds.filter(Boolean))];

  await supabase.from(COVERED).delete().eq('exam_id', examId);
  if (ids.length === 0) return;

  const { data: validClasses, error: validateErr } = await supabase
    .from(CLASSES)
    .select('id')
    .eq('classroom_id', classroomId)
    .eq('kind', 'lecture')
    .in('id', ids);
  if (validateErr) throw validateErr;

  const validIds = new Set(((validClasses || []) as any[]).map((c) => c.id));
  const rows = ids.filter((id) => validIds.has(id)).map((scheduled_class_id) => ({
    exam_id: examId,
    scheduled_class_id,
  }));
  if (rows.length === 0) return;

  const { error } = await supabase.from(COVERED).insert(rows);
  if (error) throw error;
}

export async function listCoveredClasses(
  examId: string,
  client?: TypedSupabaseClient,
): Promise<CoveredClass[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(COVERED)
    .select('scheduled_class_id, class:nexus_scheduled_classes(id, title, scheduled_date)')
    .eq('exam_id', examId);
  if (error) throw error;
  return ((data || []) as any[])
    .map((row) => row.class)
    .filter(Boolean)
    .map((c: any) => ({ id: c.id, title: c.title ?? null, scheduled_date: c.scheduled_date }));
}

export async function getExamEligibilityOverrides(
  examId: string,
  client?: TypedSupabaseClient,
): Promise<Map<string, EligibilityOverride>> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(OVERRIDES)
    .select('student_id, override, note, set_by, set_at')
    .eq('exam_id', examId);
  if (error) throw error;
  const map = new Map<string, EligibilityOverride>();
  for (const row of (data || []) as any[]) {
    map.set(row.student_id, {
      override: row.override,
      note: row.note ?? null,
      set_by: row.set_by ?? null,
      set_at: row.set_at,
    });
  }
  return map;
}

export async function setExamEligibilityOverride(
  examId: string,
  studentId: string,
  override: 'mandatory' | 'excused',
  note: string | null,
  setBy: string | null,
  client?: TypedSupabaseClient,
): Promise<EligibilityOverride> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(OVERRIDES)
    .upsert(
      {
        exam_id: examId,
        student_id: studentId,
        override,
        note,
        set_by: setBy,
        set_at: new Date().toISOString(),
      },
      { onConflict: 'exam_id,student_id' },
    )
    .select('override, note, set_by, set_at')
    .single();
  if (error) throw error;
  const row = data as any;
  return { override: row.override, note: row.note ?? null, set_by: row.set_by ?? null, set_at: row.set_at };
}

export async function clearExamEligibilityOverride(
  examId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(OVERRIDES).delete().eq('exam_id', examId).eq('student_id', studentId);
  if (error) throw error;
}

function toRosterStudents(members: RosterMember[]): EligibilityRosterStudent[] {
  // id, name and avatar_url are already in loadClassroomRoster's
  // BASE_USER_COLUMNS -- no userColumns override needed. `name` is the real
  // display column on users; there is no full_name (see exam-access.ts's
  // loadExamRoster and test-analytics.ts, which both hit and documented this
  // exact PostgREST-rejects-the-whole-request trap already).
  return members
    .map((m: any) => ({
      student_id: m.user?.id ?? m.user_id,
      name: m.user?.name || 'Student',
      avatar_url: m.user?.avatar_url ?? null,
      enrolled_at: m.enrolled_at,
    }))
    .filter((s) => Boolean(s.student_id));
}

async function loadAttendanceAndAbsences(
  studentIds: string[],
  coveredClassIds: string[],
  supabase: TypedSupabaseClient,
): Promise<{
  attendance: Map<string, Map<string, boolean>>;
  absences: Map<string, Map<string, EligibilityAbsenceFacts>>;
}> {
  const attendance = new Map<string, Map<string, boolean>>();
  const absences = new Map<string, Map<string, EligibilityAbsenceFacts>>();
  if (coveredClassIds.length === 0 || studentIds.length === 0) return { attendance, absences };

  const [{ data: attRows, error: attErr }, { data: absRows, error: absErr }] = await Promise.all([
    (supabase as any)
      .from(ATTENDANCE)
      .select('student_id, scheduled_class_id, attended')
      .in('scheduled_class_id', coveredClassIds)
      .in('student_id', studentIds),
    (supabase as any)
      .from(ABSENCES)
      .select('student_id, scheduled_class_id, kind, caught_up_at, excused_at')
      .in('scheduled_class_id', coveredClassIds)
      .in('student_id', studentIds),
  ]);
  if (attErr) throw attErr;
  if (absErr) throw absErr;

  for (const row of (attRows || []) as any[]) {
    const byClass = attendance.get(row.student_id) || new Map<string, boolean>();
    byClass.set(row.scheduled_class_id, Boolean(row.attended));
    attendance.set(row.student_id, byClass);
  }
  for (const row of (absRows || []) as any[]) {
    const byClass = absences.get(row.student_id) || new Map<string, EligibilityAbsenceFacts>();
    byClass.set(row.scheduled_class_id, {
      kind: row.kind,
      caught_up_at: row.caught_up_at ?? null,
      excused_at: row.excused_at ?? null,
    });
    absences.set(row.student_id, byClass);
  }
  return { attendance, absences };
}

export interface ExamEligibilityFacts {
  classroom_id: string;
  coveredClasses: CoveredClass[];
  students: EligibilityRosterStudent[];
  attendance: Map<string, Map<string, boolean>>;
  absences: Map<string, Map<string, EligibilityAbsenceFacts>>;
  overrides: Map<string, EligibilityOverride>;
}

/** Everything the pure roster builder needs for an EXISTING exam, batched. */
export async function loadExamEligibilityFacts(
  examId: string,
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<ExamEligibilityFacts> {
  const supabase = client || getSupabaseAdminClient();

  const [coveredClasses, roster, overrides] = await Promise.all([
    listCoveredClasses(examId, supabase),
    loadClassroomRoster(classroomId, { includeDormant: true, client: supabase }),
    getExamEligibilityOverrides(examId, supabase),
  ]);

  const students = toRosterStudents(roster.members as any);
  const { attendance, absences } = await loadAttendanceAndAbsences(
    students.map((s) => s.student_id),
    coveredClasses.map((c) => c.id),
    supabase,
  );

  return { classroom_id: classroomId, coveredClasses, students, attendance, absences, overrides };
}

/**
 * Same shape as loadExamEligibilityFacts, but for the dialog's PREVIEW: the
 * exam does not exist yet, so `coveredClasses` is passed in directly (as
 * candidate ids the teacher has ticked) and there can be no overrides yet.
 */
export async function loadEligibilityFactsForPreview(
  classroomId: string,
  scheduledClassIds: string[],
  client?: TypedSupabaseClient,
): Promise<Omit<ExamEligibilityFacts, 'overrides'>> {
  const supabase = client || getSupabaseAdminClient();
  const ids = [...new Set(scheduledClassIds.filter(Boolean))];

  const [{ data: classRows, error: classErr }, roster] = await Promise.all([
    ids.length > 0
      ? (supabase as any)
          .from(CLASSES)
          .select('id, title, scheduled_date')
          .eq('classroom_id', classroomId)
          .eq('kind', 'lecture')
          .in('id', ids)
      : Promise.resolve({ data: [], error: null }),
    loadClassroomRoster(classroomId, { includeDormant: true, client: supabase }),
  ]);
  if (classErr) throw classErr;

  const coveredClasses: CoveredClass[] = ((classRows || []) as any[]).map((c) => ({
    id: c.id,
    title: c.title ?? null,
    scheduled_date: c.scheduled_date,
  }));

  const students = toRosterStudents(roster.members as any);
  const { attendance, absences } = await loadAttendanceAndAbsences(
    students.map((s) => s.student_id),
    coveredClasses.map((c) => c.id),
    supabase,
  );

  return { classroom_id: classroomId, coveredClasses, students, attendance, absences };
}

export interface StudentExamFacts {
  /** examId -> the lecture(s) that exam covers. Empty list = mandatory for everyone. */
  coveredClassesByExam: Map<string, CoveredClass[]>;
  /** studentId -> scheduledClassId -> attended -- same shape as ExamEligibilityFacts, one student. */
  attendance: Map<string, Map<string, boolean>>;
  absences: Map<string, Map<string, EligibilityAbsenceFacts>>;
  /** examId -> this student's own override, if any. */
  overrides: Map<string, EligibilityOverride>;
}

/**
 * One student's eligibility facts across MANY exams, batched -- for their own
 * Tests tab, which must never run one eligibility query per exam card. Three
 * queries total regardless of how many exams the classroom has run.
 */
export async function loadStudentExamFacts(
  studentId: string,
  examIds: string[],
  client?: TypedSupabaseClient,
): Promise<StudentExamFacts> {
  const supabase = client || getSupabaseAdminClient();
  const ids = [...new Set(examIds.filter(Boolean))];

  const coveredClassesByExam = new Map<string, CoveredClass[]>();
  if (ids.length === 0) {
    return { coveredClassesByExam, attendance: new Map(), absences: new Map(), overrides: new Map() };
  }

  const [{ data: coveredRows, error: coveredErr }, { data: overrideRows, error: overrideErr }] = await Promise.all([
    (supabase as any)
      .from(COVERED)
      .select('exam_id, class:nexus_scheduled_classes(id, title, scheduled_date)')
      .in('exam_id', ids),
    (supabase as any)
      .from(OVERRIDES)
      .select('exam_id, override, note, set_by, set_at')
      .in('exam_id', ids)
      .eq('student_id', studentId),
  ]);
  if (coveredErr) throw coveredErr;
  if (overrideErr) throw overrideErr;

  const allClassIds = new Set<string>();
  for (const row of (coveredRows || []) as any[]) {
    if (!row.class) continue;
    const list = coveredClassesByExam.get(row.exam_id) || [];
    list.push({ id: row.class.id, title: row.class.title ?? null, scheduled_date: row.class.scheduled_date });
    coveredClassesByExam.set(row.exam_id, list);
    allClassIds.add(row.class.id);
  }

  const overrides = new Map<string, EligibilityOverride>();
  for (const row of (overrideRows || []) as any[]) {
    overrides.set(row.exam_id, {
      override: row.override,
      note: row.note ?? null,
      set_by: row.set_by ?? null,
      set_at: row.set_at,
    });
  }

  const { attendance, absences } = await loadAttendanceAndAbsences([studentId], [...allClassIds], supabase);

  return { coveredClassesByExam, attendance, absences, overrides };
}
