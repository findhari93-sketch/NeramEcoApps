import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import HourglassTopOutlinedIcon from '@mui/icons-material/HourglassTopOutlined';
import HistoryToggleOffOutlinedIcon from '@mui/icons-material/HistoryToggleOffOutlined';
import { tokens as t } from './tokens';

export type BannerStatus = 'live' | 'tbd' | 'coming-soon';

// rail: the 3px left edge; text: icon and pill (readable on white, so amber text is gold800).
const STATUS: Record<BannerStatus, { rail: string; text: string; tag: string; Icon: typeof EventAvailableOutlinedIcon }> = {
  live: { rail: t.success, text: t.success, tag: 'Live', Icon: EventAvailableOutlinedIcon },
  tbd: { rail: t.gold500, text: t.gold800, tag: 'Schedule TBD', Icon: HourglassTopOutlinedIcon },
  'coming-soon': { rail: t.statusIdle, text: t.inkMuted, tag: 'Coming soon', Icon: HistoryToggleOffOutlinedIcon },
};

export interface StatusBannerProps {
  status: BannerStatus;
  /** Bold first line, e.g. "Registration is open". */
  label: ReactNode;
  /** Muted line under it: dates, the source it was checked against. */
  detail?: ReactNode;
  /** Override the pill text (defaults: Live, Schedule TBD, Coming soon). */
  tag?: ReactNode;
  /** A footnote under a hairline (cycle notes). */
  note?: ReactNode;
}

/**
 * White card with a 3px status rail on the left (green live, amber TBD, grey
 * coming soon). Replaces the tinted fills of the old counselling banner.
 */
export default function StatusBanner({ status, label, detail, tag, note }: StatusBannerProps) {
  const s = STATUS[status];
  return (
    <Box
      role="status"
      sx={{
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderLeft: 'none',
        borderRadius: `${t.radius}px`,
        boxShadow: `inset 3px 0 0 ${s.rail}`,
        px: 2.5,
        py: 2.25,
        display: 'flex',
        gap: 1.75,
        alignItems: 'flex-start',
        color: t.ink,
      }}
    >
      <s.Icon aria-hidden sx={{ color: s.text, fontSize: 26, flexShrink: 0 }} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography component="strong" sx={{ fontSize: '1rem', fontWeight: 700 }}>
            {label}
          </Typography>
          <Box
            component="span"
            sx={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: s.text,
              border: `1px solid ${s.text}`,
              borderRadius: `${t.radiusPill}px`,
              px: 1,
              py: '2px',
              lineHeight: 1.4,
            }}
          >
            {tag ?? s.tag}
          </Box>
        </Box>
        {detail && (
          <Typography component="span" sx={{ fontSize: '0.875rem', lineHeight: 1.5, color: t.inkMuted }}>
            {detail}
          </Typography>
        )}
        {note && (
          <Typography
            component="span"
            sx={{ mt: 1, pt: 1, borderTop: `1px solid ${t.line}`, fontSize: '0.8125rem', lineHeight: 1.5, color: t.inkMuted }}
          >
            {note}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
