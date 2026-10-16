'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { isHubRoute } from '@/components/college-hub/hub-routes';
import { useFirebaseAuth } from '@neram/auth';
import { openTawkChat } from '@/lib/tawk';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Fab,
  SwipeableDrawer,
  Slide,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import CloseFullscreenRoundedIcon from '@mui/icons-material/CloseFullscreenRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import VoiceInputButton from './aintra/VoiceInputButton';
import BotAvatar from './aintra/BotAvatar';
import AssistantMessage, { type ChatMessage } from './aintra/AssistantMessage';
import AintraCanvas, { type CanvasDoc } from './aintra/canvas/AintraCanvas';
import ResizeHandle from './aintra/panel/ResizeHandle';
import { COMPACT_WIDTH, useChatPanelWidth } from './aintra/panel/useChatPanelWidth';
import { useBackLayers } from './aintra/panel/useBackLayers';
import SuggestionChips from './aintra/rich/SuggestionChips';
import { readChatStream } from '@/lib/aintra/chat-stream';
import { leadAttribution } from '@/lib/attribution';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { trackWhatsAppClick } from '@/lib/whatsapp-track';

const MAX_QUESTIONS_PER_SESSION = 20;
const LEAD_CAPTURE_AFTER = 3;

const SUGGESTED_QUESTIONS = [
  'What are the course fees?',
  'How do I apply?',
  'What are class timings?',
  'Do you have offline classes?',
  'How to book a demo class?',
];

/** How wide the canvas opens beside the chat on a laptop. */
const CANVAS_WIDTH = 780;
/** The canvas never gets narrower than this beside the chat. */
const CANVAS_MIN = 400;

function generateSessionId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

let messageSeq = 0;
function newMessageId() {
  messageSeq += 1;
  return `m${Date.now().toString(36)}${messageSeq}`;
}

const FAB_BOTTOM = 24;
/** Location pages have a mobile sticky CTA bar (STICKY_CTA_HEIGHT 72px + safe area); sit above it. */
const OVER_STICKY_CTA_BOTTOM = 96;
const STICKY_CTA_PATH = /\/coaching\/(nata-coaching|jee-paper-2-coaching)/;
const DISMISSED_KEY = 'aintra_dismissed';

const headerButtonSx = { color: 'inherit', width: 44, height: 44 } as const;

export default function GeneralChatbot() {
  const pathname = usePathname();
  const { user: firebaseUser } = useFirebaseAuth();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  /** Wide enough to put the canvas beside the chat rather than over it. */
  const canvasBeside = useMediaQuery('(min-width:1024px)');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [achievementVisible, setAchievementVisible] = useState(false);
  const [canvasDoc, setCanvasDoc] = useState<CanvasDoc | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionId = useMemo(() => generateSessionId(), []);
  const panel = useChatPanelWidth();

  // ---------- Layout ----------
  const sideCanvas = canvasOpen && !!canvasDoc && canvasBeside && !isPhone;
  const maxPaper = Math.floor(panel.viewport * 0.96);
  // With the canvas open, the canvas is what is being read: the chat steps down
  // to its compact width beside it and gets its chosen width back on close.
  const sideChatWidth = Math.min(panel.width, COMPACT_WIDTH);
  const paperWidth = sideCanvas ? Math.min(sideChatWidth + CANVAS_WIDTH, maxPaper) : panel.width;
  const chatColumnWidth = sideCanvas ? Math.min(sideChatWidth, paperWidth - CANVAS_MIN) : paperWidth;
  const chatIsWide = !isPhone && chatColumnWidth >= 600;

  // ---------- Back button (phones and tablets) ----------
  const closeTopLayer = useCallback(() => {
    if (canvasOpen) setCanvasOpen(false);
    else setOpen(false);
  }, [canvasOpen]);
  const layerDepth = canvasBeside ? 0 : (open ? 1 : 0) + (open && canvasOpen ? 1 : 0);
  const forgetLayers = useBackLayers(layerDepth, closeTopLayer);

  // A link inside the chat (Apply now, a college page) moved the visitor on.
  // On a phone the chat covers the whole page they asked for, so get out of the way.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    forgetLayers();
    setCanvasOpen(false);
    if (isPhone) setOpen(false);
  }, [pathname, isPhone, forgetLayers]);

  // ---------- Scrolling: follow the answer only while the visitor is at the bottom ----------
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    followRef.current = atBottom;
    setShowJump(!atBottom);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, showLeadCapture]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    followRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [reduceMotion]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ visible: boolean }>).detail;
      setAchievementVisible(detail.visible);
    };
    window.addEventListener('achievement-widget-visibility', handler);
    return () => window.removeEventListener('achievement-widget-visibility', handler);
  }, []);

  useEffect(() => {
    // Not on phones: the keyboard would cover half the welcome screen.
    if (open && !isPhone && inputRef.current) inputRef.current.focus();
  }, [open, isPhone]);

  // Stop a running answer if the chat is closed or the page unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateMessage = useCallback((id: string, patch: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? patch(m) : m)));
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    if (questionCount >= MAX_QUESTIONS_PER_SESSION) {
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: 'model',
          text: 'You\'ve reached the session limit. Please refresh the page to start a new session, or call us at **+91 91761 37043**.',
        },
      ]);
      return;
    }

    if (questionCount >= LEAD_CAPTURE_AFTER && !leadCaptured && !showLeadCapture) {
      setShowLeadCapture(true);
    }

    // The conversation so far, without failed answers or the empty placeholder.
    const history = messages
      .filter((m) => m.text.trim() && !m.needsHuman && !m.streaming)
      .slice(-10)
      .map(({ role, text: t }) => ({ role, text: t }));

    const answerId = newMessageId();
    followRef.current = true;
    setMessages((prev) => [
      ...prev,
      { id: newMessageId(), role: 'user', text: text.trim() },
      { id: answerId, role: 'model', text: '', streaming: true },
    ]);
    setInput('');
    setLoading(true);
    setQuestionCount((c) => c + 1);

    const controller = new AbortController();
    abortRef.current = controller;

    // Deltas arrive faster than the screen redraws; paint at most once a frame.
    let streamed = '';
    let frame = 0;
    const paint = () => {
      frame = 0;
      const snapshot = streamed;
      updateMessage(answerId, (m) => ({ ...m, text: snapshot, status: snapshot ? undefined : m.status }));
    };
    const schedulePaint = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text.trim(),
          history,
          sessionId,
          userId: firebaseUser?.id || null,
          userName: firebaseUser?.name || firebaseUser?.phone || null,
          pageUrl: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.code === 'AI_UNAVAILABLE' ? 'AI_UNAVAILABLE' : errData.error || 'Failed to get response');
      }

      // Held in an object: TypeScript cannot see an assignment made inside the callback.
      const outcome: { failure: { error: string; code?: string } | null } = { failure: null };
      await readChatStream(res, (event) => {
        if (event.t === 'delta') {
          streamed += event.text;
          schedulePaint();
        } else if (event.t === 'reset') {
          streamed = '';
          schedulePaint();
        } else if (event.t === 'status') {
          updateMessage(answerId, (m) => ({ ...m, status: event.text }));
        } else if (event.t === 'error') {
          outcome.failure = event;
        }
      });
      if (frame) window.cancelAnimationFrame(frame);
      paint();

      if (outcome.failure) {
        const { error, code } = outcome.failure;
        throw new Error(code === 'AI_UNAVAILABLE' ? 'AI_UNAVAILABLE' : error);
      }
      if (!streamed.trim()) throw new Error('Empty response');
      updateMessage(answerId, (m) => ({ ...m, text: streamed, streaming: false, status: undefined }));
    } catch (err) {
      if (frame) window.cancelAnimationFrame(frame);
      if (controller.signal.aborted) {
        updateMessage(answerId, (m) => ({ ...m, text: streamed, streaming: false, status: undefined, stopped: true }));
        return;
      }
      const reason = err instanceof Error ? err.message : '';
      // AI_UNAVAILABLE is an outage, not a blip: retrying will not help, a person will.
      const errorMsg = reason === 'AI_UNAVAILABLE'
        ? 'Our assistant is offline for a bit. Our team replies fast on WhatsApp, or call us at **+91 91761 37043**.'
        : reason.includes('temporarily')
          ? 'Our AI is a bit busy right now. Please try again in a few seconds, or message our team on WhatsApp.'
          : 'Sorry, I\'m having trouble connecting. Please try again, or message our team on WhatsApp.';
      updateMessage(answerId, (m) => ({ ...m, text: errorMsg, streaming: false, status: undefined, needsHuman: true }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  // The latest sendMessage, for callbacks handed to memoised children.
  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;
  const sendSuggestion = useCallback((q: string) => void sendRef.current(q), []);

  const stopAnswer = () => abortRef.current?.abort();

  const handleLeadSubmit = async () => {
    if (!leadName.trim() || !leadPhone.trim()) return;
    setLeadSubmitting(true);
    try {
      await fetch('/api/nata/assistance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: leadName.trim(),
          phone: leadPhone.trim(),
          category: 'chatbot_lead',
          ...leadAttribution(),
        }),
      });
      setLeadCaptured(true);
      setShowLeadCapture(false);
      setMessages((prev) => [
        ...prev,
        { id: newMessageId(), role: 'model', text: `Thanks ${leadName}! Our team will reach out to you. Feel free to continue asking questions.` },
      ]);
    } catch {
      setShowLeadCapture(false);
    } finally {
      setLeadSubmitting(false);
    }
  };

  const [humanMenuAnchor, setHumanMenuAnchor] = useState<null | HTMLElement>(null);

  const handleOpenHumanMenu = (e: React.MouseEvent<HTMLElement>) => {
    setHumanMenuAnchor(e.currentTarget);
  };

  const handleCloseHumanMenu = () => {
    setHumanMenuAnchor(null);
  };

  const handleWhatsApp = useCallback(() => {
    setHumanMenuAnchor(null);
    const { href, pageCode } = buildWhatsAppLink({ text: 'Hello! I need help from Neram Classes.' });
    trackWhatsAppClick(pageCode, { placement: 'chatbot' });
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  // Tawk.to is not loaded until this tap (it is ~300 KB plus an iframe), so
  // the first tap shows "Connecting" while the embed downloads.
  const [liveChatLoading, setLiveChatLoading] = useState(false);
  const handleTawkTo = async () => {
    handleCloseHumanMenu();
    if (liveChatLoading) return;
    setLiveChatLoading(true);
    const opened = await openTawkChat({ hideOnMinimize: true });
    setLiveChatLoading(false);
    if (opened) {
      setOpen(false);
    } else {
      // Fallback: the contact page (after an await a new tab would be popup-blocked).
      window.location.assign('/contact');
    }
  };

  const openCanvas = useCallback((doc: CanvasDoc) => {
    setCanvasDoc(doc);
    setCanvasOpen(true);
  }, []);

  const closeCanvas = useCallback(() => setCanvasOpen(false), []);

  const closeChat = () => {
    setCanvasOpen(false);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Escape closes the canvas first, then (through the drawer) the chat.
  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && canvasOpen) {
      e.stopPropagation();
      setCanvasOpen(false);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Ignore storage errors (private mode, etc.)
    }
    setDismissed(true);
  };

  // On /contact page, show nothing: ContactPageContent has its own live chat launcher there
  if (pathname?.includes('/contact') || pathname?.includes('/enroll')) return null;

  const latestAnswerId = [...messages].reverse().find((m) => m.role === 'model')?.id;
  const atLimit = questionCount >= MAX_QUESTIONS_PER_SESSION;

  return (
    <>
      {/* Tawk.to loads on the first Live Chat tap (lib/tawk.ts), never on mount. */}
      {/* FAB button */}
      {!open && !dismissed && (
        <Box
          sx={{
            position: 'fixed',
            bottom: STICKY_CTA_PATH.test(pathname ?? '')
              ? { xs: OVER_STICKY_CTA_BOTTOM, md: FAB_BOTTOM }
              : isHubRoute(pathname ?? '')
                ? // Clears the College Hub bottom nav (64px) and the compare tray above it.
                  { xs: 'calc(148px + env(safe-area-inset-bottom))', md: FAB_BOTTOM }
              : achievementVisible
                ? { xs: 60, md: FAB_BOTTOM }
                : FAB_BOTTOM,
            right: 24,
            zIndex: 1300,
            transition: { xs: 'bottom 0.4s cubic-bezier(0.4, 0, 0.2, 1)', md: 'none' },
          }}
        >
          <Box sx={{ position: 'relative', width: 56, height: 56 }}>
            <Fab
              onClick={() => setOpen(true)}
              data-testid="aintra-opener"
              sx={{
                width: 56,
                height: 56,
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                p: 0,
                overflow: 'hidden',
                bgcolor: 'transparent',
                '&:hover': {
                  boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
                },
              }}
              title="Chat with Aintra"
            >
              <BotAvatar size={56} />
            </Fab>
            {/* Dismiss (×) button */}
            <IconButton
              onClick={handleDismiss}
              aria-label="Dismiss chat assistant"
              size="small"
              sx={{
                position: 'absolute',
                top: -6,
                left: -6,
                width: 24,
                height: 24,
                bgcolor: 'white',
                color: 'grey.700',
                border: '1px solid',
                borderColor: 'grey.300',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                zIndex: 1201,
                p: 0,
                '&:hover': { bgcolor: 'grey.100' },
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
            {/* Online dot */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: '#44b700',
                border: '2.5px solid white',
                boxShadow: '0 0 0 0 rgba(68,183,0,0.4)',
                zIndex: 1200,
                '@keyframes onlinePulse': {
                  '0%': { boxShadow: '0 0 0 0 rgba(68,183,0,0.45)' },
                  '70%': { boxShadow: '0 0 0 7px rgba(68,183,0,0)' },
                  '100%': { boxShadow: '0 0 0 0 rgba(68,183,0,0)' },
                },
                animation: 'onlinePulse 2s ease-out infinite',
              }}
            />
          </Box>
        </Box>
      )}

      {/* Drawer */}
      <SwipeableDrawer
        anchor="right"
        open={open}
        onClose={closeChat}
        onOpen={() => setOpen(true)}
        disableSwipeToOpen
        // Above the site's fixed announcement bar (z-index 1400), which otherwise
        // covers the chat header.
        sx={{ zIndex: 1450 }}
        PaperProps={{
          ...({ 'data-testid': 'aintra-panel' } as object),
          sx: {
            width: { xs: '100%', sm: 'auto' },
            maxWidth: '100vw',
            height: { xs: '100dvh', sm: '100%' },
            overflow: 'hidden',
          },
        }}
      >
        <Box
          onKeyDown={handlePanelKeyDown}
          data-testid="aintra-panel-body"
          sx={{
            position: 'relative',
            display: 'flex',
            height: '100%',
            width: { xs: '100vw', sm: paperWidth },
            maxWidth: '100vw',
            transition: dragging || reduceMotion ? 'none' : 'width 220ms cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          {!isPhone && !sideCanvas && (
            <ResizeHandle
              width={panel.width}
              onResize={(w, opts) => panel.setWidth(w, opts)}
              onToggle={panel.toggle}
              onDragChange={setDragging}
            />
          )}

          {/* Canvas beside the chat (laptops) */}
          {sideCanvas && canvasDoc && (
            <Box sx={{ flex: 1, minWidth: 0, borderRight: '1px solid', borderColor: 'divider' }}>
              <AintraCanvas doc={canvasDoc} mode="side" onClose={closeCanvas} />
            </Box>
          )}

          {/* Chat column */}
          <Box
            sx={{
              position: 'relative',
              width: sideCanvas ? chatColumnWidth : '100%',
              flexShrink: 0,
              minWidth: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              // clip, not hidden: a hidden box can still be scrolled by focus
              // or scrollIntoView, which pushed the header off the top.
              overflow: 'hidden',
              '@supports (overflow: clip)': { overflow: 'clip' },
              bgcolor: 'background.paper',
            }}
          >
            {/* Header */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                pl: 2,
                pr: 1,
                py: 1,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                flexShrink: 0,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <BotAvatar size={36} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h2" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                    Aintra
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#44b700' }} />
                    <Typography variant="caption" noWrap sx={{ opacity: 0.9, fontSize: '0.75rem' }}>
                      Neram Classes Assistant
                    </Typography>
                  </Box>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {!isPhone && (
                  <Tooltip title={panel.isWide ? 'Make chat narrower' : 'Make chat wider'}>
                    <IconButton
                      onClick={panel.toggle}
                      sx={headerButtonSx}
                      aria-label={panel.isWide ? 'Make chat narrower' : 'Make chat wider'}
                      data-testid="aintra-width-toggle"
                    >
                      {panel.isWide ? <CloseFullscreenRoundedIcon sx={{ fontSize: 20 }} /> : <OpenInFullRoundedIcon sx={{ fontSize: 20 }} />}
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Talk to a human">
                  <IconButton onClick={handleOpenHumanMenu} sx={headerButtonSx} aria-label="Talk to a human">
                    <HeadsetMicIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={humanMenuAnchor}
                  open={Boolean(humanMenuAnchor)}
                  onClose={handleCloseHumanMenu}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  sx={{ zIndex: 1460 }}
                  PaperProps={{
                    sx: { borderRadius: 2, minWidth: 220, mt: 0.5 },
                  }}
                >
                  <MenuItem onClick={handleWhatsApp} sx={{ py: 1.25 }}>
                    <ListItemIcon>
                      <WhatsAppIcon sx={{ color: '#25D366' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Chat on WhatsApp"
                      secondary="Quick response"
                      primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
                      secondaryTypographyProps={{ fontSize: '0.75rem' }}
                    />
                  </MenuItem>
                  <MenuItem onClick={handleTawkTo} sx={{ py: 1.25 }}>
                    <ListItemIcon>
                      <SupportAgentIcon sx={{ color: '#1976d2' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Live Chat (Tawk.to)"
                      secondary="Talk to our team"
                      primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
                      secondaryTypographyProps={{ fontSize: '0.75rem' }}
                    />
                  </MenuItem>
                </Menu>
                <Tooltip title="Close chat">
                  <IconButton onClick={closeChat} sx={headerButtonSx} aria-label="Close chat">
                    <CloseIcon sx={{ fontSize: 22 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Messages */}
            <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
              <Box
                ref={scrollRef}
                onScroll={onScroll}
                data-testid="aintra-messages"
                sx={{
                  flex: 1,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  bgcolor: '#f8f9fa',
                  px: { xs: 2, sm: 2.5 },
                  py: 2.5,
                }}
              >
                <Box
                  sx={{
                    maxWidth: chatIsWide ? 760 : 'none',
                    mx: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2.5,
                  }}
                >
                  {messages.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
                        <BotAvatar size={64} />
                      </Box>
                      <Typography variant="h6" component="p" fontWeight={600} sx={{ mb: 0.25 }}>
                        Aintra
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                        Neram Classes Assistant
                      </Typography>
                      <Typography color="text.secondary" sx={{ mb: 3, px: 2, fontSize: '1rem', lineHeight: 1.6 }}>
                        Hi! I can help you with course details, fees, class timings, NATA exam info, and more. What would you like to know?
                      </Typography>
                      <SuggestionChips
                        suggestions={SUGGESTED_QUESTIONS}
                        onPick={sendSuggestion}
                        center
                        label="Suggested questions"
                      />
                    </Box>
                  )}

                  {messages.map((msg) =>
                    msg.role === 'model' ? (
                      <AssistantMessage
                        key={msg.id}
                        msg={msg}
                        isLatest={msg.id === latestAnswerId}
                        busy={loading}
                        onOpenCanvas={openCanvas}
                        onSuggest={sendSuggestion}
                        onWhatsApp={handleWhatsApp}
                      />
                    ) : (
                      <Box
                        key={msg.id}
                        data-role="user"
                        data-testid="aintra-user-message"
                        sx={{
                          alignSelf: 'flex-end',
                          maxWidth: '85%',
                          px: 2,
                          py: 1.25,
                          borderRadius: '18px 18px 4px 18px',
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          fontSize: '1rem',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {msg.text}
                      </Box>
                    ),
                  )}

                  {/* Lead capture card */}
                  {showLeadCapture && !leadCaptured && (
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                        border: '1px solid',
                        borderColor: 'primary.light',
                      }}
                    >
                      <Typography variant="body2" fontWeight={600} color="primary.main" gutterBottom>
                        Want personalized guidance?
                      </Typography>
                      <TextField
                        fullWidth
                        placeholder="Your name"
                        value={leadName}
                        onChange={(e) => setLeadName(e.target.value)}
                        sx={{ mb: 1 }}
                        inputProps={{ style: { fontSize: '1rem' }, 'aria-label': 'Your name', autoComplete: 'name' }}
                      />
                      <TextField
                        fullWidth
                        placeholder="Phone number"
                        value={leadPhone}
                        onChange={(e) => setLeadPhone(e.target.value)}
                        sx={{ mb: 1 }}
                        inputProps={{ style: { fontSize: '1rem' }, inputMode: 'tel', 'aria-label': 'Phone number', autoComplete: 'tel' }}
                      />
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Box
                          component="button"
                          onClick={handleLeadSubmit}
                          disabled={leadSubmitting || !leadName.trim() || !leadPhone.trim()}
                          sx={{
                            flex: 1,
                            minHeight: 44,
                            px: 1.5,
                            border: 'none',
                            borderRadius: 1,
                            bgcolor: 'primary.main',
                            color: 'white',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
                            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                          }}
                        >
                          {leadSubmitting ? 'Sending...' : 'Get Help'}
                        </Box>
                        <Box
                          component="button"
                          onClick={() => setShowLeadCapture(false)}
                          sx={{
                            minHeight: 44,
                            px: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                            bgcolor: 'transparent',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                          }}
                        >
                          Skip
                        </Box>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>

              {showJump && messages.length > 0 && (
                <Box
                  component="button"
                  type="button"
                  onClick={jumpToLatest}
                  aria-label="Jump to latest message"
                  sx={{
                    position: 'absolute',
                    bottom: 12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    minHeight: 40,
                    pl: 1.5,
                    pr: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 999,
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                    font: 'inherit',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                >
                  <KeyboardArrowDownRoundedIcon sx={{ fontSize: 20 }} />
                  Latest
                </Box>
              )}
            </Box>

            {/* Talk to human banner */}
            <Box
              sx={{
                px: 2,
                bgcolor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                flexShrink: 0,
                flexWrap: 'nowrap',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', lineHeight: 1, whiteSpace: 'nowrap' }}>
                Need human help?
              </Typography>
              <Box
                component="button"
                type="button"
                onClick={handleWhatsApp}
                sx={{
                  border: 0,
                  bgcolor: 'transparent',
                  font: 'inherit',
                  '&:focus-visible': { outline: '2px solid #1976d2', outlineOffset: 2 },
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  px: 1,
                  borderRadius: 1,
                  minHeight: 44,
                  '&:hover': { bgcolor: '#e0e0e0' },
                }}
              >
                <WhatsAppIcon sx={{ fontSize: 16, color: '#0F7A3D', display: 'block' }} />
                <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#0F7A3D', lineHeight: 1 }}>
                  WhatsApp
                </Typography>
              </Box>
              <Box
                component="button"
                type="button"
                onClick={handleTawkTo}
                aria-busy={liveChatLoading}
                sx={{
                  border: 0,
                  bgcolor: 'transparent',
                  font: 'inherit',
                  '&:focus-visible': { outline: '2px solid #1976d2', outlineOffset: 2 },
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  px: 1,
                  borderRadius: 1,
                  minHeight: 44,
                  '&:hover': { bgcolor: '#e0e0e0' },
                }}
              >
                <SupportAgentIcon sx={{ fontSize: 16, color: '#1565c0', display: 'block' }} />
                <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1565c0', lineHeight: 1 }}>
                  {liveChatLoading ? 'Connecting' : 'Live Chat'}
                </Typography>
              </Box>
            </Box>

            {/* Remaining questions counter */}
            {questionCount > 0 && (
              <Box sx={{ px: 2, py: 0.5, bgcolor: '#fafafa', textAlign: 'center', flexShrink: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  {MAX_QUESTIONS_PER_SESSION - questionCount} questions remaining
                </Typography>
              </Box>
            )}

            {/* Input */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 1,
                px: 2,
                pt: 1.25,
                pb: 'calc(10px + env(safe-area-inset-bottom))',
                borderTop: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
              }}
            >
              <TextField
                inputRef={inputRef}
                size="small"
                fullWidth
                multiline
                maxRows={4}
                placeholder="Ask about courses, fees, timing..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={atLimit}
                inputProps={{
                  maxLength: 500,
                  style: { fontSize: '1rem' },
                  'data-testid': 'aintra-input',
                  'aria-label': 'Message Aintra',
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, minHeight: 44 } }}
              />
              <VoiceInputButton
                value={input}
                onChange={setInput}
                disabled={loading || atLimit}
                color="#1976d2"
                size={44}
              />
              {loading ? (
                <Tooltip title="Stop answer">
                  <IconButton
                    onClick={stopAnswer}
                    aria-label="Stop answer"
                    data-testid="aintra-stop"
                    sx={{
                      width: 44,
                      height: 44,
                      flexShrink: 0,
                      bgcolor: 'text.primary',
                      color: 'background.paper',
                      '&:hover': { bgcolor: 'text.secondary' },
                    }}
                  >
                    <StopRoundedIcon />
                  </IconButton>
                </Tooltip>
              ) : (
                <IconButton
                  color="primary"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || atLimit}
                  aria-label="Send message"
                  data-testid="aintra-send"
                  sx={{ width: 44, height: 44, flexShrink: 0 }}
                >
                  <SendIcon sx={{ fontSize: 20 }} />
                </IconButton>
              )}
            </Box>

            {/* Canvas over the chat (phones and tablets) */}
            {!canvasBeside || isPhone ? (
              <Slide
                direction="up"
                in={canvasOpen && !!canvasDoc}
                mountOnEnter
                unmountOnExit
                timeout={reduceMotion ? 0 : 240}
              >
                <Box sx={{ position: 'absolute', inset: 0, zIndex: 6 }}>
                  {canvasDoc && <AintraCanvas doc={canvasDoc} mode="overlay" onClose={closeCanvas} />}
                </Box>
              </Slide>
            ) : null}
          </Box>
        </Box>
      </SwipeableDrawer>
    </>
  );
}
