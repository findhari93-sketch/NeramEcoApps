'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Checkpoints the enrolment wizard to its link (PUT /api/enroll/draft) so the
 * student can continue on any device:
 *  - at once when the step changes;
 *  - a few seconds after the last edit otherwise (one call per pause, not per key);
 *  - when the tab is hidden or closed, with keepalive.
 * Never the state it was enabled with, never the same state twice, and
 * nothing more once the link answers NOT_ACTIVE.
 */

export const DRAFT_SYNC_DEBOUNCE_MS = 5000;
const SECTIONS = ['personal', 'location', 'academic', 'payment'] as const;

export type DraftSyncStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface UseEnrollmentDraftSyncArgs {
  token: string | null;
  enabled: boolean;
  step: number;
  formData: Record<string, unknown>;
  getIdToken: () => Promise<string | null | undefined>;
}

const pickSections = (formData: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const key of SECTIONS) if (formData[key] !== undefined) out[key] = formData[key];
  return out;
};

export function useEnrollmentDraftSync({ token, enabled, step, formData, getIdToken }: UseEnrollmentDraftSyncArgs) {
  const [status, setStatus] = useState<DraftSyncStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const payload = { token, step, formData: pickSections(formData) };
  const key = JSON.stringify(payload);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const keyRef = useRef(key);
  keyRef.current = key;

  const lastSentRef = useRef<string | null>(null);
  const lastStepRef = useRef(step);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const closedRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const getIdTokenRef = useRef(getIdToken);
  getIdTokenRef.current = getIdToken;

  const send = useCallback(async (keepalive = false) => {
    if (closedRef.current || !payloadRef.current.token) return;
    const sendingKey = keyRef.current;
    if (sendingKey === lastSentRef.current) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus('saving');
    try {
      // The cached token is used when the page is going away; a fresh one otherwise.
      const idToken = keepalive && tokenRef.current ? tokenRef.current : await getIdTokenRef.current();
      if (!idToken) throw new Error('not signed in');
      tokenRef.current = idToken;
      const res = await fetch('/api/enroll/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: sendingKey,
        keepalive,
      });
      if (res.status === 409) {
        closedRef.current = true;
        setStatus('idle');
        return;
      }
      if (!res.ok) throw new Error(`draft save ${res.status}`);
      const data = await res.json().catch(() => ({}));
      lastSentRef.current = sendingKey;
      setSavedAt(data?.data?.savedAt || new Date().toISOString());
      setStatus('saved');
    } catch (error) {
      console.warn('[enroll/draft] save failed:', error instanceof Error ? error.message : error);
      setStatus('error');
    } finally {
      inFlightRef.current = false;
      // Something changed while this was in flight: send it after a short pause.
      if (!closedRef.current && keyRef.current !== lastSentRef.current && keyRef.current !== sendingKey) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void send(), DRAFT_SYNC_DEBOUNCE_MS);
      }
    }
  }, []);

  // Baseline: the state the hook is enabled with is never sent on its own.
  const enabledRef = useRef(false);
  useEffect(() => {
    if (enabled && !enabledRef.current) {
      lastSentRef.current = key;
      lastStepRef.current = step;
    }
    enabledRef.current = enabled;
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || closedRef.current || !token) return;
    if (key === lastSentRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (step !== lastStepRef.current) {
      lastStepRef.current = step;
      void send();
      return;
    }
    setStatus('pending');
    timerRef.current = setTimeout(() => void send(), DRAFT_SYNC_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, token, step, key, send]);

  // Leaving the page with an edit still pending: send it now.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      if (keyRef.current === lastSentRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      void send(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, send]);

  /** "Start over", or the enrolment is done: the draft on the link goes. */
  const clear = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const t = payloadRef.current.token;
    if (!t) return;
    try {
      const idToken = await getIdTokenRef.current();
      if (!idToken) return;
      await fetch(`/api/enroll/draft?token=${encodeURIComponent(t)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${idToken}` } });
    } catch (error) {
      console.warn('[enroll/draft] clear failed:', error instanceof Error ? error.message : error);
    } finally {
      lastSentRef.current = null;
      setStatus('idle');
      setSavedAt(null);
    }
  }, []);

  return { status, savedAt, clear };
}
