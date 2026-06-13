'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  IconButton,
  Chip,
  CircularProgress,
  Fab,
  Collapse,
  Divider,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import ChatIcon from '@mui/icons-material/Chat';
import HumanHelpBar from '@/components/aintra/HumanHelpBar';
import VoiceInputButton from '@/components/aintra/VoiceInputButton';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface AintraTopicChatProps {
  topic: string;
  endpoint: string;
  title: string;
  subtitle: string;
  greeting: string;
  suggestions: string[];
  inputPlaceholder?: string;
  primaryColor?: string;
  primaryColorDark?: string;
  bubbleBgUser?: string;
  bubbleBgAssistant?: string;
  iconBgAssistant?: string;
  storageKey?: string;
  disclaimerSource?: string;
}

const DEFAULT_PRIMARY = '#1d4ed8';
const DEFAULT_PRIMARY_DARK = '#1e40af';

export default function AintraTopicChat({
  topic,
  endpoint,
  title,
  subtitle,
  greeting,
  suggestions,
  inputPlaceholder = 'Ask anything...',
  primaryColor = DEFAULT_PRIMARY,
  primaryColorDark = DEFAULT_PRIMARY_DARK,
  bubbleBgUser,
  bubbleBgAssistant = '#f8fafc',
  iconBgAssistant,
  storageKey,
  disclaimerSource = 'tneaonline.org',
}: AintraTopicChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: greeting },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const userBubbleBg = bubbleBgUser || primaryColor;
  const iconAssistantBg = iconBgAssistant || `${primaryColor}1a`;

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, loading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg].slice(-11);
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const historyForApi = updatedMessages.slice(1).slice(-6);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          message: trimmed,
          history: historyForApi.slice(0, -1),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              (data.error ||
                'Sorry, I could not process your request right now.') +
              ' You can also reach our team directly on WhatsApp or Live Chat below.',
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Connection error. Please check your internet and try again, or reach our team on WhatsApp or Live Chat below.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      <Fab
        aria-label={`Ask Aintra about ${title}`}
        onClick={() => setOpen((v) => !v)}
        sx={{
          position: 'fixed',
          bottom: { xs: 88, md: 32 },
          right: { xs: 16, md: 32 },
          zIndex: 1300,
          bgcolor: primaryColor,
          color: 'white',
          '&:hover': { bgcolor: primaryColorDark },
          boxShadow: `0 4px 20px ${primaryColor}66`,
          width: 56,
          height: 56,
        }}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </Fab>

      <Box
        sx={{
          position: 'fixed',
          bottom: { xs: 0, md: 100 },
          right: { xs: 0, md: 32 },
          left: { xs: 0, md: 'auto' },
          width: { xs: '100%', md: 380 },
          zIndex: 1299,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <Collapse in={open} timeout={200}>
          <Paper
            elevation={8}
            sx={{
              borderRadius: { xs: '16px 16px 0 0', md: 3 },
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              height: { xs: '70vh', md: 480 },
              maxHeight: { xs: '70vh', md: 480 },
              bgcolor: 'background.paper',
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 1.5,
                background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`,
                color: 'white',
                flexShrink: 0,
              }}
            >
              <Stack direction="row" alignItems="center" gap={1}>
                <SmartToyIcon sx={{ fontSize: 20 }} />
                <Box flex={1}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    Aintra AI
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.85 }}>
                    {subtitle}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => setOpen(false)}
                  sx={{ color: 'white', p: 0.5 }}
                  aria-label="Close chat"
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Box>

            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                px: 1.5,
                py: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              {messages.map((msg, i) => (
                <Stack
                  key={i}
                  direction="row"
                  gap={0.75}
                  alignItems="flex-end"
                  justifyContent={msg.role === 'user' ? 'flex-end' : 'flex-start'}
                >
                  {msg.role === 'assistant' && (
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: iconAssistantBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        mb: 0.25,
                      }}
                    >
                      <SmartToyIcon sx={{ fontSize: 14, color: primaryColor }} />
                    </Box>
                  )}
                  <Box
                    sx={{
                      maxWidth: '78%',
                      px: 1.5,
                      py: 1,
                      borderRadius:
                        msg.role === 'user'
                          ? '12px 12px 4px 12px'
                          : '12px 12px 12px 4px',
                      bgcolor: msg.role === 'user' ? userBubbleBg : bubbleBgAssistant,
                      color: msg.role === 'user' ? 'white' : 'text.primary',
                      border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ lineHeight: 1.5, fontSize: '0.8125rem', whiteSpace: 'pre-wrap' }}
                    >
                      {msg.content}
                    </Typography>
                  </Box>
                  {msg.role === 'user' && (
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: '#dbeafe',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        mb: 0.25,
                      }}
                    >
                      <PersonIcon sx={{ fontSize: 14, color: primaryColor }} />
                    </Box>
                  )}
                </Stack>
              ))}

              {loading && (
                <Stack direction="row" gap={0.75} alignItems="flex-end">
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      bgcolor: iconAssistantBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <SmartToyIcon sx={{ fontSize: 14, color: primaryColor }} />
                  </Box>
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderRadius: '12px 12px 12px 4px',
                      bgcolor: bubbleBgAssistant,
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <CircularProgress size={10} sx={{ color: primaryColor }} />
                    <Typography variant="caption" color="text.secondary">
                      Aintra is thinking...
                    </Typography>
                  </Box>
                </Stack>
              )}
              <div ref={bottomRef} />
            </Box>

            <Box sx={{ px: 1.5, pt: 1, flexShrink: 0 }}>
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                {suggestions.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    size="small"
                    onClick={() => sendMessage(s)}
                    disabled={loading}
                    sx={{
                      fontSize: '0.6875rem',
                      height: 26,
                      cursor: 'pointer',
                      bgcolor: iconAssistantBg,
                      color: primaryColorDark,
                      border: `1px solid ${primaryColor}33`,
                      '&:hover': { bgcolor: `${primaryColor}26` },
                    }}
                  />
                ))}
              </Stack>
            </Box>

            <Divider sx={{ mt: 1 }} />

            {/* Human fallback (WhatsApp + Live Chat) */}
            <HumanHelpBar />

            <Stack
              direction="row"
              alignItems="center"
              gap={1}
              sx={{ px: 1.5, py: 1, flexShrink: 0 }}
            >
              <TextField
                fullWidth
                size="small"
                placeholder={inputPlaceholder}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, 500))}
                onKeyDown={handleKeyDown}
                disabled={loading}
                multiline
                maxRows={3}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    fontSize: '0.8125rem',
                  },
                }}
              />
              <VoiceInputButton
                value={input}
                onChange={setInput}
                disabled={loading}
                color={primaryColor}
                size={40}
              />
              <IconButton
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                aria-label="Send message"
                sx={{
                  bgcolor: primaryColor,
                  color: 'white',
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  '&:hover': { bgcolor: primaryColorDark },
                  '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' },
                }}
              >
                <SendIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Stack>

            <Box sx={{ px: 1.5, pb: 1, flexShrink: 0 }}>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: '0.625rem', lineHeight: 1.3 }}
              >
                Aintra is an AI assistant. Always verify dates and rules at {disclaimerSource}.
              </Typography>
            </Box>
          </Paper>
        </Collapse>
      </Box>
    </>
  );
}
