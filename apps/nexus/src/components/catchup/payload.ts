/**
 * The catch-up payload, and how to trust one.
 *
 * `/api/catchup/overview` is read through the persisted SWR cache, so what the
 * page receives on its first frame was not necessarily written by the program
 * now reading it. lib/swr-cache.ts keys its buckets on the build to stop that at
 * the source. This is the second line: whatever arrives, every field the screen
 * reads exists.
 *
 * That matters because the failure is not a missing number, it is a blank app.
 * A payload cached before `totals.byBucket` existed made the tiles read
 * `undefined.run_over`, which threw during render, and with no error boundary
 * over the teacher segment the crash took the entire shell with it.
 */
import { emptyTally, type BucketTally } from '@/lib/catchup-buckets';
import { EMPTY_STANDING } from '@/lib/catchup-standing';
import { emptyDiagnosisTally } from '@/lib/catchup-diagnosis';
import type { Payload } from './types';

/**
 * What the screen falls back to.
 *
 * Also the merge base below, so there is one written-down answer to "what does
 * this page render when it has nothing" rather than a default per read site.
 */
export const EMPTY_PAYLOAD: Payload = {
  classroomId: null,
  students: [],
  classes: [],
  reasonTally: {},
  noRecording: [],
  pendingRecap: [],
  celebrationsUnavailable: false,
  totals: {
    studentsBehind: 0,
    studentsCatchingUp: 0,
    outstanding: 0,
    clearedThisMonth: 0,
    explained: 0,
    unexplained: 0,
    byBucket: emptyTally(),
    byDiagnosis: emptyDiagnosisTally(),
    hiddenDormant: 0,
  },
};

/**
 * What a read of this endpoint may actually hand you.
 *
 * Deliberately not `Payload`. Typing the fetch as the current shape is the thing
 * that made the crash possible: it promised the compiler a guarantee that a
 * cache replaying yesterday's deploy cannot make. Anything may be absent, and
 * saying so in the type is what forces every reader through the function below.
 */
export type CachedPayload = Partial<Omit<Payload, 'totals'>> & {
  totals?: Partial<Omit<Payload['totals'], 'byBucket' | 'byDiagnosis'>> & {
    byBucket?: Partial<BucketTally>;
    byDiagnosis?: Partial<Payload['totals']['byDiagnosis']>;
  };
};

/**
 * Fill in whatever this payload was written too early to contain.
 *
 * Shallow by design, with two exceptions. `totals` is read key by key, so a
 * missing field there becomes a property access on undefined. `students[].standing`
 * is the same hazard one level further down: it arrived after this endpoint had
 * already been cached in the wild, and the standing block is read field by field
 * to build the chase ranking, so a row without one throws exactly the way a
 * missing `byBucket` did.
 *
 * Returns null for nothing at all, which is how the page tells "still loading"
 * from "loaded, and there is nothing here".
 */
export function withPayloadDefaults(payload: CachedPayload | undefined): Payload | null {
  if (!payload) return null;

  return {
    ...EMPTY_PAYLOAD,
    ...payload,
    celebrationsUnavailable: payload.celebrationsUnavailable ?? false,
    students: (payload.students || []).map((s) => ({
      ...s,
      standing: s?.standing ? { ...EMPTY_STANDING, ...s.standing } : EMPTY_STANDING,
      celebration: s?.celebration ?? null,
    })),
    totals: {
      ...EMPTY_PAYLOAD.totals,
      ...payload.totals,
      byBucket: { ...emptyTally(), ...payload.totals?.byBucket },
      byDiagnosis: { ...emptyDiagnosisTally(), ...payload.totals?.byDiagnosis },
    },
  };
}
