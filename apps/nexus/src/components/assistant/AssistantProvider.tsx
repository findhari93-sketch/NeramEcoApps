'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { captureScreenshot } from '@/lib/capture-screenshot';
import { isTeamsPadPath } from '@/lib/pad/embedded';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
import {
  ASSISTANT_FLAG, AssistantHttpError, cancelActionRequest, confirmActionRequest, newThread, postTurn,
  type ActionProposal, type Attachment, type Envelope, type PageContext, type Suggestion,
} from './client';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  envelope?: Envelope | null;
  /** True while the reply is in flight; the list shows a skeleton for it. */
  pending?: boolean;
}

export interface AssistantContextValue {
  /** Student, flag on, not a pad page, not refused by the server. */
  enabled: boolean;
  open: boolean;
  openPanel: (intent?: string) => void;
  closePanel: () => void;
  messages: AssistantMessage[];
  busy: boolean;
  error: string | null;
  suggestions: Suggestion[];
  wantsAttachment: boolean;
  pendingAction: ActionProposal | null;
  /** Text the composer should show, set by Edit on an action card. */
  draft: string;
  setDraft: (text: string) => void;
  send: (text: string, attachment?: Attachment | null) => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => Promise<void>;
  newChat: () => Promise<void>;
  reportProblem: () => Promise<void>;
  pageContext: PageContext;
}

const Ctx = createContext<AssistantContextValue | null>(null);
const THREAD_KEY = 'nexus-assistant-thread';

let seq = 0;
const nextId = () => `m${Date.now()}-${++seq}`;

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { isStudent, isFeatureEnabled, getToken, tokenReady, parentSession } = useNexusAuthContext();
  const pathname = usePathname() || '/';

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [wantsAttachment, setWantsAttachment] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionProposal | null>(null);
  const [draft, setDraft] = useState('');
  const [refused, setRefused] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [autoShot, setAutoShot] = useState<File | null>(null);
  const threadRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      threadRef.current = window.sessionStorage.getItem(THREAD_KEY);
    } catch {
      threadRef.current = null;
    }
  }, []);

  const pageContext = useMemo<PageContext>(() => ({ path: pathname }), [pathname]);
  const enabled = isStudent && tokenReady && !parentSession.active && !isTeamsPadPath(pathname) && isFeatureEnabled(ASSISTANT_FLAG) && !refused;

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

  const fail = useCallback((err: unknown) => {
    setMessages((prev) => prev.filter((m) => !m.pending));
    if (err instanceof AssistantHttpError && (err.status === 403 || err.status === 404)) {
      setRefused(true);
      setOpen(false);
      return;
    }
    setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
  }, []);

  const send = useCallback(async (text: string, attachment: Attachment | null = null) => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || busy) return;
    setError(null);
    setBusy(true);
    setPendingAction(null);
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: trimmed || 'Photo attached' }, { id: nextId(), role: 'assistant', text: '', pending: true }]);
    try {
      const env = await postTurn(getToken, { threadId: threadRef.current, text: trimmed, attachment, pageContext });
      applyEnvelope(env, null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [applyEnvelope, busy, fail, getToken, pageContext]);

  const confirm = useCallback(async () => {
    if (!pendingAction || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await confirmActionRequest(getToken, pendingAction.id, pendingAction.confirmToken);
      setPendingAction(null);
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: out.reply, envelope: { reply: out.reply, suggestions: [], links: out.links, action: null, mode: 'general', threadId: out.threadId || threadRef.current || '' } }]);
    } catch (err) {
      if (err instanceof AssistantHttpError && [409, 410].includes(err.status)) setPendingAction(null);
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [busy, fail, getToken, pendingAction]);

  const cancel = useCallback(async () => {
    if (!pendingAction) return;
    const id = pendingAction.id;
    setPendingAction(null);
    try {
      const out = await cancelActionRequest(getToken, id);
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: out.reply }]);
    } catch {
      /* already gone is fine */
    }
  }, [getToken, pendingAction]);

  const newChat = useCallback(async () => {
    setMessages([]);
    setSuggestions([]);
    setPendingAction(null);
    setWantsAttachment(false);
    setError(null);
    try {
      threadRef.current = await newThread(getToken, pageContext);
      window.sessionStorage.setItem(THREAD_KEY, threadRef.current);
    } catch (err) {
      fail(err);
    }
  }, [fail, getToken, pageContext]);

  const openPanel = useCallback((intent?: string) => {
    setOpen(true);
    if (intent) void send(intent);
  }, [send]);

  const closePanel = useCallback(() => setOpen(false), []);

  /** Close first, then shoot, so the sheet is not in the picture. */
  const reportProblem = useCallback(async () => {
    setOpen(false);
    await new Promise((r) => setTimeout(r, 350));
    const shot = await captureScreenshot();
    setAutoShot(shot);
    setReportOpen(true);
  }, []);

  const value = useMemo<AssistantContextValue>(() => ({
    enabled, open, openPanel, closePanel, messages, busy, error, suggestions, wantsAttachment, pendingAction,
    draft, setDraft, send, confirm, cancel, newChat, reportProblem, pageContext,
  }), [enabled, open, openPanel, closePanel, messages, busy, error, suggestions, wantsAttachment, pendingAction, draft, send, confirm, cancel, newChat, reportProblem, pageContext]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ReportIssueDialog
        open={reportOpen}
        onClose={() => { setReportOpen(false); setAutoShot(null); }}
        getToken={getToken}
        pageUrl={pathname}
        initialScreenshotFile={autoShot}
      />
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
