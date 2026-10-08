'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Phase, TutorAction, TutorBlock, TutorEnvelope } from '@/lib/assistant/tutor/types';
import { newMessageId } from '@/components/assistant/client';
import { postTutorTurn, TutorHttpError, OFFLINE, type GetToken } from './client';

export interface TutorTurn {
  id: string;
  who: 'student' | 'tutor';
  /** What the student pressed or typed. */
  text?: string;
  envelope?: TutorEnvelope;
}

export interface TutorError {
  message: string;
  /** Worth a Retry button: offline, a server fault, or a 409 (a test open, a tap still running). */
  retryable: boolean;
  status: number;
}

/** 404 from the turn route: the tutor is off, or there is no pack for this question. */
export { NOT_READY } from '@/lib/assistant/tutor/copy';

export interface TutorSession {
  questionId: string | null;
  turns: TutorTurn[];
  pending: boolean;
  error: TutorError | null;
  /** The latest envelope, or null before the first reply. */
  latest: TutorEnvelope | null;
  phase: Phase | null;
  progress: { step: number; total: number } | null;
  hintsUsed: number;
  /** True once start() has been asked for this question. */
  started: boolean;
  /** The server answered 404: nothing to teach here. The panel shows NOT_READY only. */
  notReady: boolean;
  /** Save refs pressed in this session (shown as Saved at once). */
  saved: ReadonlySet<string>;
  /** The id of the newest check_question block, and whether it is still open. */
  openCheck: Extract<TutorBlock, { kind: 'check_question' }> | null;
  start: () => void;
  send: (action: TutorAction, label?: string | null) => Promise<void>;
  retry: () => Promise<void>;
}

let seq = 0;
const nextId = () => `t${Date.now().toString(36)}-${++seq}`;

/** Never reached the server: worth one silent resend with the same id. */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TutorHttpError) return err.status === 0;
  return err instanceof TypeError;
}

function toError(err: unknown): TutorError {
  if (err instanceof TutorHttpError) {
    return { message: err.message, status: err.status, retryable: err.status === 0 || err.status === 409 || err.status >= 500 };
  }
  if (err instanceof TypeError) return { message: OFFLINE, status: 0, retryable: true };
  return { message: 'The tutor could not answer just now. Try again.', status: 0, retryable: true };
}

/**
 * One question's tutor conversation, in memory only.
 *
 * The server keeps the session (start resumes an open one), so nothing here
 * is persisted: a reload starts the panel again and the server says where the
 * student was. Every press carries a fresh clientMessageId. A network failure
 * (no response at all) is resent once, silently, with the SAME id, so the
 * server never runs a turn twice. Any HTTP answer is final for that id: the
 * Retry button sends the same action under a NEW id. Moving to another question drops everything and ignores any reply
 * still in flight for the old one.
 */
export function useTutorSession({ questionId, getToken }: { questionId: string | null; getToken: GetToken }): TutorSession {
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<TutorError | null>(null);
  const [latest, setLatest] = useState<TutorEnvelope | null>(null);
  const [started, setStarted] = useState(false);
  const [notReady, setNotReady] = useState(false);
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set());

  const genRef = useRef(0);
  const busyRef = useRef(false);
  const startedRef = useRef(false);
  const lastRef = useRef<{ action: TutorAction; clientMessageId: string } | null>(null);
  const qidRef = useRef(questionId);
  qidRef.current = questionId;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // A different question is a different conversation.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    genRef.current += 1;
    busyRef.current = false;
    startedRef.current = false;
    lastRef.current = null;
    setTurns([]);
    setPending(false);
    setError(null);
    setLatest(null);
    setStarted(false);
    setNotReady(false);
    setSaved(new Set());
  }, [questionId]);

  const run = useCallback(async (action: TutorAction, clientMessageId: string) => {
    const qid = qidRef.current;
    if (!qid) return;
    const gen = genRef.current;
    busyRef.current = true;
    setPending(true);
    setError(null);
    lastRef.current = { action, clientMessageId };
    try {
      const req = { questionId: qid, action, clientMessageId };
      let env: TutorEnvelope;
      try {
        env = await postTutorTurn(getTokenRef.current, req);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        // One resend, same id: the server answers a repeat from its store.
        env = await postTutorTurn(getTokenRef.current, req);
      }
      if (gen !== genRef.current) return;
      lastRef.current = null;
      if (!env.blocks.length && !env.chips.length) {
        // A save answers with nothing to show: keep the chips the student was
        // choosing from, and add no empty turn.
        setLatest((prev) => (prev ? { ...env, chips: prev.chips, phase: env.phase ?? prev.phase } : env));
        return;
      }
      setLatest(env);
      setTurns((prev) => [...prev, { id: nextId(), who: 'tutor', envelope: env }]);
    } catch (err) {
      if (gen !== genRef.current) return;
      if (action.type === 'save') {
        setSaved((prev) => {
          const next = new Set(prev);
          next.delete(action.ref);
          return next;
        });
      }
      if (err instanceof TutorHttpError && err.status === 404) {
        setNotReady(true);
        lastRef.current = null;
        return;
      }
      setError(toError(err));
    } finally {
      if (gen === genRef.current) {
        busyRef.current = false;
        setPending(false);
      }
    }
  }, []);

  const send = useCallback(
    async (action: TutorAction, label?: string | null) => {
      if (!qidRef.current || busyRef.current) return;
      // Set before the await so two taps in one tick cannot both pass.
      busyRef.current = true;
      if (label) setTurns((prev) => [...prev, { id: nextId(), who: 'student', text: label }]);
      if (action.type === 'save') setSaved((prev) => new Set(prev).add(action.ref));
      await run(action, newMessageId());
    },
    [run],
  );

  const start = useCallback(() => {
    if (startedRef.current || !qidRef.current) return;
    startedRef.current = true;
    setStarted(true);
    void send({ type: 'start' });
  }, [send]);

  /**
   * Send the failed press again, under a NEW id: the server did answer (or the
   * one silent resend failed too), so the old id is spent. No second student bubble.
   */
  const retry = useCallback(async () => {
    const last = lastRef.current;
    if (!last || busyRef.current) return;
    busyRef.current = true;
    if (last.action.type === 'save') setSaved((prev) => new Set(prev).add((last.action as { ref: string }).ref));
    await run(last.action, newMessageId());
  }, [run]);

  const openCheck = useMemo(() => {
    const phase = latest?.phase;
    if (phase !== 'guided' && phase !== 'diagnose') return null;
    for (let i = turns.length - 1; i >= 0; i--) {
      const blocks = turns[i].envelope?.blocks;
      if (!blocks) continue;
      for (let j = blocks.length - 1; j >= 0; j--) {
        const b = blocks[j];
        if (b.kind === 'check_question') return b;
      }
    }
    return null;
  }, [turns, latest]);

  return {
    questionId,
    turns,
    pending,
    error,
    latest,
    phase: latest?.phase ?? null,
    progress: latest?.progress ?? null,
    hintsUsed: latest?.hintsUsed ?? 0,
    started,
    notReady,
    saved,
    openCheck,
    start,
    send,
    retry,
  };
}
