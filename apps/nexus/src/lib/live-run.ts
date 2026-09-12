/**
 * Is this paper somebody's exam right now?
 *
 * The 18 Aug exam was also a Study Materials chapter test. Students who were
 * refused at the exam door, or who simply opened the chapter, sat the paper
 * through Study Materials during the exam, and the exam recorded them as not
 * started. So the practice door now asks first: while a record-keeping run of the
 * same paper (an exam, or a class test with a real close) is open to this
 * student and they have not sat it, an official practice attempt is refused and
 * the student is sent to that run. Practice opens again once they have sat it.
 *
 * PURE decision (decideLiveRun) over what one loader gathers
 * (findLiveRunForStudent). The loader fails OPEN: a lookup that breaks must never
 * turn into a student locked out of practice.
 */

import {
  getExam,
  getExamMakeup,
  getLiveAccessRequest,
  getSupabaseAdminClient,
  loadRunSittings,
  resolveExamWindowForStudent,
  resolveTestRunWindow,
} from '@neram/database';
import { resolveRunRoster } from './run-roster';

export type LiveRunKind = 'exam' | 'class_test';

export interface LiveRunCandidate {
  placement_id: string;
  test_id: string;
  kind: LiveRunKind;
  /** The window that applies to THIS student: a makeup or reopen replaces the shared one. */
  opens_at: string | null;
  closes_at: string | null;
  on_roster: boolean;
  has_sitting: boolean;
}

export interface LiveRun {
  placement_id: string;
  test_id: string;
  kind: LiveRunKind;
  closes_at: string;
}

/**
 * The run this student should be sent to, or null.
 *
 * A run with no real close is homework rather than a sitting, so it never
 * qualifies: routing practice to it would lock practice away indefinitely. When
 * two runs are live at once, the one closing first wins.
 */
export function decideLiveRun(candidates: LiveRunCandidate[], now: number): LiveRun | null {
  const live = candidates
    .filter((c) => c.on_roster && !c.has_sitting)
    .filter((c) => {
      const closes = c.closes_at ? Date.parse(c.closes_at) : NaN;
      if (Number.isNaN(closes) || closes < now) return false;
      const opens = c.opens_at ? Date.parse(c.opens_at) : NaN;
      return Number.isNaN(opens) || opens <= now;
    })
    .sort((a, b) => Date.parse(a.closes_at as string) - Date.parse(b.closes_at as string));

  const first = live[0];
  return first
    ? { placement_id: first.placement_id, test_id: first.test_id, kind: first.kind, closes_at: first.closes_at as string }
    : null;
}

/** What the attempt routes send back, so both say the same thing. */
export function describeLiveRun(live: LiveRun) {
  return {
    error:
      live.kind === 'exam'
        ? 'This paper is your class exam right now. Take it from the exam, where it counts.'
        : 'This paper is your class test right now. Take it from the class test, where it counts.',
    code: 'LIVE_RUN' as const,
    live_run: live,
  };
}

/**
 * Look for a live run of this paper for this student.
 *
 * One read for the common case (a paper with no exam or class test placement)
 * and a handful more only when one exists. Only ever called when a student
 * starts an official attempt through a practice door.
 */
export async function findLiveRunForStudent(
  input: { testId: string; studentId: string; now?: number },
  client?: any,
): Promise<LiveRun | null> {
  const supabase = client || getSupabaseAdminClient();
  const now = input.now ?? Date.now();

  try {
    const { data: placements, error } = await supabase
      .from('nexus_test_placements')
      .select('id, test_id, context_type, context_id, available_from, available_until, gating')
      .eq('test_id', input.testId)
      .eq('is_active', true)
      .eq('is_visible', true)
      .in('context_type', ['exam', 'class_test']);
    if (error) throw error;

    const runs = (placements || []) as any[];
    if (runs.length === 0) return null;

    const sittings = await loadRunSittings(
      runs.map((r) => ({
        id: r.id,
        test_id: r.test_id,
        available_from: r.available_from ?? null,
        available_until: r.available_until ?? null,
      })),
      { studentIds: [input.studentId] },
      supabase,
    );

    const candidates = await Promise.all(
      runs.map(async (p): Promise<LiveRunCandidate> => {
        const [roster, grant] = await Promise.all([
          resolveRunRoster(p, supabase),
          getLiveAccessRequest(p.id, input.studentId, supabase).catch(() => null),
        ]);
        const liveGrant = grant?.status === 'granted' ? grant : null;

        let opensAt: string | null = p.available_from ?? null;
        let closesAt: string | null = p.available_until ?? null;

        if (p.context_type === 'exam') {
          const examId = (p.gating as { exam_id?: string } | null)?.exam_id;
          const exam = examId ? await getExam(examId, supabase) : null;
          if (exam) {
            const makeup = await getExamMakeup(exam.id, input.studentId, supabase).catch(() => null);
            const window = resolveExamWindowForStudent(exam, makeup, liveGrant);
            opensAt = window.opens_at;
            closesAt = window.closes_at;
          }
        } else if (liveGrant) {
          const window = resolveTestRunWindow({ opensAt, closesAt, grant: liveGrant, now });
          if (window.via_grant) {
            opensAt = liveGrant.opens_at;
            closesAt = liveGrant.closes_at;
          }
        }

        return {
          placement_id: p.id,
          test_id: p.test_id,
          kind: p.context_type as LiveRunKind,
          opens_at: opensAt,
          closes_at: closesAt,
          on_roster: Boolean(roster?.has(input.studentId)),
          has_sitting: sittings.get(p.id)?.has(input.studentId) ?? false,
        };
      }),
    );

    return decideLiveRun(candidates, now);
  } catch (err) {
    console.warn('[live-run] check skipped:', (err as Error)?.message);
    return null;
  }
}
