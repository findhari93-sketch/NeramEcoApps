'use client';

/**
 * Where this drawing sits in the place the teacher came from.
 *
 * An assignment's pending reviews (oldest first, the same order as Save and
 * next in lib/review-next.ts), one triage lane of it, a student's sketchbook
 * month, the flip-through inbox, or an exam's unmarked drawings. Which one is
 * decided in lib/review-context.ts; this hook only fetches it.
 */

import { useEffect, useRef, useState } from 'react';
import type { TriageBand } from '@/lib/drawing-triage';
import { parseLane, pickQueueIds, queueSourceFor, type ReviewContext } from '@/lib/review-context';

export { parseLane };

interface RosterRow {
  drawing?: { id: string; status: string; submitted_at: string } | null;
}

export interface ReviewQueue {
  total: number;
  /** 1-based, or null when this drawing is not itself in the list. */
  position: number | null;
  prevId: string | null;
  nextId: string | null;
  /**
   * Where to go once this drawing is done: the next one, or when this was the
   * last, the earliest one still in the list. Null when nothing else is.
   */
  afterId: string | null;
}

const EMPTY: ReviewQueue = { total: 0, position: null, prevId: null, nextId: null, afterId: null };

export function queueFor(ids: string[], currentId: string): ReviewQueue {
  const index = ids.indexOf(currentId);
  if (index === -1) {
    // Viewing something already done: offer the start of the list rather than
    // nothing, so J still leads somewhere useful.
    return { total: ids.length, position: null, prevId: null, nextId: ids[0] ?? null, afterId: ids[0] ?? null };
  }
  const nextId = index < ids.length - 1 ? ids[index + 1] : null;
  return {
    total: ids.length,
    position: index + 1,
    prevId: index > 0 ? ids[index - 1] : null,
    nextId,
    afterId: nextId ?? ids.find((x) => x !== currentId) ?? null,
  };
}

async function assignmentIds(assignmentId: string, lane: TriageBand | null, token: string | null): Promise<string[] | null> {
  const headers = { Authorization: `Bearer ${token}` };
  if (lane) {
    const res = await fetch(`/api/drawing/assignments/${assignmentId}/triage`, { headers });
    if (!res.ok) return null;
    const body = await res.json();
    // Already in triage order, which within a band is oldest first.
    return ((body.items ?? []) as Array<{ submission_id: string; band: TriageBand }>)
      .filter((item) => item.band === lane)
      .map((item) => item.submission_id);
  }
  const res = await fetch(`/api/assignments/${assignmentId}`, { headers });
  if (!res.ok) return null;
  const body = await res.json();
  return ((body.drawing_roster ?? []) as RosterRow[])
    .map((r) => r.drawing)
    .filter((d): d is NonNullable<RosterRow['drawing']> => !!d && ['submitted', 'under_review'].includes(d.status))
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
    .map((d) => d.id);
}

export function useReviewQueue(
  ctx: ReviewContext,
  fallbackAssignmentId: string | null,
  currentId: string,
  getToken: () => Promise<string | null>,
): ReviewQueue {
  const [ids, setIds] = useState<string[]>([]);
  // getToken is a fresh function every render; see RubricScorePanel.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const source = queueSourceFor(ctx, fallbackAssignmentId);
  const sourceKey = source ? JSON.stringify(source) : '';

  useEffect(() => {
    if (!source) { setIds([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenRef.current();
        let next: string[] | null;
        if (source.kind === 'assignment') {
          next = await assignmentIds(source.assignmentId, source.lane, token);
        } else {
          const res = await fetch(source.url, { headers: { Authorization: `Bearer ${token}` } });
          next = res.ok ? pickQueueIds(source.pick, await res.json()) : null;
        }
        if (!cancelled && next) setIds(next);
      } catch {
        // No queue, no J and K. The screen works exactly as it did.
      }
    })();
    return () => { cancelled = true; };
    // sourceKey stands for source, which is rebuilt every render.
  }, [sourceKey, currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  return source ? queueFor(ids, currentId) : EMPTY;
}
