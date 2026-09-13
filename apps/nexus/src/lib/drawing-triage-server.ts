/**
 * Triage for one assignment's waiting drawings, read from the database.
 *
 * Computed on read rather than stored: the inputs (a photo measurement, the
 * attempt count, recent scores) change whenever a student resubmits or a
 * teacher grades someone else, and a stored band would go stale silently.
 * Three queries for the whole class, whatever its size.
 *
 * Held reviews are left out. They are finished on the teacher's side and belong
 * to the hand-back panel, not to the pile still to be read.
 */

import { heldSubmissionIds } from './drawing-hold';
import { parseQuality } from './image-quality';
import { triageDrawing, triageOrder, bandCounts, type TriageBand, type TriageReasonCode } from './drawing-triage';

const PENDING = new Set(['submitted', 'under_review']);
const GRADED = ['completed', 'redo', 'reviewed'];

export interface TriageItem {
  submission_id: string;
  student: { id: string; name: string | null; avatar_url: string | null };
  submitted_at: string;
  attempt_count: number;
  image_url: string;
  quality_measured: boolean;
  band: TriageBand;
  reasons: TriageReasonCode[];
  explainer: string;
}

export interface AssignmentTriage {
  items: TriageItem[];
  counts: Record<TriageBand, number>;
  held_ids: string[];
}

interface SubRow {
  id: string;
  student_id: string;
  status: string;
  submitted_at: string;
  tutor_rating: number | null;
  original_image_url: string;
  image_quality?: unknown;
}

const isNotMigrated = (message: string) => /does not exist|schema cache/i.test(message);

async function loadSubmissions(supabase: any, assignmentId: string): Promise<SubRow[]> {
  const base = 'id, student_id, status, submitted_at, tutor_rating, original_image_url';
  const run = (columns: string) =>
    supabase.from('drawing_submissions').select(columns).eq('assignment_id', assignmentId).order('submitted_at', { ascending: true });
  let { data, error } = await run(`${base}, image_quality`);
  // An environment without the quality column still triages: every photo simply
  // reads as not checked yet.
  if (error && isNotMigrated(error.message)) ({ data, error } = await run(base));
  if (error) throw new Error(error.message);
  return (data ?? []) as SubRow[];
}

export async function loadAssignmentTriage(supabase: any, assignmentId: string): Promise<AssignmentTriage> {
  const subs = await loadSubmissions(supabase, assignmentId);

  // Every attempt per student, oldest first; the latest is what waits.
  const byStudent = new Map<string, SubRow[]>();
  for (const s of subs) {
    const list = byStudent.get(s.student_id) ?? [];
    list.push(s);
    byStudent.set(s.student_id, list);
  }
  const waiting = Array.from(byStudent.values())
    .map((attempts) => ({ attempts, latest: attempts[attempts.length - 1] }))
    .filter(({ latest }) => PENDING.has(latest.status));

  const held = await heldSubmissionIds(supabase, waiting.map((w) => w.latest.id));
  const open = waiting.filter((w) => !held.has(w.latest.id));
  if (open.length === 0) {
    return { items: [], counts: bandCounts([]), held_ids: Array.from(held) };
  }

  const studentIds = open.map((w) => w.latest.student_id);
  const [{ data: users }, { data: graded }] = await Promise.all([
    supabase.from('users').select('id, name, avatar_url').in('id', studentIds),
    supabase
      .from('drawing_submissions')
      .select('student_id, tutor_rating, reviewed_at, assignment_id')
      .in('student_id', studentIds)
      .in('status', GRADED)
      .not('tutor_rating', 'is', null)
      .order('reviewed_at', { ascending: false, nullsFirst: false })
      .limit(5000),
  ]);

  const userBy = new Map<string, { id: string; name: string | null; avatar_url: string | null }>(
    ((users ?? []) as Array<{ id: string; name: string | null; avatar_url: string | null }>).map((u) => [u.id, u]),
  );
  // Recent scores on OTHER work. This assignment's own rounds are the thread.
  const recentBy = new Map<string, number[]>();
  for (const g of (graded ?? []) as Array<{ student_id: string; tutor_rating: number; assignment_id: string | null }>) {
    if (g.assignment_id === assignmentId) continue;
    const list = recentBy.get(g.student_id) ?? [];
    list.push(g.tutor_rating);
    recentBy.set(g.student_id, list);
  }

  const items = open.map(({ attempts, latest }) => {
    const quality = parseQuality(latest.image_quality);
    const threadRatings = attempts
      .slice(0, -1)
      .map((a) => a.tutor_rating)
      .filter((r): r is number => typeof r === 'number');
    const triage = triageDrawing({
      attemptCount: attempts.length,
      quality,
      threadRatings,
      recentRatings: recentBy.get(latest.student_id) ?? [],
    });
    const user = userBy.get(latest.student_id);
    return {
      submission_id: latest.id,
      student: { id: latest.student_id, name: user?.name ?? null, avatar_url: user?.avatar_url ?? null },
      submitted_at: latest.submitted_at,
      submittedAt: latest.submitted_at,
      attempt_count: attempts.length,
      image_url: latest.original_image_url,
      quality_measured: !!quality,
      band: triage.band,
      reasons: triage.reasons.map((r) => r.code),
      explainer: triage.explainer,
    };
  });

  const ordered = triageOrder(items).map(({ submittedAt: _drop, ...item }) => item as TriageItem);
  return { items: ordered, counts: bandCounts(ordered), held_ids: Array.from(held) };
}
