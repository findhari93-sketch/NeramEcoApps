'use client';

/**
 * Where this drawing sits among its assignment's pending reviews.
 *
 * Reviewing a class is a queue job, and every student used to cost a round trip
 * back to the roster. This gives the review screen its own position ("3 of 12")
 * and the ids either side, so J and K can move through the queue without
 * leaving the screen.
 *
 * Same order as Save and next (lib/review-next.ts): oldest submission first, so
 * moving with J and finishing with Complete walk the same line.
 */

import { useEffect, useRef, useState } from 'react';

interface RosterRow {
  drawing?: { id: string; status: string; submitted_at: string } | null;
}

export interface ReviewQueue {
  total: number;
  /** 1-based, or null when this drawing is not itself waiting for review. */
  position: number | null;
  prevId: string | null;
  nextId: string | null;
}

const EMPTY: ReviewQueue = { total: 0, position: null, prevId: null, nextId: null };

export function queueFor(ids: string[], currentId: string): ReviewQueue {
  const index = ids.indexOf(currentId);
  if (index === -1) {
    // Viewing something already reviewed: offer the start of the queue rather
    // than nothing, so J still leads somewhere useful.
    return { total: ids.length, position: null, prevId: null, nextId: ids[0] ?? null };
  }
  return {
    total: ids.length,
    position: index + 1,
    prevId: index > 0 ? ids[index - 1] : null,
    nextId: index < ids.length - 1 ? ids[index + 1] : null,
  };
}

export function useReviewQueue(
  assignmentId: string | null,
  currentId: string,
  getToken: () => Promise<string | null>,
): ReviewQueue {
  const [ids, setIds] = useState<string[]>([]);
  // getToken is a fresh function every render; see RubricScorePanel.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  useEffect(() => {
    if (!assignmentId) { setIds([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenRef.current();
        const res = await fetch(`/api/assignments/${assignmentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        const rows = (body.drawing_roster ?? []) as RosterRow[];
        const pending = rows
          .map((r) => r.drawing)
          .filter((d): d is NonNullable<RosterRow['drawing']> =>
            !!d && ['submitted', 'under_review'].includes(d.status))
          .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
          .map((d) => d.id);
        if (!cancelled) setIds(pending);
      } catch {
        // No queue, no J and K. The screen works exactly as it did.
      }
    })();
    return () => { cancelled = true; };
  }, [assignmentId, currentId]);

  return assignmentId ? queueFor(ids, currentId) : EMPTY;
}
