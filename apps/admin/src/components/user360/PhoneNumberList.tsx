'use client';

import { Box, IconButton, Tooltip, Typography } from '@neram/ui';
import VerifiedIcon from '@mui/icons-material/Verified';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import type { PhoneAttempt } from '@neram/database';
import CopyablePhone from '@/components/CopyablePhone';
import { attemptPlace, attemptStatus, formatAttemptPhone, phoneDigits, type AttemptTone } from '@/lib/phone-attempts-view';
import { relativeTime } from '@/lib/user360-view';
import { EmptyNote } from './shared';

const TONE: Record<AttemptTone, { Icon: typeof VerifiedIcon; color: string; text: string }> = {
  success: { Icon: VerifiedIcon, color: 'success.main', text: 'success.dark' },
  warning: { Icon: ScheduleIcon, color: 'warning.dark', text: 'text.primary' },
  error: { Icon: ErrorOutlineIcon, color: 'error.main', text: 'error.dark' },
  neutral: { Icon: EditNoteOutlinedIcon, color: 'text.secondary', text: 'text.secondary' },
};

const iconButtonSx = { width: 44, height: 44 } as const;

/**
 * Every number someone typed into a phone-OTP dialog (phone_attempts): the
 * verified one ticked, the others with how far they got, so staff can call a
 * student whose OTP never arrived. Status is an icon AND words, never colour
 * alone.
 */
export default function PhoneNumberList({
  numbers,
  emptyText = 'No number typed into a phone sign-in yet.',
}: {
  numbers: PhoneAttempt[];
  emptyText?: string;
}) {
  if (!numbers.length) return <EmptyNote>{emptyText}</EmptyNote>;

  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
      {numbers.map((n) => {
        const status = attemptStatus(n);
        const tone = TONE[status.tone];
        const digits = phoneDigits(n.phone);
        const pretty = formatAttemptPhone(n.phone);
        const last = relativeTime(n.last_attempt_at);
        return (
          <Box
            component="li"
            key={n.id}
            sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, minWidth: 0 }}
          >
            <tone.Icon sx={{ fontSize: 20, color: tone.color, mt: 0.25, flexShrink: 0 }} aria-hidden />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <CopyablePhone phone={pretty} mono variant="body2" textSx={{ fontWeight: 600 }} />
              <Typography variant="body2" sx={{ color: tone.text, fontWeight: status.tone === 'success' ? 600 : 400 }}>
                {status.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="p">
                {attemptPlace(n.source, n.source_app)}
                {` · ${n.attempts} ${n.attempts === 1 ? 'try' : 'tries'}`}
                {last ? ` · last ${last}` : ''}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexShrink: 0 }}>
              <Tooltip title={`Call ${pretty}`}>
                <IconButton component="a" href={`tel:+${digits}`} aria-label={`Call ${pretty}`} sx={iconButtonSx}>
                  <PhoneOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={`WhatsApp ${pretty}`}>
                <IconButton
                  component="a"
                  href={`https://wa.me/${digits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`WhatsApp ${pretty}`}
                  sx={{ ...iconButtonSx, color: 'success.dark' }}
                >
                  <WhatsAppIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
