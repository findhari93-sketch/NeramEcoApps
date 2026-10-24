'use client';

/**
 * Small shared pieces for Aintra Inbox: status pills, avatars, stat cards,
 * section labels and date formatting. Colours come from the @neram/ui theme.
 */
import type { ReactNode } from 'react';
import { AVATAR_RING_EXTRA, Avatar, AvatarRing, Box, Paper, Tooltip, Typography } from '@neram/ui';
import PersonIcon from '@mui/icons-material/Person';
import { alpha, type Theme } from '@mui/material/styles';
import { channelLabel } from '@neram/database/analytics';
import SharedPersonAvatar from '@/components/person/PersonAvatar';
import type { LeadStage, TurnStatus } from '@/lib/aintra-inbox/types';

const IST = 'Asia/Kolkata';

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST }).toLowerCase();

export const fmtDate = (iso: string, withYear = false) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: IST });

export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;

/** "2 h ago", "3 d ago", then a date. */
export function fmtAgo(iso: string, now = Date.now()): string {
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return fmtDate(iso, true);
}

export const sourceLabelOf = (channel: string | null) => channelLabel(channel);

export const chatbotLabel = (source: string | null) => (source === 'nata_chatbot' ? 'NATA page chat' : 'Website chat');

type Tone = 'error' | 'success' | 'neutral' | 'warning';

export const STATUS_META: Record<TurnStatus, { label: string; tone: Tone }> = {
  review: { label: 'Needs review', tone: 'error' },
  error: { label: 'No answer', tone: 'error' },
  corrected: { label: 'Corrected', tone: 'success' },
  resolved: { label: 'Resolved', tone: 'success' },
  gated: { label: 'Asked to sign in', tone: 'neutral' },
  ok: { label: 'Verified', tone: 'success' },
  none: { label: 'Not reviewed', tone: 'neutral' },
};

/** Pale fill and a soft border in a palette colour; the text uses the dark shade for 4.5:1 contrast. */
const tint = (key: 'error' | 'success' | 'warning' | 'primary') => ({
  color: `${key}.dark`,
  bgcolor: (t: Theme) => alpha(t.palette[key].main, 0.08),
  borderColor: (t: Theme) => alpha(t.palette[key].main, 0.45),
});

const TONE_SX: Record<Tone, object> = {
  error: tint('error'),
  success: tint('success'),
  warning: tint('warning'),
  neutral: { color: 'text.secondary', bgcolor: 'grey.100', borderColor: 'grey.300' },
};

export function Pill({ children, tone = 'neutral', sx }: { children: ReactNode; tone?: Tone | 'primary'; sx?: object }) {
  const toneSx = tone === 'primary' ? tint('primary') : TONE_SX[tone];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1,
        py: '1px',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.6,
        borderRadius: 999,
        border: 1,
        whiteSpace: 'nowrap',
        ...toneSx,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/** Status pill; a no-answer turn caused by spent credits says so. */
export function StatusPill({ status, credits }: { status: TurnStatus; credits?: boolean }) {
  const meta = STATUS_META[status];
  return <Pill tone={meta.tone}>{status === 'error' && credits ? 'Credits ran out' : meta.label}</Pill>;
}

export const STAGE_TONE: Record<LeadStage, { color: string }> = {
  Enrolled: { color: 'success.dark' },
  'Demo booked': { color: 'primary.main' },
  'Callback asked': { color: 'primary.main' },
  Applied: { color: 'primary.main' },
  'Hot lead': { color: 'primary.main' },
  Warm: { color: 'text.primary' },
  Unknown: { color: 'text.secondary' },
};

/**
 * Guests get a grey person icon. Everyone else gets the shared Admin avatar:
 * photo or initials, the who-is-this ring (gold for an enrolled student) and the
 * language letter, looked up by userId like every other list in Admin.
 */
export function PersonAvatar({
  isGuest,
  userId,
  name,
  src,
  enrolled = false,
  size = 36,
}: {
  isGuest: boolean;
  userId?: string | null;
  name?: string | null;
  src?: string | null;
  enrolled?: boolean;
  size?: number;
}) {
  if (isGuest) {
    // A chat guest is outside the funnel until they sign in: the dotted ring.
    const inner = size - AVATAR_RING_EXTRA;
    return (
      <Tooltip title="Chat guest. Not signed in." arrow disableInteractive>
        <Box role="img" aria-label="Chat guest. Not signed in." sx={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}>
          <AvatarRing variant="other" size={inner}>
            <Avatar aria-hidden sx={{ width: inner, height: inner, bgcolor: 'grey.200', color: 'grey.600' }}>
              <PersonIcon sx={{ fontSize: inner * 0.55 }} />
            </Avatar>
          </AvatarRing>
        </Box>
      </Tooltip>
    );
  }
  // The ring adds 6px, so the photo shrinks to keep the overall size the same.
  // The inbox already knows "enrolled" (the same student_profiles / classroom
  // account rule), so gold paints at once; anyone else with an account is looked
  // up, and a person with no account is a lead.
  return (
    <SharedPersonAvatar
      userId={userId}
      name={name}
      src={src ?? null}
      size={size - AVATAR_RING_EXTRA}
      ring={enrolled ? 'student' : userId ? undefined : 'lead'}
    />
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="h3"
      variant="caption"
      sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary', textTransform: 'uppercase' }}
    >
      {children}
    </Typography>
  );
}

export function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
  tone?: 'primary' | 'error';
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, minWidth: 0 }}>
      <SectionLabel>{label}</SectionLabel>
      <Typography
        component="p"
        sx={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.3,
          fontVariantNumeric: 'tabular-nums',
          color: tone === 'error' ? 'error.main' : tone === 'primary' ? 'primary.main' : 'text.primary',
        }}
      >
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {note}
      </Typography>
    </Paper>
  );
}
