'use client';

import HourglassTopOutlinedIcon from '@mui/icons-material/HourglassTopOutlined';
import PublicIcon from '@mui/icons-material/Public';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';
import BlockIcon from '@mui/icons-material/Block';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import FamilyRestroomOutlinedIcon from '@mui/icons-material/FamilyRestroomOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import DoNotDisturbOnOutlinedIcon from '@mui/icons-material/DoNotDisturbOnOutlined';
import GppMaybeOutlinedIcon from '@mui/icons-material/GppMaybeOutlined';
import type { TimelineTone } from '@/lib/user360-view';
import type { ConsentSummary } from '@/lib/testimonial-moderation';

export function PublicationStatusIcon({ status, unconfirmed }: { status: string; unconfirmed?: boolean }) {
  if (unconfirmed) return <GppMaybeOutlinedIcon />;
  switch (status) {
    case 'pending_moderation':
      return <HourglassTopOutlinedIcon />;
    case 'published':
      return <PublicIcon />;
    case 'approved':
      return <ThumbUpAltOutlinedIcon />;
    case 'rejected':
      return <BlockIcon />;
    case 'withdrawn':
      return <VisibilityOffOutlinedIcon />;
    default:
      return <LockOutlinedIcon />;
  }
}

export function publicationTone(status: string, unconfirmed?: boolean): TimelineTone {
  if (unconfirmed) return 'warning';
  switch (status) {
    case 'pending_moderation':
      return 'warning';
    case 'published':
      return 'success';
    case 'approved':
      return 'info';
    case 'rejected':
      return 'error';
    default:
      return 'neutral';
  }
}

export function ConsentIcon({ state }: { state: ConsentSummary['state'] }) {
  const sx = { fontSize: 18, mt: '1px' };
  switch (state) {
    case 'self':
      return <HowToRegOutlinedIcon sx={{ ...sx, color: 'success.main' }} aria-hidden />;
    case 'guardian':
      return <FamilyRestroomOutlinedIcon sx={{ ...sx, color: 'success.main' }} aria-hidden />;
    case 'staff_recorded':
      return <BadgeOutlinedIcon sx={{ ...sx, color: 'text.secondary' }} aria-hidden />;
    default:
      return <DoNotDisturbOnOutlinedIcon sx={{ ...sx, color: 'error.main' }} aria-hidden />;
  }
}
