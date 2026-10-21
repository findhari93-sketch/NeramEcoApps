'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Drawer, IconButton, TextField, Typography } from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { getFirebaseAuth } from '@neram/auth';
import { readSseStream } from '@neram/ui/chat-stream';
import AskText from '@/components/ask/AskText';
import type { AintraCard, AintraEvent } from '@/lib/aintra/cards';
import AintraAvatar from './AintraAvatar';
import AintraCardView from './AintraCardView';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  cards: AintraCard[];
  streaming?: boolean;
  status?: string;
  failed?: boolean;
}

/** The jobs a student can tap first: what Aintra does inside the app. */
export const STARTERS = [
  'What is my application status?',
  'What fees do I owe?',
  'Raise a support ticket',
  'Set my exam year',
  'Which colleges can I get?',
];

const SUGGEST = /\[\[suggest:([^\]]*)\]\]/i;

/** The answer without its [[suggest: a | b]] line, and the chips from it. */
export function splitSuggest(text: string): { body: string; suggestions: string[] } {
  const m = SUGGEST.exec(text);
  const suggestions = m ? m[1].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 3) : [];
  // While streaming, hide a half-written [[suggest too.
  const body = text.replace(SUGGEST, '').replace(/\[\[[^\]]*$/, '').trim();
  return { body, suggestions };
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function idToken(): Promise<string | null> {
  try {
    return (await getFirebaseAuth().currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

function Chip({ text, onPick, disabled }: { text: string; onPick: (t: string) => void; disabled?: boolean }) {
  return (
    <ButtonBase
      onClick={() => onPick(text)}
      disabled={disabled}
      sx={{
        minHeight: 44,
        px: 2,
        borderRadius: 999,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        color: 'text.primary',
        fontFamily: 'inherit',
        fontSize: '0.9375rem',
        fontWeight: 600,
        textAlign: 'left',
        transition: 'background-color 150ms',
        '&:hover': { bgcolor: 'action.hover' },
        '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {text}
    </ButtonBase>
  );
}

export default function AintraPanel({ open, onClose, takeQuestion }: { open: boolean; onClose: () => void; takeQuestion: () => string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionId] = useState(() => `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const patch = useCallback((id: string, f: (m: Message) => Message) => setMessages((prev) => prev.map((m) => (m.id === id ? f(m) : m))), []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      const history = messages.filter((m) => m.text && !m.failed && !m.streaming).slice(-10).map((m) => ({ role: m.role, text: splitSuggest(m.text).body }));
      const answerId = newId();
      setMessages((prev) => [...prev, { id: newId(), role: 'user', text, cards: [] }, { id: answerId, role: 'model', text: '', cards: [], streaming: true }]);
      setInput('');
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let streamed = '';
      try {
        const token = await idToken();
        const res = await fetch('/api/aintra', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ message: text, history, sessionId, pageUrl: window.location.pathname }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Aintra could not answer just now.');
        }
        let failure: string | null = null;
        await readSseStream<AintraEvent>(res, (e) => {
          if (e.t === 'delta') {
            streamed += e.text;
            patch(answerId, (m) => ({ ...m, text: streamed, status: undefined }));
          } else if (e.t === 'reset') {
            streamed = '';
            patch(answerId, (m) => ({ ...m, text: '' }));
          } else if (e.t === 'status') {
            patch(answerId, (m) => ({ ...m, status: e.text }));
          } else if (e.t === 'card') {
            patch(answerId, (m) => ({ ...m, cards: [...m.cards, e.card] }));
          } else if (e.t === 'error') {
            failure = e.error;
          }
        });
        if (failure) throw new Error(failure);
        patch(answerId, (m) => ({ ...m, streaming: false, status: undefined }));
      } catch (err) {
        if (controller.signal.aborted) return;
        patch(answerId, (m) => ({
          ...m,
          streaming: false,
          status: undefined,
          failed: true,
          text: err instanceof Error ? err.message : 'Aintra could not answer just now. Please try again.',
        }));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, messages, patch, sessionId],
  );

  // A question handed in by the opener (?aintra=..., or a page's "Ask Aintra"):
  // taken once each time the panel opens, never again on a re-render.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!open) return;
    const q = takeQuestion();
    if (q) void sendRef.current(q);
    // Only on opening: `send` changes with every message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const latest = [...messages].reverse().find((m) => m.role === 'model');

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': 'aintra-panel-title',
        sx: { width: { xs: '100%', sm: 440 }, maxWidth: '100vw', display: 'flex', flexDirection: 'column' },
      }}
      ModalProps={{ keepMounted: true }}
    >
      <Box
        component="header"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 2,
          pt: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          pb: 1,
          minHeight: 64,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <AintraAvatar size={36} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography id="aintra-panel-title" component="h2" sx={{ fontWeight: 800, fontSize: '1.0625rem', lineHeight: 1.2 }}>
            Aintra
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            Your Neram assistant
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close Aintra" sx={{ width: 48, height: 48 }}>
          <CloseRoundedIcon />
        </IconButton>
      </Box>

      <Box ref={listRef} aria-live="polite" sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', px: 2, py: 2, display: 'grid', alignContent: 'start', gap: 2.5 }}>
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 3, display: 'grid', justifyItems: 'center', gap: 1.25 }}>
            <AintraAvatar size={64} />
            <Typography component="p" sx={{ fontWeight: 800, fontSize: '1.125rem' }}>
              Hi, I am Aintra
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: '1rem', lineHeight: 1.6, maxWidth: 340 }}>
              I work inside Neram for you. I can check your application and fees, raise a ticket, set your exam year and more.
            </Typography>
            <Box role="group" aria-label="Things Aintra can do for you" sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, mt: 1 }}>
              {STARTERS.map((s) => (
                <Chip key={s} text={s} onPick={send} disabled={busy} />
              ))}
            </Box>
          </Box>
        )}

        {messages.map((m) => {
          if (m.role === 'user') {
            return (
              <Box
                key={m.id}
                data-testid="aintra-user-message"
                sx={{ justifySelf: 'end', maxWidth: '85%', px: 2, py: 1.25, borderRadius: '18px 18px 4px 18px', bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: '1rem', lineHeight: 1.5, overflowWrap: 'anywhere' }}
              >
                {m.text}
              </Box>
            );
          }
          const { body, suggestions } = splitSuggest(m.text);
          return (
            <Box key={m.id} data-testid="aintra-answer" data-streaming={m.streaming ? 'true' : 'false'} sx={{ display: 'grid', gap: 1.25, minWidth: 0 }}>
              {m.failed ? (
                <Alert severity="error" role="alert">
                  {m.text}
                </Alert>
              ) : body ? (
                <AskText text={body} />
              ) : m.streaming ? (
                <Typography role="status" color="text.secondary" sx={{ fontSize: '0.9375rem' }}>
                  {m.status ?? 'Aintra is thinking...'}
                </Typography>
              ) : null}
              {m.cards.map((c, i) => (
                <AintraCardView key={i} card={c} getToken={idToken} />
              ))}
              {m === latest && !m.streaming && !busy && suggestions.length > 0 && (
                <Box role="group" aria-label="Suggested follow-ups" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {suggestions.map((s) => (
                    <Chip key={s} text={s} onPick={send} />
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', px: 2, pt: 1.25, pb: 'calc(env(safe-area-inset-bottom, 0px) + 12px)', borderTop: 1, borderColor: 'divider' }}
      >
        <TextField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask or tell me what to do"
          fullWidth
          multiline
          maxRows={4}
          inputProps={{ 'aria-label': 'Message Aintra', maxLength: 500, style: { fontSize: 16 }, 'data-testid': 'aintra-input' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48, borderRadius: 3 } }}
        />
        <IconButton type="submit" aria-label="Send message" disabled={busy || !input.trim()} color="primary" sx={{ width: 48, height: 48, flexShrink: 0 }}>
          <SendRoundedIcon />
        </IconButton>
      </Box>
    </Drawer>
  );
}
