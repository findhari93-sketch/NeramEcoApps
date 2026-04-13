# College Hub Phase 6: Premium Features — Aintra, YouTube, Virtual Tour

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Aintra AI chat (Gemini API) for Gold/Platinum colleges, YouTube channel embed for any college with a channel, and virtual 360° campus tour for Platinum colleges.

**Architecture:** Aintra is a Next.js API route streaming Gemini responses with college data as context. YouTube shows the channel's latest videos via iframe embed (no API key needed — just channel URL). Virtual tour uses Pannellum.js loaded via CDN script tag in a client component.

**Tech Stack:** Next.js 14, MUI v5, @google/generative-ai, Pannellum.js (CDN), Supabase

---

## Task 1: DB Migration + Gemini Package

**Files:**
- Create: `supabase/migrations/20260413_college_hub_phase6.sql`
- Modify: `apps/marketing/package.json`
- Modify: `turbo.json`

**Step-by-step:**

- [ ] 1.1 Create the migration file at `supabase/migrations/20260413_college_hub_phase6.sql`:

```sql
-- Phase 6: Add virtual_tour_scenes column for Platinum college 360° tours
ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS virtual_tour_scenes JSONB DEFAULT NULL;

COMMENT ON COLUMN colleges.virtual_tour_scenes IS
  'Array of VirtualTourScene objects for Pannellum 360° viewer. Only populated for Platinum-tier colleges.
   Schema: [{ id, label, imageUrl, hotspots?: [{pitch, yaw, text, targetScene?}] }]';
```

- [ ] 1.2 Apply the migration to **staging** via MCP tool `mcp__supabase-staging__apply_migration`:
  - name: `college_hub_phase6`
  - query: the SQL above

- [ ] 1.3 Apply the migration to **production** via MCP tool `mcp__supabase-prod__apply_migration`:
  - name: `college_hub_phase6`
  - query: the SQL above

- [ ] 1.4 Add `@google/generative-ai` to `apps/marketing/package.json` dependencies. The full updated `dependencies` block:

```json
"dependencies": {
  "@google/generative-ai": "^0.21.0",
  "@mui/icons-material": "^5.15.0",
  "@mui/material": "^5.15.0",
  "@neram/auth": "workspace:*",
  "@neram/database": "workspace:*",
  "@neram/i18n": "workspace:*",
  "@neram/ui": "workspace:*",
  "@tailwindcss/postcss": "^4.2.1",
  "canvas-confetti": "^1.9.4",
  "clsx": "^2.1.1",
  "firebase": "^11.8.0",
  "firebase-admin": "^13.6.0",
  "framer-motion": "^10.16.16",
  "jspdf": "^4.2.0",
  "next": "14.2.21",
  "next-intl": "^3.4.0",
  "razorpay": "^2.9.2",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "recharts": "^3.8.1",
  "tailwindcss": "^4.2.1"
}
```

- [ ] 1.5 Add `GEMINI_API_KEY` to `turbo.json` `globalEnv` array (after `NEXT_PUBLIC_MARKETING_URL`):

```json
"NEXT_PUBLIC_MARKETING_URL",
"GEMINI_API_KEY"
```

- [ ] 1.6 Run `pnpm install` from the repo root to resolve the new package.

- [ ] 1.7 Commit:

```
chore: add Gemini AI package + virtual_tour_scenes column
```

---

## Task 2: Aintra API Route

**Files:**
- Create: `apps/marketing/src/app/api/colleges/aintra/route.ts`

- [ ] 2.1 Create the file with the following complete content:

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: NextRequest) {
  try {
    const { college_id, message, history } = await request.json();

    if (!college_id || !message) {
      return NextResponse.json(
        { error: 'college_id and message required' },
        { status: 400 }
      );
    }

    if (message.length > 500) {
      return NextResponse.json(
        { error: 'Message too long (max 500 chars)' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: college } = await supabase
      .from('colleges')
      .select(`
        name, short_name, city, state, type, about, neram_tier,
        annual_fee_approx, annual_fee_min, annual_fee_max,
        total_barch_seats, coa_approved, naac_grade, nirf_rank_architecture,
        arch_index_score, accepted_exams, counseling_systems,
        website, admissions_phone, admissions_email,
        has_management_quota, has_nri_quota
      `)
      .eq('id', college_id)
      .single();

    if (!college) {
      return NextResponse.json({ error: 'College not found' }, { status: 404 });
    }

    if (!['gold', 'platinum'].includes(college.neram_tier)) {
      return NextResponse.json(
        { error: 'Aintra is available for Gold and Platinum colleges only' },
        { status: 403 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemContext = `You are Aintra, the AI assistant for ${college.name} on Neram Architecture Portal.
Answer student queries about this college using ONLY the data provided below.
If you don't have specific information, say: "I don't have that data yet. Please check the college's official website or contact admissions directly."
Be helpful, concise, and student-friendly. Never make up information. Keep responses under 150 words.
Do not discuss other colleges. Do not mention that you are built on Gemini.

College Data:
- Name: ${college.name} (${college.short_name || ''})
- Location: ${college.city}, ${college.state}
- Type: ${college.type || 'N/A'}
- About: ${college.about || 'N/A'}
- COA Approved: ${college.coa_approved ? 'Yes' : 'No'}
- NAAC Grade: ${college.naac_grade || 'N/A'}
- NIRF Rank (Architecture): ${college.nirf_rank_architecture ? '#' + college.nirf_rank_architecture : 'N/A'}
- Annual Fee: ${college.annual_fee_approx ? '~\u20b9' + (college.annual_fee_approx / 100000).toFixed(1) + ' Lakhs/yr' : 'N/A'}
- Total B.Arch Seats: ${college.total_barch_seats || 'N/A'}
- Accepted Exams: ${(college.accepted_exams || []).join(', ') || 'N/A'}
- Counseling: ${(college.counseling_systems || []).join(', ') || 'N/A'}
- Management Quota: ${college.has_management_quota ? 'Yes' : 'No'}
- NRI Quota: ${college.has_nri_quota ? 'Yes' : 'No'}
- Admissions Phone: ${college.admissions_phone || 'Contact college website'}
- Admissions Email: ${college.admissions_email || 'N/A'}
- Official Website: ${college.website || 'N/A'}`;

    const chatHistory = (history || [])
      .slice(-6)
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemContext }] },
        {
          role: 'model',
          parts: [
            {
              text: `Understood. I am Aintra, the AI assistant for ${college.name}. How can I help you?`,
            },
          ],
        },
        ...chatHistory,
      ],
    });

    const result = await chat.sendMessage(message);
    const response = result.response.text();

    return NextResponse.json({ reply: response });
  } catch (err) {
    console.error('Aintra error:', err);
    return NextResponse.json(
      { error: 'AI service temporarily unavailable' },
      { status: 500 }
    );
  }
}
```

- [ ] 2.2 Commit:

```
feat(college-hub): Aintra AI chat API route (Gemini 1.5 Flash)
```

---

## Task 3: AintraChat Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/AintraChat.tsx`
- Modify: `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`

### 3.1 Create `AintraChat.tsx`

```typescript
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

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, loading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg].slice(-11); // keep last 10 + new
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const historyForApi = updatedMessages
        .slice(1) // skip the initial greeting
        .slice(-6); // last 6 turns for context

      const res = await fetch('/api/colleges/aintra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: collegeId,
          message: trimmed,
          history: historyForApi.slice(0, -1), // history before current message
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
```

### 3.2 Modify `CollegePageTemplate.tsx`

Add the dynamic import at the top of the file (after the existing imports):

```typescript
import dynamic from 'next/dynamic';

const AintraChat = dynamic(() => import('./AintraChat'), { ssr: false });
```

Add the AintraChat mount point after the Q&A section and before `ClaimProfileCTA`. Insert after the closing `</Box>` of the `id="qa"` block:

```tsx
{/* Aintra AI Chat — Gold and Platinum only */}
{(college.neram_tier === 'gold' || college.neram_tier === 'platinum') && (
  <AintraChat
    collegeId={college.id}
    collegeName={college.short_name ?? college.name}
  />
)}
```

Note: AintraChat uses `position: fixed` so it renders as a floating FAB regardless of where it sits in the DOM. The mount point just controls when it mounts (only for eligible tiers).

- [ ] 3.1 Create `AintraChat.tsx` with content above.
- [ ] 3.2 Add `dynamic` import for `AintraChat` to `CollegePageTemplate.tsx`.
- [ ] 3.3 Add AintraChat usage to `CollegePageTemplate.tsx` (after Q&A section, inside the `md={8}` Grid item).
- [ ] 3.4 Commit:

```
feat(college-hub): AintraChat component — Gemini-powered AI for Gold/Platinum colleges
```

---

## Task 4: YouTube Channel Embed

**Files:**
- Create: `apps/marketing/src/components/college-hub/CollegeYouTube.tsx`
- Modify: `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`

### 4.1 Create `CollegeYouTube.tsx`

This is a **Server Component** (no `'use client'` directive). It parses the YouTube channel URL and renders a styled card with a direct link to the channel. No API key is needed.

```typescript
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface CollegeYouTubeProps {
  youtubeChannelUrl: string;
}

/**
 * Normalises a YouTube channel URL to a clean canonical form.
 * Handles formats:
 *   https://www.youtube.com/@handle
 *   https://www.youtube.com/channel/UCxxxxxx
 *   https://youtube.com/c/channelname
 *   https://youtube.com/user/username
 */
function normaliseYouTubeUrl(raw: string): string {
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    // Strip UTM / tracking params
    return `https://www.youtube.com${url.pathname}`;
  } catch {
    return raw;
  }
}

/**
 * Extracts a human-readable channel label from a URL.
 * "@handle" → "@handle"
 * "/channel/UCxxxxxx" → "Official Channel"
 * "/c/name" → "name"
 * "/user/name" → "name"
 */
function extractChannelLabel(url: string): string {
  try {
    const { pathname } = new URL(url.startsWith('http') ? url : `https://${url}`);
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0]?.startsWith('@')) return parts[0];
    if (parts[0] === 'channel') return 'Official Channel';
    if (parts[1]) return parts[1];
    return 'Official Channel';
  } catch {
    return 'Official Channel';
  }
}

export default function CollegeYouTube({ youtubeChannelUrl }: CollegeYouTubeProps) {
  const canonicalUrl = normaliseYouTubeUrl(youtubeChannelUrl);
  const channelLabel = extractChannelLabel(youtubeChannelUrl);

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        borderColor: '#fee2e2',
        background: 'linear-gradient(135deg, #fff7f7 0%, #fff 100%)',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        gap={2}
        sx={{ p: { xs: 2, sm: 2.5 } }}
      >
        {/* YouTube icon block */}
        <Box
          sx={{
            width: { xs: 56, sm: 64 },
            height: { xs: 56, sm: 64 },
            borderRadius: 2,
            bgcolor: '#ff0000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <PlayCircleIcon sx={{ fontSize: { xs: 32, sm: 36 }, color: 'white' }} />
        </Box>

        {/* Text content */}
        <Box flex={1}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, mb: 0.25, fontSize: { xs: '0.9375rem', sm: '1rem' } }}
          >
            {channelLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5, mb: 1.5 }}>
            Follow this college's official YouTube channel for campus tours, events, student life videos, and academic content.
          </Typography>
          <Button
            variant="contained"
            size="small"
            href={canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={{
              bgcolor: '#ff0000',
              '&:hover': { bgcolor: '#cc0000' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8125rem',
              px: 2,
              py: 0.75,
              minHeight: 36,
            }}
          >
            View YouTube Channel
          </Button>
        </Box>
      </Stack>

      {/* Subscription note */}
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: 1,
          bgcolor: '#fff1f2',
          borderTop: '1px solid #fee2e2',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Subscribe to stay updated on admissions, workshops, and student events from this college.
        </Typography>
      </Box>
    </Paper>
  );
}
```

### 4.2 Modify `CollegePageTemplate.tsx`

Add the import for `PlayCircleIcon` and `CollegeYouTube` at the top (with other imports):

```typescript
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CollegeYouTube from './CollegeYouTube';
```

Update `NAV_PILLS` to be a function that builds dynamically based on college data. Replace the static `const NAV_PILLS = [...]` declaration with:

```typescript
function buildNavPills(college: CollegeDetail) {
  const pills = [
    { id: 'overview', label: 'Overview', icon: <InfoIcon sx={{ fontSize: 16 }} /> },
    { id: 'fees', label: 'Fees', icon: <AttachMoneyIcon sx={{ fontSize: 16 }} /> },
    { id: 'cutoffs', label: 'Cutoffs', icon: <TrendingUpIcon sx={{ fontSize: 16 }} /> },
    { id: 'placements', label: 'Placements', icon: <TrendingUpIcon sx={{ fontSize: 16 }} /> },
    { id: 'infrastructure', label: 'Infrastructure', icon: <BusinessIcon sx={{ fontSize: 16 }} /> },
    { id: 'faculty', label: 'Faculty', icon: <PeopleIcon sx={{ fontSize: 16 }} /> },
  ];

  if (college.youtube_channel_url) {
    pills.push({ id: 'youtube', label: 'Videos', icon: <PlayCircleIcon sx={{ fontSize: 16 }} /> });
  }

  if (
    college.neram_tier === 'platinum' &&
    (college as any).virtual_tour_scenes &&
    ((college as any).virtual_tour_scenes as unknown[]).length > 0
  ) {
    pills.push({ id: 'virtual-tour', label: '360\u00b0 Tour', icon: <TourIcon sx={{ fontSize: 16 }} /> });
  }

  return pills;
}
```

Then in the component body, replace the `<NavPills pills={NAV_PILLS} />` call with:

```tsx
<NavPills pills={buildNavPills(college)} />
```

Add the YouTube section inside the `md={8}` Grid item, after the Faculty section and before the Reviews section:

```tsx
{/* YouTube Channel */}
{college.youtube_channel_url && (
  <Section id="youtube" title="Official YouTube Channel">
    <CollegeYouTube youtubeChannelUrl={college.youtube_channel_url} />
  </Section>
)}
```

- [ ] 4.1 Create `CollegeYouTube.tsx` with content above.
- [ ] 4.2 Add `PlayCircleIcon` import and `CollegeYouTube` import to `CollegePageTemplate.tsx`.
- [ ] 4.3 Replace static `NAV_PILLS` array with `buildNavPills()` function in `CollegePageTemplate.tsx`.
- [ ] 4.4 Update `<NavPills pills={NAV_PILLS} />` to `<NavPills pills={buildNavPills(college)} />`.
- [ ] 4.5 Add YouTube section to the template after Faculty section.
- [ ] 4.6 Commit:

```
feat(college-hub): YouTube channel section on college pages
```

---

## Task 5: Virtual Campus Tour (Pannellum)

**Files:**
- Modify: `apps/marketing/src/lib/college-hub/types.ts`
- Create: `apps/marketing/src/components/college-hub/VirtualTour.tsx`
- Modify: `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`
- Create: `apps/admin/src/app/api/college-hub/virtual-tour/route.ts`
- Create: `apps/admin/src/app/(dashboard)/college-hub/virtual-tour/page.tsx`

### 5.1 Modify `apps/marketing/src/lib/college-hub/types.ts`

Add the `VirtualTourScene` interface and update `College` to include the new column. Add after the `CollegeLead` interface at the end of the file:

```typescript
// Phase 6: Virtual campus tour data (Platinum-tier colleges only)
export interface VirtualTourHotspot {
  pitch: number;
  yaw: number;
  text: string;
  targetScene?: string;
}

export interface VirtualTourScene {
  id: string;
  label: string;
  imageUrl: string;
  hotspots?: VirtualTourHotspot[];
}
```

Also add `virtual_tour_scenes?: VirtualTourScene[] | null;` to the `College` interface, after the `gallery_images` field:

```typescript
  gallery_images: string[] | null;
  virtual_tour_scenes?: VirtualTourScene[] | null;
```

### 5.2 Create `VirtualTour.tsx`

```typescript
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { Box, Typography, Stack, Chip } from '@mui/material';
import TourIcon from '@mui/icons-material/Tour';
import type { VirtualTourScene } from '@/lib/college-hub/types';

// Extend window for Pannellum
declare global {
  interface Window {
    pannellum?: {
      viewer: (
        container: HTMLElement,
        config: Record<string, unknown>
      ) => { destroy: () => void };
    };
  }
}

interface VirtualTourProps {
  scenes: VirtualTourScene[];
  collegeName: string;
}

export default function VirtualTour({ scenes, collegeName }: VirtualTourProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const pannellumInstanceRef = useRef<{ destroy: () => void } | null>(null);
  const [activeScene, setActiveScene] = useState(scenes[0]?.id ?? '');
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);

  const initViewer = useCallback(() => {
    if (!viewerRef.current || !window.pannellum) return;

    const scene = scenes.find((s) => s.id === activeScene);
    if (!scene) return;

    // Destroy existing instance before re-initialising
    if (pannellumInstanceRef.current) {
      try {
        pannellumInstanceRef.current.destroy();
      } catch {
        // ignore
      }
      pannellumInstanceRef.current = null;
      setViewerReady(false);
    }

    const instance = window.pannellum.viewer(viewerRef.current, {
      type: 'equirectangular',
      panorama: scene.imageUrl,
      autoLoad: true,
      showControls: true,
      showFullscreenCtrl: true,
      showZoomCtrl: true,
      compass: false,
      hotSpots: (scene.hotspots || []).map((h) => ({
        pitch: h.pitch,
        yaw: h.yaw,
        type: h.targetScene ? 'scene' : 'info',
        text: h.text,
        sceneId: h.targetScene,
      })),
      onLoad: () => setViewerReady(true),
    });

    pannellumInstanceRef.current = instance;
  }, [activeScene, scenes]);

  // Reinitialise viewer when scene changes (after script is loaded)
  useEffect(() => {
    if (scriptLoaded) {
      initViewer();
    }
    return () => {
      if (pannellumInstanceRef.current) {
        try {
          pannellumInstanceRef.current.destroy();
        } catch {
          // ignore
        }
        pannellumInstanceRef.current = null;
      }
    };
  }, [activeScene, scriptLoaded, initViewer]);

  if (!scenes || scenes.length === 0) return null;

  return (
    <Box>
      {/* Pannellum CSS via link tag */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"
      />

      {/* Pannellum JS — loaded once, triggers initViewer via onLoad */}
      <Script
        src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
      />

      {/* Scene selector chips (only shown when multiple scenes exist) */}
      {scenes.length > 1 && (
        <Stack
          direction="row"
          gap={1}
          flexWrap="wrap"
          sx={{ mb: 2 }}
          role="tablist"
          aria-label="Campus tour scenes"
        >
          {scenes.map((scene) => (
            <Chip
              key={scene.id}
              label={scene.label}
              onClick={() => setActiveScene(scene.id)}
              variant={activeScene === scene.id ? 'filled' : 'outlined'}
              color={activeScene === scene.id ? 'primary' : 'default'}
              size="small"
              icon={<TourIcon sx={{ fontSize: 14 }} />}
              sx={{ minHeight: 32, fontSize: '0.8125rem' }}
              role="tab"
              aria-selected={activeScene === scene.id}
            />
          ))}
        </Stack>
      )}

      {/* 360-degree viewer container */}
      <Box sx={{ position: 'relative' }}>
        <Box
          ref={viewerRef}
          sx={{
            width: '100%',
            height: { xs: 280, sm: 400, md: 500 },
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: '#0f172a',
          }}
        />

        {/* Loading overlay */}
        {!viewerReady && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: '#0f172a',
              borderRadius: 2,
              gap: 1,
            }}
          >
            <TourIcon sx={{ fontSize: 40, color: '#475569' }} />
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              Loading 360° tour of {collegeName}...
            </Typography>
          </Box>
        )}
      </Box>

      {/* Usage hint */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 1, textAlign: 'center' }}
      >
        Click and drag to explore. Scroll to zoom. Tap hotspots for details.
      </Typography>
    </Box>
  );
}
```

### 5.3 Modify `CollegePageTemplate.tsx` — Add Virtual Tour

Add imports at the top of the file (alongside other dynamic imports):

```typescript
import TourIcon from '@mui/icons-material/Tour';
import type { VirtualTourScene } from '@/lib/college-hub/types';

const VirtualTour = dynamic(() => import('./VirtualTour'), { ssr: false });
```

Add the Virtual Tour section inside the `md={8}` Grid item, after the YouTube section and before the Reviews section:

```tsx
{/* Virtual Campus Tour — Platinum only, when scenes exist */}
{college.neram_tier === 'platinum' &&
  college.virtual_tour_scenes &&
  (college.virtual_tour_scenes as VirtualTourScene[]).length > 0 && (
    <Section id="virtual-tour" title="Virtual Campus Tour">
      <VirtualTour
        scenes={college.virtual_tour_scenes as VirtualTourScene[]}
        collegeName={college.name}
      />
    </Section>
  )}
```

Note: The `buildNavPills()` function added in Task 4 already handles adding the `360° Tour` nav pill conditionally when `virtual_tour_scenes` has data.

### 5.4 Create Admin Virtual Tour API Route

File: `apps/admin/src/app/api/college-hub/virtual-tour/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

// GET /api/college-hub/virtual-tour?college_id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const college_id = searchParams.get('college_id');

  if (!college_id) {
    return NextResponse.json({ error: 'college_id required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('colleges')
    .select('id, name, short_name, neram_tier, virtual_tour_scenes')
    .eq('id', college_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'College not found' }, { status: 404 });
  }

  return NextResponse.json({ college: data });
}

// PATCH /api/college-hub/virtual-tour
// Body: { college_id: string, virtual_tour_scenes: VirtualTourScene[] | null }
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { college_id, virtual_tour_scenes } = body;

    if (!college_id) {
      return NextResponse.json({ error: 'college_id required' }, { status: 400 });
    }

    // Basic validation: if provided, must be an array
    if (virtual_tour_scenes !== null && !Array.isArray(virtual_tour_scenes)) {
      return NextResponse.json(
        { error: 'virtual_tour_scenes must be an array or null' },
        { status: 400 }
      );
    }

    // Validate each scene has required fields
    if (Array.isArray(virtual_tour_scenes)) {
      for (const scene of virtual_tour_scenes) {
        if (!scene.id || !scene.label || !scene.imageUrl) {
          return NextResponse.json(
            { error: 'Each scene must have id, label, and imageUrl' },
            { status: 400 }
          );
        }
      }
    }

    const supabase = createAdminClient();

    // Verify college is Platinum (only Platinum gets virtual tours)
    const { data: college } = await supabase
      .from('colleges')
      .select('id, neram_tier')
      .eq('id', college_id)
      .single();

    if (!college) {
      return NextResponse.json({ error: 'College not found' }, { status: 404 });
    }

    if (college.neram_tier !== 'platinum') {
      return NextResponse.json(
        { error: 'Virtual tours are only available for Platinum-tier colleges' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('colleges')
      .update({
        virtual_tour_scenes: virtual_tour_scenes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', college_id)
      .select('id, name, neram_tier, virtual_tour_scenes')
      .single();

    if (error) {
      console.error('Virtual tour update error:', error);
      return NextResponse.json({ error: 'Failed to update virtual tour' }, { status: 500 });
    }

    return NextResponse.json({ college: data });
  } catch (err) {
    console.error('Virtual tour PATCH error:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
```

### 5.5 Create Admin Virtual Tour Management Page

File: `apps/admin/src/app/(dashboard)/college-hub/virtual-tour/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  TextField,
  Button,
  IconButton,
  Alert,
  Divider,
  Chip,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import TourIcon from '@mui/icons-material/Tour';

interface VirtualTourScene {
  id: string;
  label: string;
  imageUrl: string;
  hotspots?: Array<{
    pitch: number;
    yaw: number;
    text: string;
    targetScene?: string;
  }>;
}

interface CollegeOption {
  id: string;
  name: string;
  short_name: string | null;
  neram_tier: string;
}

function generateSceneId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `scene-${Date.now()}`;
}

export default function VirtualTourAdminPage() {
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [scenes, setScenes] = useState<VirtualTourScene[]>([]);
  const [collegeName, setCollegeName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingColleges, setFetchingColleges] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Load Platinum colleges
  useEffect(() => {
    async function loadColleges() {
      try {
        const res = await fetch('/api/college-hub/colleges?tier=platinum&limit=100');
        const data = await res.json();
        setColleges(data.colleges || []);
      } catch {
        setError('Failed to load colleges. Refresh the page.');
      } finally {
        setFetchingColleges(false);
      }
    }
    loadColleges();
  }, []);

  // Load existing scenes when college is selected
  useEffect(() => {
    if (!selectedCollegeId) return;

    setLoading(true);
    setError('');
    setSuccess(false);
    setScenes([]);

    fetch(`/api/college-hub/virtual-tour?college_id=${selectedCollegeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.college) {
          setCollegeName(data.college.short_name || data.college.name);
          setScenes(data.college.virtual_tour_scenes || []);
        }
      })
      .catch(() => setError('Failed to load virtual tour data.'))
      .finally(() => setLoading(false));
  }, [selectedCollegeId]);

  const addScene = () => {
    setScenes((prev) => [
      ...prev,
      { id: `scene-${Date.now()}`, label: '', imageUrl: '' },
    ]);
  };

  const updateScene = (index: number, field: keyof VirtualTourScene, value: string) => {
    setScenes((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const updated = { ...s, [field]: value };
        // Auto-generate ID from label if label changes
        if (field === 'label') {
          updated.id = generateSceneId(value);
        }
        return updated;
      })
    );
  };

  const removeScene = (index: number) => {
    setScenes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setError('');
    setSuccess(false);

    // Validate all scenes
    for (const scene of scenes) {
      if (!scene.label.trim()) {
        setError('All scenes must have a label.');
        return;
      }
      if (!scene.imageUrl.trim()) {
        setError('All scenes must have an image URL.');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/college-hub/virtual-tour', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: selectedCollegeId,
          virtual_tour_scenes: scenes.length > 0 ? scenes : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save. Please try again.');
      } else {
        setSuccess(true);
        setScenes(data.college.virtual_tour_scenes || []);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <TourIcon sx={{ fontSize: 28, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Virtual Campus Tour
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add 360-degree panoramic scenes for Platinum-tier colleges.
          </Typography>
        </Box>
      </Stack>

      {/* College selector */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
        <FormControl fullWidth size="small" disabled={fetchingColleges}>
          <InputLabel>Select Platinum College</InputLabel>
          <Select
            value={selectedCollegeId}
            onChange={(e) => setSelectedCollegeId(e.target.value)}
            label="Select Platinum College"
          >
            {colleges.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.short_name || c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {fetchingColleges && (
          <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1.5 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">
              Loading colleges...
            </Typography>
          </Stack>
        )}
        {!fetchingColleges && colleges.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            No Platinum-tier colleges found.
          </Typography>
        )}
      </Paper>

      {loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Loading tour data...
          </Typography>
        </Box>
      )}

      {selectedCollegeId && !loading && (
        <>
          {success && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
              Virtual tour scenes saved for {collegeName}.
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Tour Scenes
                {scenes.length > 0 && (
                  <Chip
                    label={`${scenes.length} scene${scenes.length === 1 ? '' : 's'}`}
                    size="small"
                    sx={{ ml: 1, fontSize: '0.75rem' }}
                  />
                )}
              </Typography>
              <Button
                startIcon={<AddCircleOutlineIcon />}
                size="small"
                onClick={addScene}
                variant="outlined"
                sx={{ textTransform: 'none' }}
              >
                Add Scene
              </Button>
            </Stack>

            {scenes.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 4,
                  bgcolor: '#f8fafc',
                  borderRadius: 1.5,
                  border: '2px dashed #e2e8f0',
                }}
              >
                <TourIcon sx={{ fontSize: 36, color: '#cbd5e1', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No scenes yet. Click "Add Scene" to get started.
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Upload 360-degree equirectangular images to Supabase storage and paste the public URL here.
                </Typography>
              </Box>
            ) : (
              <Stack gap={2}>
                {scenes.map((scene, index) => (
                  <Box key={scene.id}>
                    {index > 0 && <Divider sx={{ mb: 2 }} />}
                    <Stack
                      direction="row"
                      alignItems="flex-start"
                      gap={1.5}
                      sx={{ mb: 0 }}
                    >
                      <Box
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          mt: 0.5,
                        }}
                      >
                        {index + 1}
                      </Box>
                      <Box flex={1}>
                        <Stack gap={1.5}>
                          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
                            <TextField
                              label="Scene Label"
                              placeholder="e.g. Main Entrance"
                              size="small"
                              value={scene.label}
                              onChange={(e) => updateScene(index, 'label', e.target.value)}
                              sx={{ flex: 1 }}
                            />
                            <TextField
                              label="Scene ID (auto)"
                              size="small"
                              value={scene.id}
                              InputProps={{ readOnly: true }}
                              sx={{ flex: 1 }}
                            />
                          </Stack>
                          <TextField
                            label="360-degree Image URL"
                            placeholder="https://zdnypksjqnhtiblwdaic.supabase.co/storage/v1/object/public/..."
                            size="small"
                            fullWidth
                            value={scene.imageUrl}
                            onChange={(e) => updateScene(index, 'imageUrl', e.target.value)}
                            helperText="Upload equirectangular (2:1 aspect ratio) panoramic image to Supabase storage and paste the public URL."
                          />
                        </Stack>
                      </Box>
                      <IconButton
                        onClick={() => removeScene(index)}
                        size="small"
                        aria-label="Remove scene"
                        sx={{ color: 'error.main', flexShrink: 0 }}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2.5 }}>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving}
              sx={{ textTransform: 'none', fontWeight: 600, minHeight: 42, px: 3 }}
            >
              {saving ? 'Saving...' : 'Save Virtual Tour'}
            </Button>
          </Stack>
        </>
      )}
    </Box>
  );
}
```

- [ ] 5.1 Add `VirtualTourScene` and `VirtualTourHotspot` interfaces to `apps/marketing/src/lib/college-hub/types.ts`.
- [ ] 5.2 Add `virtual_tour_scenes?: VirtualTourScene[] | null;` field to the `College` interface.
- [ ] 5.3 Create `VirtualTour.tsx` with content above.
- [ ] 5.4 Add `TourIcon`, `VirtualTourScene` import and `VirtualTour` dynamic import to `CollegePageTemplate.tsx`.
- [ ] 5.5 Add Virtual Tour section to `CollegePageTemplate.tsx` (after YouTube section, before Reviews).
- [ ] 5.6 Create admin API route at `apps/admin/src/app/api/college-hub/virtual-tour/route.ts`.
- [ ] 5.7 Create admin management page at `apps/admin/src/app/(dashboard)/college-hub/virtual-tour/page.tsx`.
- [ ] 5.8 Add "Virtual Tour" link to the admin sidebar for the college-hub section. Look for the sidebar nav in `apps/admin/src/components/` or `apps/admin/src/app/(dashboard)/layout.tsx` and add:
  ```tsx
  { label: 'Virtual Tour', href: '/college-hub/virtual-tour', icon: <TourIcon /> }
  ```
- [ ] 5.9 Commit:

```
feat(college-hub): Virtual campus tour with Pannellum for Platinum colleges
```

---

## Task 6: Update turbo.json + Env Docs + Progress Tracker

**Files:**
- Modify: `turbo.json`
- Modify: `apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md`

### 6.1 Update `turbo.json`

The `GEMINI_API_KEY` was added to `globalEnv` in Task 1 Step 1.5. Confirm it is present. The final relevant section should look like:

```json
"globalEnv": [
  "NODE_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_AZURE_AD_CLIENT_ID",
  "NEXT_PUBLIC_AZURE_AD_TENANT_ID",
  "AZURE_AD_CLIENT_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_TAWK_PROPERTY_ID",
  "NEXT_PUBLIC_TAWK_WIDGET_ID",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "NEXT_PUBLIC_GOOGLE_ADS_ID",
  "NEXT_PUBLIC_GOOGLE_ADS_CALL_LABEL",
  "NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL",
  "NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL",
  "NEXT_PUBLIC_GOOGLE_ADS_CREDIT_SIGNUP_LABEL",
  "NEXT_PUBLIC_MARKETING_URL",
  "GEMINI_API_KEY"
]
```

### 6.2 Update `apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md`

Append the following section to the progress file (after the Phase 4 section and Session Log):

```markdown
---

## Phase 6: Premium Features (COMPLETE — 2026-04-13)

### DB Migration

- [x] `supabase/migrations/20260413_college_hub_phase6.sql` — `virtual_tour_scenes JSONB` column added to `colleges` table
- [x] Migration applied to staging via MCP (`mcp__supabase-staging__apply_migration`)
- [x] Migration applied to production via MCP (`mcp__supabase-prod__apply_migration`)

### Package Changes

- [x] `@google/generative-ai@^0.21.0` added to `apps/marketing/package.json`
- [x] `GEMINI_API_KEY` added to `turbo.json` globalEnv

### Aintra AI Chat (Gemini 1.5 Flash)

- [x] `apps/marketing/src/app/api/colleges/aintra/route.ts` — POST endpoint using Gemini API
  - College data loaded from Supabase as system context
  - Tier-gated: only Gold and Platinum colleges get Aintra
  - Rate-limit-safe: uses gemini-1.5-flash (free tier: 15 RPM, 1500 RPD)
  - History: last 6 turns passed for conversational context
  - Message length: capped at 500 characters
- [x] `apps/marketing/src/components/college-hub/AintraChat.tsx` — client component
  - Fixed FAB (pink/rose) bottom-right, does not displace content
  - Opens as bottom sheet on mobile, floating panel on desktop
  - Quick chips: "What are the fees?", "How is the hostel?", "What are the placements?", "How to apply?"
  - Chat history: max 10 messages in local state
  - Typing indicator while waiting for Gemini response
  - Disclaimer: "Aintra is an AI assistant. Verify important information with the college directly."
  - Loaded via `next/dynamic` with `ssr: false` (client only)
- [x] `CollegePageTemplate.tsx` — AintraChat mounted for Gold and Platinum colleges

### YouTube Channel Section

- [x] `apps/marketing/src/components/college-hub/CollegeYouTube.tsx` — Server Component
  - Renders for any college with `youtube_channel_url` set (all tiers)
  - URL normalisation handles @handle, /channel/UC*, /c/name, /user/name formats
  - Styled card with YouTube red icon + "View YouTube Channel" button
  - No API key required, purely a deep link
- [x] `CollegePageTemplate.tsx` — YouTube section added after Faculty
- [x] `buildNavPills()` function replaces static `NAV_PILLS` array; "Videos" pill added dynamically

### Virtual Campus Tour (Pannellum.js)

- [x] `apps/marketing/src/lib/college-hub/types.ts` — `VirtualTourScene` and `VirtualTourHotspot` interfaces added; `virtual_tour_scenes` field added to `College`
- [x] `apps/marketing/src/components/college-hub/VirtualTour.tsx` — client component
  - Pannellum.js loaded via CDN (lazy, `strategy="lazyOnload"`)
  - Renders only for Platinum colleges with scenes data
  - Scene selector chips for multi-scene tours
  - Loading overlay until Pannellum is initialised
  - Hotspot support (info + scene transition types)
  - Cleanup on unmount / scene change
- [x] `CollegePageTemplate.tsx` — Virtual Tour section added after YouTube, gated to Platinum + scenes present
- [x] `buildNavPills()` — "360 Tour" pill added when Platinum + scenes present
- [x] `apps/admin/src/app/api/college-hub/virtual-tour/route.ts` — GET + PATCH API route
  - GET: returns current scenes for a college
  - PATCH: updates scenes; validates Platinum tier before writing
- [x] `apps/admin/src/app/(dashboard)/college-hub/virtual-tour/page.tsx` — admin management UI
  - Platinum college selector dropdown
  - Add/remove scenes with label and Supabase storage URL fields
  - Auto-generates scene ID from label
  - Save button calls PATCH API

### Env Vars Required (add to Vercel before deploying)

- `GEMINI_API_KEY` — Google Gemini API key, server-only (not NEXT_PUBLIC_)
  - Get from: https://aistudio.google.com/app/apikey
  - Add to Vercel marketing project: `cd apps/marketing && echo "<key>" | vercel env add GEMINI_API_KEY production`
  - Also add to preview: `echo "<key>" | vercel env add GEMINI_API_KEY preview`

### Verification Checklist

- [ ] `pnpm type-check` passes (0 errors)
- [ ] `pnpm build` passes — 0 errors
- [ ] Aintra FAB appears on a Gold/Platinum college page, not on a free/silver page
- [ ] Aintra responds with real college data (fees, exams, contact)
- [ ] YouTube section appears on colleges with `youtube_channel_url` set
- [ ] YouTube link opens in a new tab
- [ ] Virtual tour loads on a Platinum college with `virtual_tour_scenes` data in DB
- [ ] Admin virtual-tour page loads at `/college-hub/virtual-tour`
- [ ] Admin can add scenes and save; scenes appear on the public page after refresh
- [ ] No horizontal scroll at 375px viewport
- [ ] AintraChat FAB does not overlap mobile bottom navigation
```

### 6.3 Commit:

```
docs: Phase 6 complete — Aintra/Gemini, YouTube, Virtual Tour
```

---

## Before Deploying: Pre-Deploy Checklist

> Follow this checklist before running `pnpm deploy:all` or `pnpm deploy:staging`.

- [ ] `GEMINI_API_KEY` added to Vercel for both production and preview environments:
  ```bash
  cd apps/marketing
  echo "<your-gemini-key>" | vercel env add GEMINI_API_KEY production
  echo "<your-gemini-key>" | vercel env add GEMINI_API_KEY preview
  ```
- [ ] `GEMINI_API_KEY` added to local `.env.local` for local development testing
- [ ] DB migration already applied to staging and prod (done in Task 1)
- [ ] `pnpm type-check` passes with 0 errors
- [ ] `pnpm build` passes with 0 errors
- [ ] Verified Aintra responds correctly with a test Gold/Platinum college

---

## Architecture Notes

### Aintra Rate Limits (Gemini 1.5 Flash free tier)
- 15 requests per minute (RPM)
- 1500 requests per day (RPD)
- 1 million tokens per minute (TPM)
- For higher traffic, upgrade to a paid Gemini API plan or add request throttling at the API route level

### Virtual Tour Image Requirements
- Format: equirectangular (panoramic, 2:1 aspect ratio)
- Recommended resolution: 4096 x 2048 px minimum
- Hosting: Upload to Supabase storage bucket (use the `college-assets` bucket or create `college-tours`)
- Make bucket public and use the public URL in the admin UI

### YouTube Embed Approach
The implementation uses a direct channel link rather than an iframe embed for these reasons:
1. YouTube channel embeds via iframe require an API key and have embed restrictions
2. A direct link is more reliable across devices and avoids CSP issues
3. It works for any channel URL format (handle, channel ID, user, custom URL)

### Pannellum.js CDN Loading
Pannellum is loaded from jsDelivr CDN with `strategy="lazyOnload"` to avoid blocking the page. The CSS is loaded via a `<link>` tag. The library is ~180 KB gzipped and only loads when the VirtualTour component mounts (Platinum pages only).
