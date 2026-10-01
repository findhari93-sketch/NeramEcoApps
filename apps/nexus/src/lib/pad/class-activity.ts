/**
 * How active each student was in the Answer Pad during one class, from the
 * stored round results (pad_round_results). Read by the class insights, so the
 * attendance panel can show "Pad 14 of 18" beside the minutes a student was in
 * the meeting, and flag a student who was there but hardly answered.
 *
 * Every round of the class counts, published or not: this is the teacher's
 * view. Students never see it.
 */

export interface StoredRoundResult {
  session_id: string;
  student_id: string;
  questions: number;
  attempted: number;
  correct: number;
  not_active: boolean;
}

export interface StudentPadActivity {
  /** Rounds they joined in this class. */
  rounds: number;
  /** Graded questions counted for them, across those rounds. */
  questions: number;
  attempted: number;
  correct: number;
  /** Answered under half the questions they were in the pad for, over the whole class. */
  notActive: boolean;
}

export interface ClassPadActivity {
  rounds: number;
  /** Students who opened the pad in any round. */
  joined: number;
  /** Of those, how many attempted at least one graded question. */
  answered: number;
  byStudent: Map<string, StudentPadActivity>;
}

export const NO_PAD_ACTIVITY: ClassPadActivity = { rounds: 0, joined: 0, answered: 0, byStudent: new Map() };

export function foldPadActivity(rows: readonly StoredRoundResult[]): ClassPadActivity {
  const sessions = new Set<string>();
  const byStudent = new Map<string, StudentPadActivity & { quietRounds: number }>();
  for (const row of rows) {
    sessions.add(row.session_id);
    const current = byStudent.get(row.student_id) ?? { rounds: 0, questions: 0, attempted: 0, correct: 0, notActive: false, quietRounds: 0 };
    current.rounds += 1;
    current.questions += row.questions;
    current.attempted += row.attempted;
    current.correct += row.correct;
    if (row.not_active) current.quietRounds += 1;
    byStudent.set(row.student_id, current);
  }

  const out = new Map<string, StudentPadActivity>();
  let answered = 0;
  for (const [id, { quietRounds, ...activity }] of byStudent) {
    // Quiet in most of the rounds they joined, not just one slow start.
    activity.notActive = quietRounds * 2 > activity.rounds;
    if (activity.attempted > 0) answered += 1;
    out.set(id, activity);
  }
  return { rounds: sessions.size, joined: out.size, answered, byStudent: out };
}

/** "Pad 14 of 18": attempted out of the questions counted for them. */
export function padChipLabel(activity: Pick<StudentPadActivity, 'attempted' | 'questions'>): string {
  return `Pad ${activity.attempted} of ${activity.questions}`;
}

export async function loadClassPadActivity(supabase: any, classId: string): Promise<ClassPadActivity> {
  const { data, error } = await supabase
    .from('pad_round_results')
    .select('session_id, student_id, questions, attempted, correct, not_active')
    .eq('scheduled_class_id', classId);
  if (error) throw error;
  return foldPadActivity((data ?? []) as StoredRoundResult[]);
}
