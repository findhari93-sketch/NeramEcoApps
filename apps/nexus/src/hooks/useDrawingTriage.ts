'use client';

/**
 * An assignment's triage, plus the photo checks nobody has run yet.
 *
 * Sheets uploaded before phones measured their own photos arrive "not checked
 * yet", which keeps them out of LOOKS ROUTINE. The teacher's browser already
 * has access to those photos, so it measures them quietly in the background,
 * a few at a time, stores the numbers and re-sorts once. Every photo is only
 * ever measured once, by whichever browser gets there first.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { measureImageQuality } from '@/lib/measure-image-quality';
import type { TriageBand, TriageReasonCode } from '@/lib/drawing-triage';

export interface TriageRow {
  submission_id: string;
  student: { id: string; name: string | null; avatar_url: string | null };
  submitted_at: string;
  attempt_count: number;
  image_url: string;
  quality_measured: boolean;
  has_ai_draft?: boolean;
  band: TriageBand;
  reasons: TriageReasonCode[];
  explainer: string;
}

export interface DrawingTriageState {
  items: TriageRow[];
  byId: Map<string, TriageRow>;
  counts: Record<TriageBand, number>;
  heldIds: Set<string>;
  loading: boolean;
  failed: boolean;
  /** Photos still being checked in the background. */
  checking: number;
  /** Routine sheets carrying an AI draft. */
  routineDrafts: number;
  /** Whether those may be approved unread, and why not. Null with no drafts. */
  unreadGate: { ready: boolean; reason: string } | null;
  refresh: () => void;
}

const EMPTY_COUNTS: Record<TriageBand, number> = { routine: 0, needs_look: 0, flagged: 0 };
/** Photos measured per pass, so a class of sixty does not stall the page. */
const BACKFILL_PER_PASS = 20;

export function useDrawingTriage(
  assignmentId: string | null,
  getToken: () => Promise<string | null>,
  enabled = true,
): DrawingTriageState {
  const [items, setItems] = useState<TriageRow[]>([]);
  const [heldIds, setHeldIds] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(0);
  const [routineDrafts, setRoutineDrafts] = useState(0);
  const [unreadGate, setUnreadGate] = useState<{ ready: boolean; reason: string } | null>(null);
  const [version, setVersion] = useState(0);
  // getToken is a fresh function every render; see RubricScorePanel.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  // Photos this page already tried, so one that cannot be read is not retried forever.
  const attempted = useRef(new Set<string>());

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!assignmentId || !enabled) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenRef.current();
        const res = await fetch(`/api/drawing/assignments/${assignmentId}/triage`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (cancelled) return;
        const rows = (body.items ?? []) as TriageRow[];
        setItems(rows);
        setCounts(body.counts ?? EMPTY_COUNTS);
        setHeldIds(new Set((body.held_ids ?? []) as string[]));
        setRoutineDrafts(body.routine_drafts ?? 0);
        setUnreadGate(body.unread_gate ?? null);
        setFailed(false);
        setLoading(false);

        const unmeasured = rows
          .filter((r) => !r.quality_measured && r.image_url && !attempted.current.has(r.submission_id))
          .slice(0, BACKFILL_PER_PASS);
        if (unmeasured.length === 0) return;

        setChecking(unmeasured.length);
        let stored = 0;
        for (const row of unmeasured) {
          if (cancelled) return;
          attempted.current.add(row.submission_id);
          const quality = await measureImageQuality(row.image_url);
          if (quality) {
            const put = await fetch(`/api/drawing/submissions/${row.submission_id}/quality`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ quality }),
            }).catch(() => null);
            if (put?.ok) stored += 1;
          }
          if (!cancelled) setChecking((n) => Math.max(0, n - 1));
        }
        // Re-sort once with the new numbers, not once per photo.
        if (!cancelled && stored > 0) setVersion((v) => v + 1);
      } catch {
        if (!cancelled) { setFailed(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; setChecking(0); };
  }, [assignmentId, enabled, version]);

  const byId = useMemo(() => new Map(items.map((i) => [i.submission_id, i])), [items]);

  return {
    items,
    byId,
    counts,
    heldIds,
    loading,
    failed,
    checking,
    routineDrafts,
    unreadGate,
    refresh,
  };
}
