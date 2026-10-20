'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getFirebaseAuth, useFirebaseAuth } from '@neram/auth';
import { cardSummary, type AskCard } from '@/lib/ask/cards';
import type { AskFacts } from '@/lib/ask/memory';
import { SIGNUP_REQUIRED, readAskStream, splitSuggestions } from '@/lib/ask/stream';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: AskCard[];
  suggestions: string[];
  /** A tool is running: "Checking last year's allotments...". */
  status?: string | null;
  streaming?: boolean;
  error?: string | null;
}

export interface ThreadSummary {
  id: string;
  title: string | null;
  last_message_at: string | null;
}

const PENDING_KEY = 'neram_ask_pending';

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A question kept while a guest signs in, sent once they are back (this tab only). */
export function savePendingQuestion(text: string) {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ text, ts: Date.now() }));
  } catch {
    // Private mode: they type it again.
  }
}

function takePendingQuestion(): string | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    window.sessionStorage.removeItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { text?: string; ts?: number };
    return typeof p.text === 'string' && Date.now() - (p.ts ?? 0) < 30 * 60 * 1000 ? p.text : null;
  } catch {
    return null;
  }
}

/**
 * The chat state: messages, remembered details, the guest allowance and the
 * thread. Talks to /api/ask (streamed) and /api/ask/session.
 */
export function useAskChat(opts: { pageContext?: string | null; prefill?: Record<string, unknown> | null }) {
  const { user, loading: authLoading } = useFirebaseAuth();
  const signedIn = !authLoading && !!user;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [facts, setFacts] = useState<AskFacts>({});
  const [guestRemaining, setGuestRemaining] = useState<number | null>(null);
  const [guestLimit, setGuestLimit] = useState(3);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const patch = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const loadSession = useCallback(async (thread?: string | null) => {
    try {
      const res = await fetch(`/api/ask/session${thread ? `?thread=${encodeURIComponent(thread)}` : ''}`, {
        headers: await authHeaders(),
        credentials: 'same-origin',
      });
      if (!res.ok) return null;
      const data = await res.json();
      setFacts(data.facts ?? {});
      setThreads(Array.isArray(data.threads) ? data.threads : []);
      if (data.guest) {
        setGuestRemaining(data.guest.remaining);
        setGuestLimit(data.guest.limit);
      } else setGuestRemaining(null);
      return data as { messages?: Array<{ id: string; role: 'user' | 'assistant'; text: string; cards: AskCard[] }> };
    } catch {
      return null;
    }
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setNeedsSignIn(null);
      const userMsg: ChatMessage = { id: newId(), role: 'user', text, cards: [], suggestions: [] };
      const reply: ChatMessage = { id: newId(), role: 'assistant', text: '', cards: [], suggestions: [], streaming: true, status: null };
      const history = messagesRef.current
        .filter((m) => !m.error && (m.text || m.cards.length))
        .slice(-10)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text, cards: m.cards.map(cardSummary) }));
      setMessages((prev) => [...prev, userMsg, reply]);
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          credentials: 'same-origin',
          signal: controller.signal,
          body: JSON.stringify({ message: text, threadId, history, pageContext: opts.pageContext ?? null, prefill: opts.prefill ?? null }),
        });
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (data?.code === SIGNUP_REQUIRED) {
            // Take the question back out of the chat; it is sent again after sign-in.
            setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== reply.id));
            setGuestRemaining(0);
            setNeedsSignIn(text);
            return;
          }
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          patch(reply.id, (m) => ({ ...m, streaming: false, error: data?.error || 'Something went wrong. Please try again.' }));
          return;
        }
        let acc = '';
        await readAskStream(res, (ev) => {
          switch (ev.t) {
            case 'meta':
              if (ev.threadId) setThreadId(ev.threadId);
              if (ev.guestRemaining != null) setGuestRemaining(ev.guestRemaining);
              break;
            case 'status':
              patch(reply.id, (m) => ({ ...m, status: ev.text }));
              break;
            case 'delta':
              acc += ev.text;
              patch(reply.id, (m) => ({ ...m, text: splitSuggestions(acc).body }));
              break;
            case 'reset':
              acc = '';
              patch(reply.id, (m) => ({ ...m, text: '' }));
              break;
            case 'card':
              patch(reply.id, (m) => ({ ...m, status: null, cards: [...m.cards, ev.card] }));
              break;
            case 'facts':
              setFacts(ev.facts);
              break;
            case 'done':
              patch(reply.id, (m) => ({ ...m, status: null, streaming: false, text: splitSuggestions(acc).body, suggestions: ev.suggestions }));
              break;
            case 'error':
              patch(reply.id, (m) => ({ ...m, status: null, streaming: false, error: ev.error }));
              break;
          }
        });
        patch(reply.id, (m) => ({ ...m, streaming: false, status: null }));
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          patch(reply.id, (m) => ({ ...m, streaming: false, status: null }));
        } else {
          patch(reply.id, (m) => ({ ...m, streaming: false, status: null, error: 'You seem to be offline. Check your connection and try again.' }));
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, threadId, opts.pageContext, opts.prefill, patch]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const updateFacts = useCallback(async (change: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/ask/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        credentials: 'same-origin',
        body: JSON.stringify({ facts: change }),
      });
      if (res.ok) setFacts((await res.json()).facts ?? {});
    } catch {
      // The strip keeps the old value; nothing else depends on it.
    }
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      const data = await loadSession(id);
      if (!data?.messages) return;
      setThreadId(id);
      setMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          cards: Array.isArray(m.cards) ? m.cards : [],
          suggestions: [],
        }))
      );
    },
    [loadSession]
  );

  const newChat = useCallback(() => {
    stop();
    setThreadId(null);
    setMessages([]);
    setNeedsSignIn(null);
  }, [stop]);

  // First load, and again whenever sign-in changes. A guest who just signed in
  // gets their chats and details moved to the account, then the question they
  // were stopped at is sent.
  const sentPending = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      if (signedIn) {
        try {
          await fetch('/api/ask/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            credentials: 'same-origin',
            body: JSON.stringify({ action: 'claim' }),
          });
        } catch {
          // Their guest chats stay where they were; nothing is lost.
        }
      }
      await loadSession();
      if (cancelled) return;
      setReady(true);
      if (signedIn && !sentPending.current) {
        const pending = takePendingQuestion();
        if (pending) {
          sentPending.current = true;
          setNeedsSignIn(null);
          void send(pending);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // send is stable enough here: it only runs once per sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, signedIn, loadSession]);

  return {
    signedIn,
    ready,
    messages,
    facts,
    guestRemaining,
    guestLimit,
    threads,
    threadId,
    busy,
    needsSignIn,
    send,
    stop,
    updateFacts,
    openThread,
    newChat,
  };
}
