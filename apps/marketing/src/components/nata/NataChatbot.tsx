'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Paper,
  Fab,
  CircularProgress,
} from '@neram/ui';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import MinimizeIcon from '@mui/icons-material/Minimize';
import Image from 'next/image';

const ASSISTANT_IMG = '/images/nata-ai-assistant.jpg';

/** Avatar with image and SmartToy icon fallback */
function BotAvatar({ size = 40 }: { size?: number }) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: 'primary.main',
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
        position: 'relative',
      }}
    >
      <Image
        src={ASSISTANT_IMG}
        alt="NATA AI Assistant"
        width={size}
        height={size}
        style={{ objectFit: 'cover' }}
        onError={() => setImgError(true)}
      />
    </Box>
  );
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface NataChatbotProps {
  userId?: string | null;
}

const MAX_QUESTIONS_PER_SESSION = 20;
const LEAD_CAPTURE_AFTER = 3;

const SUGGESTED_QUESTIONS = [
  'What is NATA?',
  'Am I eligible for NATA?',
  'What are the fees?',
  'What is the exam pattern?',
];

function generateSessionId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Default bottom offset for the FAB */
const FAB_BOTTOM = 24;
/** Extra offset when achievement widget is visible (card height + gap) */
const FAB_BOTTOM_SHIFTED = 120;

export default function NataChatbot({ userId }: NataChatbotProps = {}) {
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

  // Listen for achievement widget visibility changes to shift FAB position
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
        { role: 'model', text: 'You\'ve reached the session limit of 20 questions. Please refresh the page to start a new session, or visit neramclasses.com for detailed information.' },
      ]);
      return;
    }

    // Check if lead capture should be shown
    if (questionCount >= LEAD_CAPTURE_AFTER && !leadCaptured && !showLeadCapture) {
      setShowLeadCapture(true);
    }

    const userMessage: ChatMessage = { role: 'user', text: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setQuestionCount((c) => c + 1);

    try {
      const res = await fetch('/api/nata/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: messages.slice(-10),
          sessionId,
          userId: userId || null,
          pageUrl: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to get response');
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'model', text: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: 'Sorry, I\'m having trouble connecting. Please try again in a moment.' },
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
      // Silently continue
      setShowLeadCapture(false);
    } finally {
      setLeadSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!open) {
    return (
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
        {/* FAB with online indicator */}
        <Box sx={{ position: 'relative', width: 56, height: 56 }}>
          <Fab
            onClick={() => setOpen(true)}
            sx={{
              width: 56,
              height: 56,
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              p: 0,
              overflow: 'hidden',
              bgcolor: '#f5f5f5',
              border: '2px solid',
              borderColor: 'rgba(0,0,0,0.08)',
              '&:hover': {
                bgcolor: '#ebebeb',
                boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
              },
            }}
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
    );
  }

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: { xs: 0, sm: 24 },
        right: { xs: 0, sm: 24 },
        width: { xs: '100%', sm: 380 },
        height: { xs: '100dvh', sm: 520 },
        maxHeight: { xs: '100dvh', sm: '80vh' },
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: { xs: 0, sm: 2 },
        overflow: 'hidden',
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
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BotAvatar size={32} />
          <Box>
            <Typography variant="subtitle2" fontWeight={600} sx={{ lineHeight: 1.2 }}>
              Sherine
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#44b700' }} />
              <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.65rem' }}>
                Online
              </Typography>
            </Box>
          </Box>
        </Box>
        <Box>
          <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'inherit' }}>
            <MinimizeIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton size="small" onClick={() => { setOpen(false); setMessages([]); setQuestionCount(0); }} sx={{ color: 'inherit' }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>

      {/* Messages */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 1.5,
          bgcolor: '#f8f9fa',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
              <BotAvatar size={56} />
            </Box>
            <Typography variant="body1" fontWeight={600} sx={{ mb: 0.25 }}>
              Sherine
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              NATA 2026 Exam Assistant
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Hi! I can answer your questions about NATA 2026 — eligibility, exam pattern, fees, dates, and more.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center', mt: 2 }}>
              {SUGGESTED_QUESTIONS.map((q) => (
                <Box
                  key={q}
                  onClick={() => sendMessage(q)}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'primary.main',
                    color: 'primary.main',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: '0.2s',
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
              maxWidth: '85%',
              display: 'flex',
              gap: 1,
              alignItems: 'flex-start',
            }}
          >
            {msg.role === 'model' && <BotAvatar size={24} />}
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: 2,
                bgcolor: msg.role === 'user' ? 'primary.main' : 'white',
                color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
                boxShadow: msg.role === 'model' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.text}
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
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              border: '1px solid',
              borderColor: 'primary.light',
            }}
          >
            <Typography variant="caption" fontWeight={600} color="primary.main" gutterBottom display="block">
              Want personalized guidance?
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Your name"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              sx={{ mb: 1 }}
              inputProps={{ style: { fontSize: '0.8rem' } }}
            />
            <TextField
              size="small"
              fullWidth
              placeholder="Phone number"
              value={leadPhone}
              onChange={(e) => setLeadPhone(e.target.value)}
              sx={{ mb: 1 }}
              inputProps={{ style: { fontSize: '0.8rem' }, inputMode: 'tel' }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Box
                component="button"
                onClick={handleLeadSubmit}
                disabled={leadSubmitting || !leadName.trim() || !leadPhone.trim()}
                sx={{
                  flex: 1,
                  py: 0.5,
                  px: 1.5,
                  border: 'none',
                  borderRadius: 1,
                  bgcolor: 'primary.main',
                  color: 'white',
                  fontSize: '0.75rem',
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
                  py: 0.5,
                  px: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: 'transparent',
                  fontSize: '0.75rem',
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

      {/* Remaining questions counter */}
      {questionCount > 0 && (
        <Box sx={{ px: 2, py: 0.25, bgcolor: '#f0f0f0', textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            {MAX_QUESTIONS_PER_SESSION - questionCount} questions remaining in this session
          </Typography>
        </Box>
      )}

      {/* Input */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <TextField
          inputRef={inputRef}
          size="small"
          fullWidth
          placeholder="Ask about NATA 2026..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || questionCount >= MAX_QUESTIONS_PER_SESSION}
          inputProps={{ maxLength: 500, style: { fontSize: '0.85rem' } }}
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
    </Paper>
  );
}
