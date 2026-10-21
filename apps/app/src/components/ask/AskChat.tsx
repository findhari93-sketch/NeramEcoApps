'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { cutoffPrefillFromSearch } from '@neram/tools-core/cutoff';
import type { AskCard } from '@/lib/ask/cards';
import AskCardView from './AskCardView';
import AintraAvatar from '@/components/aintra/AintraAvatar';
import AskText from './AskText';
import { Composer, MemoryStrip, SignInGateCard, useAskSignIn } from './AskParts';
import { useAskChat, type ChatMessage } from './useAskChat';


function Dots() {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        display: 'inline-flex',
        gap: 0.5,
        '& span': {
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: 'text.secondary',
          animation: 'askDot 1.2s infinite ease-in-out',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.6 },
        },
        '& span:nth-of-type(2)': { animationDelay: '0.15s' },
        '& span:nth-of-type(3)': { animationDelay: '0.3s' },
        '@keyframes askDot': { '0%, 80%, 100%': { opacity: 0.25 }, '40%': { opacity: 1 } },
      }}
    >
      <span />
      <span />
      <span />
    </Box>
  );
}

function AssistantMessage({
  m,
  isLast,
  onSuggest,
  onExpand,
  onSignIn,
}: {
  m: ChatMessage;
  isLast: boolean;
  onSuggest: (q: string) => void;
  onExpand: (c: AskCard) => void;
  onSignIn: () => void;
}) {
  const waiting = m.streaming && !m.text && m.cards.length === 0;
  return (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
      <Box aria-hidden="true" sx={{ mt: 0.25, flexShrink: 0 }}>
        <AintraAvatar size={32} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 1.5 }}>
        {m.text && <AskText text={m.text} />}
        {m.cards.map((c) => (
          <AskCardView key={c.id} card={c} onExpand={onExpand} onSignIn={onSignIn} />
        ))}
        {m.status && (
          <Box role="status" sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Dots /> {m.status}
            </Typography>
            <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2.5 }} />
          </Box>
        )}
        {waiting && !m.status && (
          <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>
            <Dots /> Thinking
          </Typography>
        )}
        {m.error && (
          <Box role="alert" sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', color: 'error.main' }}>
            <ErrorOutlineRoundedIcon aria-hidden="true" sx={{ fontSize: 20, mt: '2px' }} />
            <Typography variant="body2" sx={{ color: 'text.primary' }}>
              {m.error}
            </Typography>
          </Box>
        )}
        {isLast && !m.streaming && m.suggestions.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} aria-label="Suggested questions">
            {m.suggestions.map((s) => (
              <Button
                key={s}
                variant="outlined"
                onClick={() => onSuggest(s)}
                sx={{ minHeight: 44, borderRadius: 5, textTransform: 'none', fontWeight: 500, textAlign: 'left', lineHeight: 1.3, py: 0.75 }}
              >
                {s}
              </Button>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * Aintra (Tools app): the chat. `intro` is the server-rendered welcome (heading,
 * starter questions, why it beats a general chatbot); it shows until the first
 * question and is what crawlers read.
 */
export default function AskChat({ intro }: { intro: ReactNode }) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  // Values arriving in the URL: ?q= (a question to send), calculator values
  // (?board=&marks=…) and ?from= (the tool page that opened the chat).
  const [urlState] = useState(() => {
    if (typeof window === 'undefined') return { q: null as string | null, from: null as string | null, prefill: null as Record<string, unknown> | null };
    const params = new URLSearchParams(window.location.search);
    const prefill = cutoffPrefillFromSearch(window.location.search);
    return { q: params.get('q'), from: params.get('from'), prefill: prefill as Record<string, unknown> | null };
  });

  const chat = useAskChat({ pageContext: urlState.from, prefill: urlState.prefill });
  const signIn = useAskSignIn();
  const [expanded, setExpanded] = useState<AskCard | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const sentFromUrl = useRef(false);

  // Send ?q= once, then tidy the address bar so a refresh does not ask again.
  useEffect(() => {
    if (!chat.ready || sentFromUrl.current) return;
    sentFromUrl.current = true;
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
    if (urlState.q) void chat.send(urlState.q.slice(0, 1000));
  }, [chat.ready, chat, urlState.q]);

  const lastText = chat.messages[chat.messages.length - 1];
  const scrollKey = `${chat.messages.length}:${lastText?.cards.length ?? 0}:${lastText?.status ?? ''}:${chat.needsSignIn ?? ''}`;
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [scrollKey]);

  const lastUserQuestion = useMemo(() => [...chat.messages].reverse().find((m) => m.role === 'user')?.text ?? null, [chat.messages]);
  const startSignIn = (q?: string | null) => signIn.start(q ?? lastUserQuestion);

  const empty = chat.messages.length === 0;
  const guestNote =
    chat.guestRemaining != null
      ? chat.guestRemaining > 0
        ? `${chat.guestRemaining} of ${chat.guestLimit} free answers left today. Sign in for unlimited.`
        : 'Free answers used for today. Sign in free to keep going.'
      : 'Numbers come from official allotment lists. Check with the counselling authority before you decide.';

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', width: '100%', display: 'flex', flexDirection: 'column', minHeight: { xs: 'calc(100dvh - 140px)', md: 'calc(100dvh - 120px)' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, mb: 1, minHeight: 44 }}>
        {!empty && (
          <Button onClick={chat.newChat} startIcon={<AddCommentOutlinedIcon />} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
            New chat
          </Button>
        )}
        {chat.signedIn && chat.threads.length > 0 && (
          <Button onClick={() => setHistoryOpen(true)} startIcon={<HistoryRoundedIcon />} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
            Past chats
          </Button>
        )}
      </Box>

      <MemoryStrip facts={chat.facts} onForget={(keys) => chat.updateFacts(Object.fromEntries(keys.map((k) => [k, null])))} />

      <Box sx={{ flex: 1 }}>
        {empty && !chat.needsSignIn ? (
          <Box
            onClick={(e) => {
              // Starter questions are links for crawlers; in the app they send straight away.
              const a = (e.target as HTMLElement).closest('a[data-ask-starter]');
              if (!a) return;
              e.preventDefault();
              void chat.send(a.getAttribute('data-ask-starter') || '');
            }}
          >
            {intro}
          </Box>
        ) : (
          <Box role="log" aria-live="polite" aria-label="Conversation" sx={{ display: 'grid', gap: 3, pb: 2 }}>
            {chat.messages.map((m, i) =>
              m.role === 'user' ? (
                <Box key={m.id} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Box
                    sx={{
                      maxWidth: '85%',
                      px: 2,
                      py: 1.25,
                      borderRadius: 3,
                      borderBottomRightRadius: 6,
                      bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                      overflowWrap: 'anywhere',
                    }}
                  >
                    <Typography sx={{ fontSize: '1rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.text}</Typography>
                  </Box>
                </Box>
              ) : (
                <AssistantMessage
                  key={m.id}
                  m={m}
                  isLast={i === chat.messages.length - 1}
                  onSuggest={(q) => void chat.send(q)}
                  onExpand={setExpanded}
                  onSignIn={() => startSignIn()}
                />
              )
            )}
            {chat.needsSignIn && <SignInGateCard limit={chat.guestLimit} onSignIn={() => startSignIn(chat.needsSignIn)} />}
          </Box>
        )}
        <div ref={endRef} />
      </Box>

      <Composer busy={chat.busy} disabled={!!chat.needsSignIn} onSend={(t) => void chat.send(t)} onStop={chat.stop} note={guestNote} />

      {signIn.dialog}

      {/* The expanded card: a bottom sheet on a phone, a side panel on a laptop. */}
      <Drawer
        anchor={desktop ? 'right' : 'bottom'}
        open={!!expanded}
        onClose={() => setExpanded(null)}
        PaperProps={{
          sx: desktop
            ? { width: 480, p: 2.5 }
            : { maxHeight: '88dvh', borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 2, pb: 'max(16px, env(safe-area-inset-bottom))' },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <IconButton aria-label="Close" onClick={() => setExpanded(null)} sx={{ width: 44, height: 44 }}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        {expanded && <AskCardView card={expanded} expanded onSignIn={() => startSignIn()} />}
      </Drawer>

      <Drawer anchor={desktop ? 'right' : 'bottom'} open={historyOpen} onClose={() => setHistoryOpen(false)} PaperProps={{ sx: desktop ? { width: 360 } : { maxHeight: '75dvh', borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1.5 }}>
          <Typography component="h2" sx={{ fontWeight: 700 }}>
            Past chats
          </Typography>
          <IconButton aria-label="Close" onClick={() => setHistoryOpen(false)} sx={{ width: 44, height: 44 }}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        <List>
          {chat.threads.map((t) => (
            <ListItemButton
              key={t.id}
              selected={t.id === chat.threadId}
              onClick={() => {
                setHistoryOpen(false);
                void chat.openThread(t.id);
              }}
              sx={{ minHeight: 56 }}
            >
              <ListItemText
                primary={t.title || 'Chat'}
                secondary={t.last_message_at ? new Date(t.last_message_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null}
                primaryTypographyProps={{ noWrap: true }}
              />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
    </Box>
  );
}
