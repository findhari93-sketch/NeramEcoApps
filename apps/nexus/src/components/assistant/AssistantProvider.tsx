'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { captureScreenshot } from '@/lib/capture-screenshot';
import { isTeamsPadPath } from '@/lib/pad/embedded';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
import {
  ASSISTANT_FLAG, AssistantHttpError, BRIEF_KEY, OFFLINE, cancelActionRequest, confirmActionRequest, loadThread, newThread, postTurn,
  type ActionProposal, type Attachment, type Envelope, type PageContext, type Suggestion,
} from './client';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  envelope?: Envelope | null;
  /** True while the reply is in flight; the list shows a skeleton for it. */
  pending?: boolean;
  /** A user message whose send failed. It stays on screen, marked, until Try again resends it. */
  failed?: boolean;
}

export interface AssistantContextValue {
  /** Student, flag on, not a pad page, not refused by the server. */
  enabled: boolean;
  open: boolean;
  openPanel: (intent?: string) => void;
  closePanel: () => void;
  messages: AssistantMessage[];
  /** True while a kept thread's messages load after a reload; the sheet shows a skeleton. */
  loadingHistory: boolean;
  busy: boolean;
  error: string | null;
  suggestions: Suggestion[];
  wantsAttachment: boolean;
  pendingAction: ActionProposal | null;
  /** The last send failed for a reason worth retrying; `retry` sends the same text and photo again. */
  canRetry: boolean;
  retry: () => Promise<void>;
  send: (text: string, attachment?: Attachment | null) => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => Promise<void>;
  newChat: () => Promise<void>;
  reportProblem: () => Promise<void>;
  pageContext: PageContext;
}

const Ctx = createContext<AssistantContextValue | null>(null);

const CANCEL_FAILED = 'Could not cancel just now. The action is still waiting and expires on its own in a few minutes.';

/**
 * The sentence a student sees for a failed call (Ruling 26). The server's own
 * sentence when it answered (it never carries raw database text); a plain
 * offline line when the request never left the phone; never "Failed to fetch".
 */
function messageFor(err: unknown): string {
  if (err instanceof AssistantHttpError) return err.message;
  if (err instanceof TypeError) return OFFLINE;
  return 'Something went wrong on my side. Please try again.';
}
const THREAD_KEY = 'nexus-assistant-thread';

let seq = 0;
const nextId = () => `m${Date.now()}-${++seq}`;

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { isStudent, isFeatureEnabled, getToken, tokenReady, parentSession } = useNexusAuthContext();
  const pathname = usePathname() || '/';
  const { mutate } = useSWRConfig();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [wantsAttachment, setWantsAttachment] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionProposal | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [refused, setRefused] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [autoShot, setAutoShot] = useState<File | null>(null);
  const threadRef = useRef<string | null>(null);
  /** Set synchronously so two taps in one tick cannot both pass the guard. */
  const busyRef = useRef(false);
  const newChatRef = useRef(false);
  /** Bumped by newChat: a reply from an older generation is dropped. */
  const genRef = useRef(0);
  /** The kept thread is loaded once per page session, on the first open. */
  const historyTriedRef = useRef(false);
  /** Set by the first send: a history that lands after it must not replace the live turn. */
  const sentRef = useRef(false);
  const reportingRef = useRef(false);
  /** The send Try again repeats: the failed bubble's id, its text and photo. */
  const failedRef = useRef<{ id: string; text: string; attachment: Attachment | null } | null>(null);

  useEffect(() => {
    try {
      threadRef.current = window.sessionStorage.getItem(THREAD_KEY);
    } catch {
      threadRef.current = null;
    }
  }, []);

  const pageContext = useMemo<PageContext>(() => ({ path: pathname }), [pathname]);
  // /api/auth/me folds the pilot allowlist into the flag (Ruling 22), so a student
  // outside a non-empty pilot reads it as off here, exactly as the server gate refuses them.
  // The brief card, the launcher and the top-bar icon all gate on this one value.
  const enabled = isStudent && tokenReady && !parentSession.active && !isTeamsPadPath(pathname) && isFeatureEnabled(ASSISTANT_FLAG) && !refused;

  // A link in a reply (or any other navigation) closes the panel, so the new
  // page is not left hidden under it.
  const lastPathRef = useRef(pathname);
  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    setOpen(false);
  }, [pathname]);

  const forgetThread = useCallback(() => {
    threadRef.current = null;
    try {
      window.sessionStorage.removeItem(THREAD_KEY);
    } catch {
      /* private mode */
    }
  }, []);

  /**
   * After a reload the thread id survives in sessionStorage and the server may
   * still be mid-flow on it, so show where the chat was rather than the menu: a
   * quick action tapped on an empty panel would otherwise land in that flow. A
   * thread that cannot be loaded is forgotten and the next message starts fresh.
   * Never touches the feature gate (Ruling 14). The action card is not restored:
   * its token may have expired, and the flow asks again.
   */
  useEffect(() => {
    if (!open || !enabled || historyTriedRef.current) return;
    historyTriedRef.current = true;
    const id = threadRef.current;
    // Opened with an intent (the brief card's Can't attend): the send already
    // owns the thread, and a history that lands after it would be dropped anyway.
    if (!id || sentRef.current) return;
    const gen = genRef.current;
    setLoadingHistory(true);
    loadThread(getToken, id)
      .then((rows) => {
        if (gen !== genRef.current || threadRef.current !== id || sentRef.current) return;
        setMessages((prev) => (prev.length ? prev : rows.map((m) => ({
          id: m.id, role: m.role, text: m.role === 'user' && m.text === '(photo)' ? 'Photo attached' : m.text, envelope: m.envelope,
        }))));
        const last = rows[rows.length - 1];
        if (last?.role === 'assistant' && last.envelope) {
          setSuggestions(last.envelope.suggestions || []);
          setWantsAttachment(Boolean(last.envelope.wantsAttachment));
        }
      })
      .catch(() => {
        // Forget it only if nothing has used it since: a send that started meanwhile
        // may be continuing this very thread, and must keep it.
        if (gen === genRef.current && !sentRef.current && threadRef.current === id) forgetThread();
      })
      .finally(() => setLoadingHistory(false));
  }, [open, enabled, getToken, forgetThread]);

  const applyEnvelope = useCallback((env: Envelope, userText: string | null) => {
    threadRef.current = env.threadId;
    try {
      window.sessionStorage.setItem(THREAD_KEY, env.threadId);
    } catch {
      /* private mode: the thread simply does not survive a reload */
    }
    setMessages((prev) => {
      const withoutPending = prev.filter((m) => !m.pending);
      const user = userText ? [{ id: nextId(), role: 'user' as const, text: userText }] : [];
      return [...withoutPending, ...user, { id: nextId(), role: 'assistant' as const, text: env.reply, envelope: env }];
    });
    setSuggestions(env.suggestions);
    setWantsAttachment(Boolean(env.wantsAttachment));
    setPendingAction(env.action);
  }, []);

  /**
   * Only the turn route and the threads route speak for the feature gate: a 404
   * (flag off) or 403 (not a student, not in the pilot) there hides the assistant
   * for the session. The action routes answer 403/404/409/410 for a stale or
   * foreign action, which says nothing about the feature, so they never come here.
   */
  const fail = useCallback((err: unknown): boolean => {
    setMessages((prev) => prev.filter((m) => !m.pending));
    if (err instanceof AssistantHttpError && (err.status === 403 || err.status === 404)) {
      setRefused(true);
      setOpen(false);
      return false;
    }
    setError(messageFor(err));
    return true;
  }, []);

  /** A confirm or cancel the server refused as stale: drop the card, say why, keep the assistant on. */
  const actionGone = useCallback((err: unknown): boolean => {
    // 400: the confirm re-check refused it (a day passed, a class moved). The server's
    // sentence says why, and the card can no longer be confirmed.
    if (!(err instanceof AssistantHttpError) || ![400, 403, 404, 409, 410].includes(err.status)) return false;
    setPendingAction(null);
    setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: err.message || 'That action has expired. Ask me again.' }]);
    return true;
  }, []);

  const send = useCallback(async (text: string, attachment: Attachment | null = null) => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || busyRef.current) return;
    const gen = genRef.current;
    busyRef.current = true;
    sentRef.current = true;
    failedRef.current = null;
    setCanRetry(false);
    setLoadingHistory(false);
    setError(null);
    setBusy(true);
    setPendingAction(null);
    const userId = nextId();
    setMessages((prev) => [...prev, { id: userId, role: 'user', text: trimmed || 'Photo attached' }, { id: nextId(), role: 'assistant', text: '', pending: true }]);
    try {
      const env = await postTurn(getToken, { threadId: threadRef.current, text: trimmed, attachment, pageContext });
      if (gen === genRef.current) applyEnvelope(env, null);
    } catch (err) {
      // The student's message is never lost: the bubble stays, marked, and Try
      // again sends the same text and photo.
      if (gen === genRef.current && fail(err)) {
        failedRef.current = { id: userId, text: trimmed, attachment };
        setMessages((prev) => prev.map((m) => (m.id === userId ? { ...m, failed: true } : m)));
        setCanRetry(true);
      }
    } finally {
      if (gen === genRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [applyEnvelope, fail, getToken, pageContext]);

  const confirm = useCallback(async () => {
    if (!pendingAction || busyRef.current) return;
    const gen = genRef.current;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const out = await confirmActionRequest(getToken, pendingAction.id, pendingAction.confirmToken);
      if (gen !== genRef.current) return;
      setPendingAction(null);
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: out.reply, envelope: { reply: out.reply, suggestions: [], links: out.links, action: null, mode: 'general', threadId: out.threadId || threadRef.current || '' } }]);
      // A declined class or a new reminder changes the day: refetch the brief card
      // under what is on screen (one argument, so it never blanks to a skeleton).
      void mutate(BRIEF_KEY);
    } catch (err) {
      if (gen !== genRef.current) return;
      if (!actionGone(err)) setError(messageFor(err));
    } finally {
      if (gen === genRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [actionGone, getToken, mutate, pendingAction]);

  const cancel = useCallback(async () => {
    if (!pendingAction) return;
    const id = pendingAction.id;
    const gen = genRef.current;
    setPendingAction(null);
    try {
      const out = await cancelActionRequest(getToken, id);
      if (gen === genRef.current) setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: out.reply }]);
    } catch (err) {
      // A stale action explains itself; anything else (offline, a 500) must not
      // leave the student believing the cancel went through.
      if (gen === genRef.current && !actionGone(err)) setError(CANCEL_FAILED);
    }
  }, [actionGone, getToken, pendingAction]);

  const retry = useCallback(async () => {
    const failed = failedRef.current;
    if (!failed || busyRef.current) return;
    // The resend puts the message back as a fresh bubble, so drop the failed one first.
    setMessages((prev) => prev.filter((m) => m.id !== failed.id));
    await send(failed.text, failed.attachment);
  }, [send]);

  const newChat = useCallback(async () => {
    if (newChatRef.current) return;
    newChatRef.current = true;
    // Abandon any turn in flight: its reply must not land in the new chat.
    const gen = ++genRef.current;
    busyRef.current = false;
    // Drop the old thread at once: a message sent before the new id arrives, or
    // after newThread fails, starts a fresh thread instead of feeding the old flow.
    forgetThread();
    sentRef.current = true;
    setLoadingHistory(false);
    setBusy(false);
    setMessages([]);
    setSuggestions([]);
    setPendingAction(null);
    setWantsAttachment(false);
    setError(null);
    failedRef.current = null;
    setCanRetry(false);
    try {
      const id = await newThread(getToken, pageContext);
      // A send that already started its own thread keeps it.
      if (gen !== genRef.current || threadRef.current) return;
      threadRef.current = id;
      try {
        window.sessionStorage.setItem(THREAD_KEY, id);
      } catch {
        /* private mode */
      }
    } catch (err) {
      if (gen === genRef.current) fail(err);
    } finally {
      newChatRef.current = false;
    }
  }, [fail, forgetThread, getToken, pageContext]);

  const openPanel = useCallback((intent?: string) => {
    setOpen(true);
    if (intent) void send(intent);
  }, [send]);

  const closePanel = useCallback(() => setOpen(false), []);

  /** Close first, then shoot, so the sheet is not in the picture. */
  const reportProblem = useCallback(async () => {
    // A double tap during the close would shoot twice and open the form twice.
    if (reportingRef.current) return;
    reportingRef.current = true;
    try {
      setOpen(false);
      await new Promise((r) => setTimeout(r, 350));
      const shot = await captureScreenshot();
      setAutoShot(shot);
      setReportOpen(true);
    } finally {
      reportingRef.current = false;
    }
  }, []);

  const value = useMemo<AssistantContextValue>(() => ({
    enabled, open, openPanel, closePanel, messages, loadingHistory, busy, error, suggestions, wantsAttachment, pendingAction,
    canRetry, retry, send, confirm, cancel, newChat, reportProblem, pageContext,
  }), [enabled, open, openPanel, closePanel, messages, loadingHistory, busy, error, suggestions, wantsAttachment, pendingAction, canRetry, retry, send, confirm, cancel, newChat, reportProblem, pageContext]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* With the assistant off, the old Report a problem button brings its own form. */}
      {(enabled || reportOpen) && (
        <ReportIssueDialog
          open={reportOpen}
          onClose={() => { setReportOpen(false); setAutoShot(null); }}
          getToken={getToken}
          pageUrl={pathname}
          initialScreenshotFile={autoShot}
        />
      )}
    </Ctx.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAssistant must be used inside AssistantProvider');
  return v;
}

/** For chrome shared with other roles (TopBar): null when no provider is mounted. */
export function useAssistantOptional(): AssistantContextValue | null {
  return useContext(Ctx);
}
