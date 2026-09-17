'use client';

/**
 * Keeps one Answer Pad screen showing the truth for its session.
 *
 * A screen renders only what the server's snapshot says. This hook fetches it
 * on open and again on every trigger: a Realtime hint, the panel becoming
 * visible, the network coming back, Teams resuming a cached tab, and a safety
 * poll whose cadence follows poll-policy.ts. Overlapping triggers share one
 * request, and a late response never replaces a newer one (snapshot-merge.ts).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PadClientError, padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import { nextPollDelay, type RealtimeState } from '@/lib/pad/client/poll-policy';
import { loadRealtimeClient } from '@/lib/pad/client/realtime-client';
import { isNewerSnapshot, type OrderedSnapshot } from '@/lib/pad/snapshot-merge';

export interface SnapshotShape extends OrderedSnapshot {
  session: OrderedSnapshot['session'] & { hint_topic: string; teacher_topic?: string };
  prompt: (NonNullable<OrderedSnapshot['prompt']> & { id: string; state: 'open' | 'closed' | 'revealed' }) | null;
}

export interface PadSnapshotState<T> {
  snapshot: T | null;
  error: PadClientError | null;
  realtime: RealtimeState;
  /** Ask for a fresh snapshot now (after an action, or from a retry button). */
  refresh: () => Promise<void>;
}

const HEARTBEAT_MS = 30_000;

export function usePadSnapshot<T extends SnapshotShape>(options: {
  host: PadHost;
  sessionId: string | null;
  role: 'teacher' | 'student';
}): PadSnapshotState<T> {
  const { host, sessionId, role } = options;

  const [snapshot, setSnapshot] = useState<T | null>(null);
  const [error, setError] = useState<PadClientError | null>(null);
  const [realtime, setRealtime] = useState<RealtimeState>('connecting');
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const [pollTick, setPollTick] = useState(0);

  const snapshotRef = useRef<T | null>(null);
  const failuresRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef(false);
  const touchedRef = useRef(false);
  const sessionRef = useRef(sessionId);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  const refresh = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return inFlightRef.current;
    }

    const run = (async () => {
      try {
        // A student's first snapshot also records that their pad is open.
        const touch = role === 'student' && !touchedRef.current;
        const data = await padFetch<T>(host, `/api/pad/sessions/${id}/snapshot${touch ? '?touch=1' : ''}`);
        if (sessionRef.current !== id) return;
        touchedRef.current = true;
        failuresRef.current = 0;
        setError(null);
        if (isNewerSnapshot(data, snapshotRef.current)) {
          snapshotRef.current = data;
          setSnapshot(data);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        failuresRef.current += 1;
        setError(err instanceof PadClientError ? err : new PadClientError(0, 'OFFLINE', 'No connection'));
      } finally {
        inFlightRef.current = null;
        setPollTick((tick) => tick + 1);
        if (queuedRef.current) {
          queuedRef.current = false;
          void refreshRef.current();
        }
      }
    })();

    inFlightRef.current = run;
    return run;
  }, [host, role]);

  refreshRef.current = refresh;

  // A new session starts from nothing.
  useEffect(() => {
    sessionRef.current = sessionId;
    snapshotRef.current = null;
    touchedRef.current = false;
    failuresRef.current = 0;
    setSnapshot(null);
    setError(null);
    if (sessionId) void refreshRef.current();
  }, [sessionId]);

  // Refetch whenever the screen comes back to the user.
  useEffect(() => {
    const onVisibility = () => {
      const isHidden = document.visibilityState === 'hidden';
      setHidden(isHidden);
      if (!isHidden) void refreshRef.current();
    };
    const onReturn = () => void refreshRef.current();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onReturn);
    window.addEventListener('focus', onReturn);
    const stopResume = host.onResume(onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onReturn);
      window.removeEventListener('focus', onReturn);
      stopResume();
    };
  }, [host]);

  // Realtime hints, on the topic this screen was handed in its snapshot. The client
  // library loads only now, once the first snapshot is on screen (realtime-client.ts).
  const topic = role === 'teacher' ? snapshot?.session.teacher_topic : snapshot?.session.hint_topic;
  useEffect(() => {
    if (!topic) return;
    let active = true;
    let unsubscribe: (() => void) | null = null;
    setRealtime('connecting');

    loadRealtimeClient()
      .then((client) => {
        if (!active) return;
        const channel = client
          .channel(topic)
          .on('broadcast', { event: 'hint' }, () => {
            if (active) void refreshRef.current();
          })
          .subscribe((status) => {
            if (!active) return;
            if (status === 'SUBSCRIBED') {
              setRealtime('subscribed');
              // Anything that changed while connecting.
              void refreshRef.current();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              setRealtime('unavailable');
            }
          });
        unsubscribe = () => void client.removeChannel(channel);
      })
      .catch(() => {
        // The library did not load, offline on first open say: polling carries on alone.
        if (active) setRealtime('unavailable');
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [topic]);

  // The safety poll.
  const sessionStatus = snapshot?.session.status ?? null;
  const promptState = snapshot?.prompt?.state ?? null;
  useEffect(() => {
    if (!sessionId) return;
    const delay = nextPollDelay({ role, realtime, sessionStatus, promptState, hidden, failures: failuresRef.current });
    if (delay === null) return;
    const timer = setTimeout(() => void refreshRef.current(), delay);
    return () => clearTimeout(timer);
  }, [sessionId, role, realtime, sessionStatus, promptState, hidden, pollTick]);

  return { snapshot, error, realtime, refresh };
}

/**
 * Keeps a student counted as connected while their pad is visible. A hidden
 * panel stops beating on purpose: that student can no longer see a question,
 * so the teacher's re-send should reach them.
 */
export function usePadHeartbeat(host: PadHost, sessionId: string | null, live: boolean): void {
  useEffect(() => {
    if (!sessionId || !live) return;
    const beat = () => {
      if (document.visibilityState === 'hidden') return;
      padFetch(host, '/api/pad/heartbeat', { method: 'POST', body: { sessionId } }).catch(() => undefined);
    };
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [host, sessionId, live]);
}
