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
import SchoolIcon from '@mui/icons-material/School';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AintraChatProps {
  collegeId: string;
  collegeName: string;
}

const QUICK_CHIPS = [
  'What are the fees?',
  'How is the hostel?',
  'What are the placements?',
  'How to apply?',
];

export default function AintraChat({ collegeId, collegeName }: AintraChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi! I'm Aintra, your AI guide for ${collegeName}. Ask me anything about fees, admissions, placements, or campus life.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      const historyForApi = updatedMessages
        .slice(1)
        .slice(-6);

      const res = await fetch('/api/colleges/aintra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: collegeId,
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
              data.error || 'Sorry, I could not process your request. Please try again.',
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.reply },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Connection error. Please check your internet and try again.',
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
      {/* Floating Action Button */}
      <Fab
        aria-label="Ask Aintra AI"
        onClick={() => setOpen((v) => !v)}
        sx={{
          position: 'fixed',
          bottom: { xs: 24, md: 32 },
          right: { xs: 16, md: 32 },
          zIndex: 1300,
          bgcolor: '#be185d',
          color: 'white',
          '&:hover': { bgcolor: '#9d174d' },
          boxShadow: '0 4px 20px rgba(190,24,93,0.4)',
          width: 56,
          height: 56,
        }}
      >
        {open ? <CloseIcon /> : <SchoolIcon />}
      </Fab>

      {/* Chat overlay */}
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
            {/* Header */}
            <Box
              sx={{
                px: 2,
                py: 1.5,
                background: 'linear-gradient(135deg, #be185d 0%, #9d174d 100%)',
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
                    Your guide for {collegeName}
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

            {/* Messages */}
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
                        bgcolor: '#fce7f3',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        mb: 0.25,
                      }}
                    >
                      <SmartToyIcon sx={{ fontSize: 14, color: '#be185d' }} />
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
                      bgcolor: msg.role === 'user' ? '#1d4ed8' : '#f8fafc',
                      color: msg.role === 'user' ? 'white' : 'text.primary',
                      border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                    }}
                  >
                    <Typography variant="body2" sx={{ lineHeight: 1.5, fontSize: '0.8125rem' }}>
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
                      <PersonIcon sx={{ fontSize: 14, color: '#1d4ed8' }} />
                    </Box>
                  )}
                </Stack>
              ))}

              {/* Typing indicator */}
              {loading && (
                <Stack direction="row" gap={0.75} alignItems="flex-end">
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      bgcolor: '#fce7f3',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <SmartToyIcon sx={{ fontSize: 14, color: '#be185d' }} />
                  </Box>
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderRadius: '12px 12px 12px 4px',
                      bgcolor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <CircularProgress size={10} sx={{ color: '#be185d' }} />
                    <Typography variant="caption" color="text.secondary">
                      Aintra is thinking...
                    </Typography>
                  </Box>
                </Stack>
              )}
              <div ref={bottomRef} />
            </Box>

            {/* Quick action chips */}
            <Box sx={{ px: 1.5, pt: 1, flexShrink: 0 }}>
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                {QUICK_CHIPS.map((chip) => (
                  <Chip
                    key={chip}
                    label={chip}
                    size="small"
                    onClick={() => sendMessage(chip)}
                    disabled={loading}
                    sx={{
                      fontSize: '0.6875rem',
                      height: 26,
                      cursor: 'pointer',
                      bgcolor: '#fce7f3',
                      color: '#9d174d',
                      border: '1px solid #fbcfe8',
                      '&:hover': { bgcolor: '#fbcfe8' },
                    }}
                  />
                ))}
              </Stack>
            </Box>

            <Divider sx={{ mt: 1 }} />

            {/* Input row */}
            <Stack
              direction="row"
              alignItems="center"
              gap={1}
              sx={{ px: 1.5, py: 1, flexShrink: 0 }}
            >
              <TextField
                fullWidth
                size="small"
                placeholder="Ask about fees, admissions..."
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
              <IconButton
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                aria-label="Send message"
                sx={{
                  bgcolor: '#be185d',
                  color: 'white',
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  '&:hover': { bgcolor: '#9d174d' },
                  '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' },
                }}
              >
                <SendIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Stack>

            {/* Disclaimer */}
            <Box sx={{ px: 1.5, pb: 1, flexShrink: 0 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.625rem', lineHeight: 1.3 }}>
                Aintra is an AI assistant. Verify important information with the college directly.
              </Typography>
            </Box>
          </Paper>
        </Collapse>
      </Box>
    </>
  );
}
