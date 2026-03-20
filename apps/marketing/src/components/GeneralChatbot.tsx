'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useFirebaseAuth } from '@neram/auth';
import TawkToChat from './TawkToChat';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Fab,
  CircularProgress,
  SwipeableDrawer,
} from '@neram/ui';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import Image from 'next/image';

const ASSISTANT_IMG = '/images/nata-ai-assistant2.jpg';

function BotAvatar({ size = 40 }: { size?: number }) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: '#1a237e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <SmartToyIcon sx={{ fontSize: size * 0.55, color: 'white' }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <Image
        src={ASSISTANT_IMG}
        alt="Aintra"
        width={size}
        height={size}
        onError={() => setImgError(true)}
        style={{ objectFit: 'cover', width: size, height: size }}
      />
    </Box>
  );
}

/** Lightweight markdown renderer — handles **bold**, *italic*, lists, and paragraphs.
 *  Avoids react-markdown (ESM-only) which causes chunk 404s in production. */
function BotMessageContent({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/);

  return (
    <Box>
      {paragraphs.map((para, pi) => {
        const trimmed = para.trim();
        if (!trimmed) return null;

        // Unordered list
        const ulMatch = trimmed.split('\n').every((l) => /^[-*]\s/.test(l.trim()));
        if (ulMatch) {
          return (
            <Box key={pi} component="ul" sx={{ pl: 2.5, my: 0.5, '& li': { fontSize: '0.9375rem', lineHeight: 1.65, mb: 0.25 } }}>
              {trimmed.split('\n').map((li, i) => (
                <li key={i}><InlineMarkdown text={li.replace(/^[-*]\s/, '')} /></li>
              ))}
            </Box>
          );
        }

        // Ordered list
        const olMatch = trimmed.split('\n').every((l) => /^\d+[.)]\s/.test(l.trim()));
        if (olMatch) {
          return (
            <Box key={pi} component="ol" sx={{ pl: 2.5, my: 0.5, '& li': { fontSize: '0.9375rem', lineHeight: 1.65, mb: 0.25 } }}>
              {trimmed.split('\n').map((li, i) => (
                <li key={i}><InlineMarkdown text={li.replace(/^\d+[.)]\s/, '')} /></li>
              ))}
            </Box>
          );
        }

        // Paragraph (may contain single-line list items mixed with text)
        return (
          <Typography key={pi} component="p" sx={{ fontSize: '0.9375rem', lineHeight: 1.65, mb: 1, '&:last-child': { mb: 0 } }}>
            <InlineMarkdown text={trimmed} />
          </Typography>
        );
      })}
    </Box>
  );
}

/** Detects URLs and email addresses in text and renders them as clickable links */
function Linkify({ text }: { text: string }) {
  const linkRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|https?:\/\/[^\s,)]+|www\.[^\s,)]+|\b[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:com|in|org|net|edu)(?:\/[^\s,)]*)?)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let m;
  while ((m = linkRegex.exec(text)) !== null) {
    if (m.index > lastIdx) nodes.push(text.slice(lastIdx, m.index));
    const match = m[0];
    const isEmail = match.includes('@') && !match.startsWith('http');
    const href = isEmail ? `mailto:${match}` : match.startsWith('http') ? match : `https://${match}`;
    nodes.push(
      <a key={m.index} href={href} target={isEmail ? undefined : '_blank'} rel={isEmail ? undefined : 'noopener noreferrer'}
         style={{ color: '#1976d2', textDecoration: 'underline', wordBreak: 'break-all' }}>
        {match}
      </a>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return <>{nodes}</>;
}

/** Renders **bold**, *italic*, [markdown links](url), and auto-linked URLs */
function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i}><Linkify text={part.slice(2, -2)} /></strong>;
        if (part.startsWith('*') && part.endsWith('*'))
          return <em key={i}><Linkify text={part.slice(1, -1)} /></em>;
        const mdLink = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (mdLink) {
          return (
            <a key={i} href={mdLink[2]} target="_blank" rel="noopener noreferrer"
               style={{ color: '#1976d2', textDecoration: 'underline' }}>
              {mdLink[1]}
            </a>
          );
        }
        return <Linkify key={i} text={part} />;
      })}
    </>
  );
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const MAX_QUESTIONS_PER_SESSION = 20;
const LEAD_CAPTURE_AFTER = 3;

const SUGGESTED_QUESTIONS = [
  'What are the course fees?',
  'How do I apply?',
  'What are class timings?',
  'Do you have offline classes?',
  'How to book a demo class?',
];

function generateSessionId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const FAB_BOTTOM = 24;

export default function GeneralChatbot() {
  const pathname = usePathname();
  const { user: firebaseUser } = useFirebaseAuth();

  const [open, setOpen] = useState(false);
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionId = useMemo(() => generateSessionId(), []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ visible: boolean }>).detail;
      setAchievementVisible(detail.visible);
    };
    window.addEventListener('achievement-widget-visibility', handler);
    return () => window.removeEventListener('achievement-widget-visibility', handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    if (questionCount >= MAX_QUESTIONS_PER_SESSION) {
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: 'You\'ve reached the session limit. Please refresh the page to start a new session, or call us at **+91 91761 37043**.' },
      ]);
      return;
    }

    if (questionCount >= LEAD_CAPTURE_AFTER && !leadCaptured && !showLeadCapture) {
      setShowLeadCapture(true);
    }

    const userMessage: ChatMessage = { role: 'user', text: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setQuestionCount((c) => c + 1);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: messages.slice(-10),
          sessionId,
          userId: firebaseUser?.uid || null,
          userName: firebaseUser?.displayName || firebaseUser?.phoneNumber || null,
          pageUrl: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to get response');
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'model', text: data.reply }]);
    } catch (err) {
      const errorMsg = err instanceof Error && err.message.includes('temporarily')
        ? 'Our AI is a bit busy right now. Please try again in a few seconds, or contact us at **+91 91761 37043**.'
        : 'Sorry, I\'m having trouble connecting. Please try again or call us at **+91 91761 37043**.';
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: errorMsg },
      ]);
    } finally {
      setLoading(false);
    }
  };

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
        }),
      });
      setLeadCaptured(true);
      setShowLeadCapture(false);
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: `Thanks ${leadName}! Our team will reach out to you. Feel free to continue asking questions.` },
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

  const handleWhatsApp = () => {
    handleCloseHumanMenu();
    window.open(
      'https://wa.me/919176137043?text=Hello!%20I%20need%20help%20from%20Neram%20Classes.',
      '_blank'
    );
  };

  const handleTawkTo = () => {
    handleCloseHumanMenu();
    if (typeof window !== 'undefined' && (window as any).Tawk_API) {
      (window as any).Tawk_API.maximize();
      setOpen(false);
    } else {
      // Fallback: go to contact page
      window.open('/en/contact', '_blank');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // On /contact page, show nothing — TawkToChat is loaded by ContactPageContent there
  if (pathname?.includes('/contact')) return null;

  return (
    <>
      {/* Initialize Tawk.to hidden — bubble only shows when user clicks Live Chat */}
      <TawkToChat hideByDefault />
      {/* FAB button */}
      {!open && (
        <Box
          sx={{
            position: 'fixed',
            bottom: achievementVisible
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
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        disableSwipeToOpen
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 440 },
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BotAvatar size={36} />
            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                Aintra
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#44b700' }} />
                <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem' }}>
                  Neram Classes Assistant
                </Typography>
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={handleOpenHumanMenu}
              sx={{ color: 'inherit' }}
              title="Talk to a human"
            >
              <HeadsetMicIcon sx={{ fontSize: 20 }} />
            </IconButton>
            <Menu
              anchorEl={humanMenuAnchor}
              open={Boolean(humanMenuAnchor)}
              onClose={handleCloseHumanMenu}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
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
                  secondaryTypographyProps={{ fontSize: '0.7rem' }}
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
                  secondaryTypographyProps={{ fontSize: '0.7rem' }}
                />
              </MenuItem>
            </Menu>
            <IconButton
              size="small"
              onClick={() => setOpen(false)}
              sx={{ color: 'inherit' }}
            >
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        </Box>

        {/* Messages */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: { xs: 2, sm: 2.5 },
            py: 2,
            bgcolor: '#f8f9fa',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          {messages.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
                <BotAvatar size={64} />
              </Box>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 0.25 }}>
                Aintra
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Neram Classes Assistant
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3, px: 2 }}>
                Hi! I can help you with course details, fees, class timings, NATA exam info, and more. What would you like to know?
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'center' }}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <Box
                    key={q}
                    onClick={() => sendMessage(q)}
                    sx={{
                      px: 2,
                      py: 0.75,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'primary.main',
                      color: 'primary.main',
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      transition: '0.2s',
                      minHeight: 36,
                      display: 'flex',
                      alignItems: 'center',
                      '&:hover': { bgcolor: 'primary.main', color: 'white' },
                    }}
                  >
                    {q}
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {messages.map((msg, i) => (
            <Box
              key={i}
              sx={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
                display: 'flex',
                gap: 1,
                alignItems: 'flex-start',
              }}
            >
              {msg.role === 'model' && <BotAvatar size={28} />}
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: msg.role === 'user' ? 'primary.main' : 'white',
                  color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
                  boxShadow: msg.role === 'model' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  ...(msg.role === 'user' && {
                    fontSize: '0.9375rem',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }),
                }}
              >
                {msg.role === 'model' ? (
                  <BotMessageContent text={msg.text} />
                ) : (
                  msg.text
                )}
              </Box>
            </Box>
          ))}

          {loading && (
            <Box sx={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">Thinking...</Typography>
            </Box>
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
                size="small"
                fullWidth
                placeholder="Your name"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                sx={{ mb: 1 }}
                inputProps={{ style: { fontSize: '0.875rem' } }}
              />
              <TextField
                size="small"
                fullWidth
                placeholder="Phone number"
                value={leadPhone}
                onChange={(e) => setLeadPhone(e.target.value)}
                sx={{ mb: 1 }}
                inputProps={{ style: { fontSize: '0.875rem' }, inputMode: 'tel' }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Box
                  component="button"
                  onClick={handleLeadSubmit}
                  disabled={leadSubmitting || !leadName.trim() || !leadPhone.trim()}
                  sx={{
                    flex: 1,
                    py: 0.75,
                    px: 1.5,
                    border: 'none',
                    borderRadius: 1,
                    bgcolor: 'primary.main',
                    color: 'white',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
                  }}
                >
                  {leadSubmitting ? 'Sending...' : 'Get Help'}
                </Box>
                <Box
                  component="button"
                  onClick={() => setShowLeadCapture(false)}
                  sx={{
                    py: 0.75,
                    px: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'transparent',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                  }}
                >
                  Skip
                </Box>
              </Box>
            </Box>
          )}

          <div ref={messagesEndRef} />
        </Box>

        {/* Talk to human banner */}
        <Box
          sx={{
            px: 2,
            py: 0.75,
            bgcolor: '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            flexShrink: 0,
            flexWrap: 'nowrap',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', lineHeight: 1, whiteSpace: 'nowrap' }}>
            Need human help?
          </Typography>
          <Box
            onClick={handleWhatsApp}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              minHeight: 28,
              '&:hover': { bgcolor: '#e0e0e0' },
            }}
          >
            <WhatsAppIcon sx={{ fontSize: 15, color: '#25D366', display: 'block' }} />
            <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#25D366', lineHeight: 1 }}>
              WhatsApp
            </Typography>
          </Box>
          <Box
            onClick={handleTawkTo}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              minHeight: 28,
              '&:hover': { bgcolor: '#e0e0e0' },
            }}
          >
            <SupportAgentIcon sx={{ fontSize: 15, color: '#1976d2', display: 'block' }} />
            <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#1976d2', lineHeight: 1 }}>
              Live Chat
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
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
            disabled={loading || questionCount >= MAX_QUESTIONS_PER_SESSION}
            inputProps={{ maxLength: 500, style: { fontSize: '0.9375rem' } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <IconButton
            color="primary"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            size="small"
          >
            <SendIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </SwipeableDrawer>
    </>
  );
}

