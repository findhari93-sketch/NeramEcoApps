/**
 * How much catch-up work each student still owes, and how much of it is our
 * fault rather than theirs.
 *
 * Two numbers per student, and the split between them is the point. `ownOpen` is
 * work they can actually do. `blockedOnUs` is work nobody can do because the
 * class has no recording, or its recap was never published. Anything that reads
 * a student's standing has to keep those apart, or it chases somebody for a gap
 * we left.
 *
 * A narrowing of `loadClassroomBacklog`, not a second implementation of it. The
 * wall, the Teams celebration post and the attendance standing view all resolve
 * the same backlog through the same function, which is the only way they can be
 * guaranteed to name the same people rather than merely agree today.
 */
import { loadClassroomBacklog } from './catchup-cohort';

export interface CatchupOpenCounts {
  /** Items this student can clear. Never includes work blocked on us. */
  ownOpen: number;
  /** Items nobody can clear yet: no recording, or a recap we never published. */
  blockedOnUs: number;
}

export async function loadCatchupOpenCounts(
  supabase: any,
  classroomId: string,
  today: string,
): Promise<Map<string, CatchupOpenCounts>> {
  const backlog = await loadClassroomBacklog(supabase, classroomId, today);
  return new Map(
    [...backlog].map(([id, b]) => [id, { ownOpen: b.ownOpen, blockedOnUs: b.blockedOnUs }]),
  );
}
