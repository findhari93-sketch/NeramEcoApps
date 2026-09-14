'use client';

/**
 * Gemini's draft for the drawing on screen: ask for it if nobody has, wait for
 * it if someone already is, and say plainly when it cannot come.
 *
 * A student's submit normally starts the draft, and opening the Drawing Reviews
 * queue sweeps up anything that slipped through. This hook is the last safety
 * net: a teacher who opens a sheet with no draft starts one here. The server
 * claims each sheet once, so all three can fire together and only one spends.
 *
 * The phases are what the rail shows. None of them is a grey button with a
 * sentence about brief types.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type DraftPhase =
  | 'idle'        // nothing to show: locked round, not waiting for review, or unknown
  | 'drafting'    // Gemini is working on it
  | 'ready'       // a draft is on screen
  | 'failed'      // it tried and did not come back
  | 'off'         // switched off by an admin
  | 'budget';     // the day's or month's AI budget is spent

export interface AutoDraftState {
  phase: DraftPhase;
  message: string | null;
  /** Start again after a failure, or replace the draft on screen. */
  draftAgain: () => void;
}

interface Estimate {
  allowed?: boolean;
  flagEnabled?: boolean;
  claim?: 'running' | 'draft' | 'needs_manual' | null;
  reason?: string | null;
  message?: string | null;
}

interface RunResult {
  state?: 'drafted' | 'busy' | 'skipped' | 'blocked' | 'failed';
  reason?: string | null;
}

const POLL_MS = 4000;
const POLL_LIMIT_MS = 3 * 60 * 1000;

export function blockedMessage(reason: string | null | undefined, flagEnabled = true): { phase: DraftPhase; message: string } {
  if (!flagEnabled || reason === 'flag_off') {
    return { phase: 'off', message: 'Gemini drafts are switched off. An admin can turn them on in Features.' };
  }
  const r = String(reason || '');
  if (r === 'rate_limited') {
    return { phase: 'failed', message: 'Gemini is busy right now. Try again in a minute.' };
  }
  if (/month/i.test(r)) {
    return { phase: 'budget', message: "This month's Gemini budget is used up. Score this one yourself." };
  }
  if (/daily|day|cap|budget/i.test(r)) {
    return { phase: 'budget', message: "Today's Gemini budget is used up. Drafts start again tomorrow." };
  }
  return { phase: 'off', message: 'Gemini drafts are switched off. An admin can turn them on in AI usage.' };
}

export function useAutoDraft({
  submissionId,
  getToken,
  active,
  hasDraft,
  onDrafted,
}: {
  submissionId: string | null;
  getToken: () => Promise<string | null>;
  /** Only an open, unreviewed sheet gets drafted. */
  active: boolean;
  hasDraft: boolean;
  /** Reload the draft and anything the draft changed (an upright image, tags). */
  onDrafted: () => void;
}): AutoDraftState {
  const [phase, setPhase] = useState<DraftPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const onDraftedRef = useRef(onDrafted);
  onDraftedRef.current = onDrafted;
  const runIdRef = useRef(0);

  const authed = useCallback(async (input: string, init?: RequestInit) => {
    const token = await tokenRef.current();
    return fetch(input, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  }, []);

  const readEstimate = useCallback(async (): Promise<Estimate | null> => {
    if (!submissionId) return null;
    try {
      const res = await authed(`/api/drawing/evaluations/estimate?submission_id=${submissionId}`);
      if (!res.ok) return null;
      return (await res.json()) as Estimate;
    } catch {
      return null;
    }
  }, [authed, submissionId]);

  const settle = useCallback((result: RunResult, runId: number) => {
    if (runId !== runIdRef.current) return;
    switch (result.state) {
      case 'drafted':
        setPhase('drafting');
        setMessage(null);
        onDraftedRef.current();
        return;
      case 'blocked': {
        const b = blockedMessage(result.reason);
        setPhase(b.phase);
        setMessage(b.message);
        return;
      }
      case 'failed':
        setPhase('failed');
        setMessage('Gemini could not draft this one.');
        return;
      case 'skipped':
        // Drafted by someone else a moment ago: load theirs.
        if (result.reason === 'already_drafted') {
          onDraftedRef.current();
          return;
        }
        setPhase('idle');
        setMessage(null);
        return;
      default:
        return;
    }
  }, []);

  /** Someone else holds the claim: wait for their draft instead of starting one. */
  const waitForClaim = useCallback(async (runId: number) => {
    const startedAt = Date.now();
    while (runId === runIdRef.current && Date.now() - startedAt < POLL_LIMIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (runId !== runIdRef.current) return;
      const e = await readEstimate();
      if (!e) continue;
      if (e.claim === 'draft') return settle({ state: 'drafted' }, runId);
      if (e.claim === 'needs_manual') return settle({ state: 'failed' }, runId);
      if (e.claim == null) return settle({ state: 'failed' }, runId);
    }
    if (runId === runIdRef.current) settle({ state: 'failed' }, runId);
  }, [readEstimate, settle]);

  const run = useCallback(async (force: boolean) => {
    if (!submissionId) return;
    const runId = ++runIdRef.current;
    setPhase('drafting');
    setMessage(null);
    try {
      const res = force
        ? await authed('/api/drawing/evaluations', {
            method: 'POST',
            body: JSON.stringify({ submission_id: submissionId }),
          })
        : await authed(`/api/drawing/submissions/${submissionId}/auto-draft`, { method: 'POST', body: '{}' });
      const body = (await res.json().catch(() => ({}))) as RunResult;
      if (!res.ok && !body.state) return settle({ state: 'failed' }, runId);
      if (body.state === 'busy') return void waitForClaim(runId);
      settle(body, runId);
    } catch {
      settle({ state: 'failed' }, runId);
    }
  }, [authed, settle, submissionId, waitForClaim]);

  // Decide once per sheet what to do.
  useEffect(() => {
    runIdRef.current++;
    if (!active || !submissionId) {
      setPhase('idle');
      setMessage(null);
      return;
    }
    if (hasDraft) {
      setPhase('ready');
      setMessage(null);
      return;
    }
    const runId = runIdRef.current;
    let cancelled = false;
    (async () => {
      const e = await readEstimate();
      if (cancelled || runId !== runIdRef.current) return;
      if (!e) {
        setPhase('idle');
        return;
      }
      if (e.flagEnabled === false || e.allowed === false) {
        const b = blockedMessage(e.reason, e.flagEnabled !== false);
        setPhase(b.phase);
        setMessage(b.message);
        return;
      }
      if (e.claim === 'running') {
        setPhase('drafting');
        void waitForClaim(runId);
        return;
      }
      if (e.claim === 'draft') {
        // Written, but not loaded on this screen yet.
        onDraftedRef.current();
        return;
      }
      if (e.claim === 'needs_manual') {
        setPhase('failed');
        setMessage('Gemini could not draft this one.');
        return;
      }
      void run(false);
    })();
    return () => { cancelled = true; };
    // hasDraft flipping to true is the end of a run, handled by the branch above.
  }, [active, submissionId, hasDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftAgain = useCallback(() => { void run(true); }, [run]);

  return { phase, message, draftAgain };
}
