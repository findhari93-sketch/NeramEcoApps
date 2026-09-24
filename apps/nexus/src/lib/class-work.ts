/**
 * The work a class set, and who has handed it in.
 *
 * A class can carry homework (or prework) through
 * `nexus_class_assignments.scheduled_class_id`. Everyone on the roster owes it:
 * the students who came, and the ones who missed the class and are catching
 * up, whose catch-up gate includes the same assignment. The catch-up screens
 * only knew it for absent students and only as "outstanding or not", so a
 * teacher could not see that six students who sat through the class never
 * handed the drawing in.
 *
 * Three queries: the class's published assignments, then both submission
 * tables (document work and drawing work) over those ids.
 */

export type WorkStatus = 'in' | 'late' | 'redo' | 'missing';

export interface ClassAssignment {
  id: string;
  title: string;
  timing: 'prework' | 'homework' | null;
  due_at: string | null;
}

export interface WorkSubmission {
  assignment_id: string;
  student_id: string;
  submitted_at: string | null;
  status: string | null;
}

export interface StudentWork {
  total: number;
  /** Handed in, on time or late. */
  handedIn: number;
  late: number;
  /** Sent back to redo. Counted as not in. */
  redo: number;
  missing: number;
  /** Per assignment, so a row can say which one. */
  byAssignment: Record<string, WorkStatus>;
}

/** Which of several rows for one student and one assignment tells the story. */
function rank(s: WorkStatus): number {
  return s === 'in' ? 3 : s === 'late' ? 2 : s === 'redo' ? 1 : 0;
}

export function submissionStatus(sub: WorkSubmission | null | undefined, dueAt: string | null): WorkStatus {
  if (!sub) return 'missing';
  if (sub.status === 'redo') return 'redo';
  if (dueAt && sub.submitted_at && sub.submitted_at > dueAt) return 'late';
  return 'in';
}

export function studentWork(
  studentId: string,
  assignments: ClassAssignment[],
  subsByKey: Map<string, WorkSubmission[]>,
): StudentWork {
  const out: StudentWork = { total: 0, handedIn: 0, late: 0, redo: 0, missing: 0, byAssignment: {} };
  for (const a of assignments) {
    const subs = subsByKey.get(`${a.id}:${studentId}`) || [];
    let best: WorkStatus = 'missing';
    for (const s of subs) {
      const st = submissionStatus(s, a.due_at);
      if (rank(st) > rank(best)) best = st;
    }
    out.total += 1;
    out.byAssignment[a.id] = best;
    if (best === 'in' || best === 'late') out.handedIn += 1;
    if (best === 'late') out.late += 1;
    if (best === 'redo') out.redo += 1;
    if (best === 'missing') out.missing += 1;
  }
  return out;
}

export function indexSubmissions(subs: WorkSubmission[]): Map<string, WorkSubmission[]> {
  const map = new Map<string, WorkSubmission[]>();
  for (const s of subs) {
    const key = `${s.assignment_id}:${s.student_id}`;
    const list = map.get(key) || [];
    list.push(s);
    map.set(key, list);
  }
  return map;
}

/** Where a student stands on the class, for splitting "who has not handed it in". */
export type WorkAudience = 'came' | 'caught_up' | 'catching_up' | 'other';

export interface AssignmentSummary {
  id: string;
  title: string;
  timing: 'prework' | 'homework' | null;
  /** Students who owe it. */
  expected: number;
  handedIn: number;
  late: number;
  /** Not in, split by where the student stands on the class. */
  missingCame: number;
  missingCaughtUp: number;
  missingCatchingUp: number;
}

export function summariseWork(
  assignments: ClassAssignment[],
  students: Array<{ id: string; audience: WorkAudience; work: StudentWork | null; joinedAfterClass?: boolean }>,
): AssignmentSummary[] {
  return assignments.map((a) => {
    const s: AssignmentSummary = {
      id: a.id,
      title: a.title,
      timing: a.timing,
      expected: 0,
      handedIn: 0,
      late: 0,
      missingCame: 0,
      missingCaughtUp: 0,
      missingCatchingUp: 0,
    };
    for (const st of students) {
      // Prework was due before the class; nobody enrolled afterwards could do it.
      if (a.timing === 'prework' && st.joinedAfterClass) continue;
      if (st.audience === 'other') continue;
      const status = st.work?.byAssignment[a.id] ?? 'missing';
      s.expected += 1;
      if (status === 'in' || status === 'late') {
        s.handedIn += 1;
        if (status === 'late') s.late += 1;
        continue;
      }
      if (st.audience === 'came') s.missingCame += 1;
      else if (st.audience === 'caught_up') s.missingCaughtUp += 1;
      else s.missingCatchingUp += 1;
    }
    return s;
  });
}

const CHUNK = 200;

async function inChunks(
  supabase: any,
  table: string,
  columns: string,
  column: string,
  values: string[],
): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const { data, error } = await supabase.from(table).select(columns).in(column, values.slice(i, i + CHUNK));
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

/** The class's published assignments and every submission against them. */
export async function loadClassWork(
  supabase: any,
  classId: string,
): Promise<{ assignments: ClassAssignment[]; subs: Map<string, WorkSubmission[]> }> {
  const { data, error } = await supabase
    .from('nexus_class_assignments')
    .select('id, title, timing, due_at, created_at')
    .eq('scheduled_class_id', classId)
    .eq('status', 'published')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const assignments: ClassAssignment[] = (data || []).map((a: any) => ({
    id: a.id,
    title: a.title || 'Assignment',
    timing: a.timing === 'prework' ? 'prework' : a.timing === 'homework' ? 'homework' : null,
    due_at: a.due_at ?? null,
  }));
  if (assignments.length === 0) return { assignments, subs: new Map() };

  const ids = assignments.map((a) => a.id);
  const [docs, draws] = await Promise.all([
    inChunks(supabase, 'nexus_assignment_submissions', 'assignment_id, student_id, submitted_at, status', 'assignment_id', ids),
    inChunks(supabase, 'drawing_submissions', 'assignment_id, student_id, submitted_at, status', 'assignment_id', ids),
  ]);
  return { assignments, subs: indexSubmissions([...docs, ...draws] as WorkSubmission[]) };
}
