'use client';

import { Box } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import { Link } from '@/i18n/routing';
import type { AppStatusSummary } from '@/hooks/useApplicationStatus';

type Tone = 'join' | 'success' | 'progress';

/** The primary half's colour for each application status. */
export function ctaTone(status: AppStatusSummary): Tone {
  switch (status) {
    case 'enrolled':
    case 'partial_payment':
    case 'approved':
      return 'success';
    case 'draft':
    case 'submitted':
    case 'under_review':
    case 'pending_verification':
      return 'progress';
    default:
      return 'join';
  }
}

const toneSx: Record<Tone, object> = {
  join: { bgcolor: 'secondary.main', color: 'secondary.contrastText', '&:hover': { bgcolor: 'secondary.dark' } },
  success: { bgcolor: '#2E7D32', color: '#fff', '&:hover': { bgcolor: '#1B5E20' } },
  progress: { bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } },
};

const halfSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.75,
  height: { xs: 40, md: 44 },
  px: { xs: 1.75, md: 2.25 },
  border: 0,
  font: 'inherit',
  fontSize: { xs: 13.5, md: 14 },
  fontWeight: 700,
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'background-color 0.15s',
  // The pill clips outside outlines, so the focus ring sits inside each half.
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.dark', outlineOffset: -4, borderRadius: 22 },
} as const;

interface Props {
  /** Left half: the free demo (or the booked one); null hides it. */
  demo: { href: string; label: string } | null;
  /** Right half: the application CTA. Without an href it is a button (Go to App). */
  primary: { label: string; href: string | null; onClick?: () => void };
  status: AppStatusSummary;
}

/**
 * Free demo and Join now as one split pill: two links sharing one shape, so the
 * header carries one control where it had two. The demo half needs 1100px and up;
 * phones get it in the drawer.
 */
export default function HeaderCtaPill({ demo, primary, status }: Props) {
  const tone = toneSx[ctaTone(status)];
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'stretch',
        flexShrink: 0,
        mr: 1,
        borderRadius: 22,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: (t: Theme) => alpha(t.palette.primary.main, 0.35),
        bgcolor: 'background.paper',
        ...(status === 'approved' && {
          animation: 'ctaPulse 2s ease-in-out infinite',
          '@keyframes ctaPulse': {
            '0%, 100%': { boxShadow: '0 0 0 0 rgba(46,125,50,0.4)' },
            '50%': { boxShadow: '0 0 0 8px rgba(46,125,50,0)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }),
      }}
    >
      {demo && (
        <Box
          component={Link}
          href={demo.href}
          sx={{
            ...halfSx,
            display: 'none',
            '@media (min-width: 1100px)': { display: 'inline-flex' },
            pl: 2,
            pr: 1.75,
            color: 'primary.dark',
            bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.06),
            '&:hover': { bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.12) },
          }}
        >
          <VideocamOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
          {demo.label}
        </Box>
      )}
      {primary.href ? (
        <Box component={Link} href={primary.href} sx={{ ...halfSx, ...tone }}>
          {primary.label}
        </Box>
      ) : (
        <Box component="button" type="button" onClick={primary.onClick} sx={{ ...halfSx, ...tone }}>
          {primary.label}
        </Box>
      )}
    </Box>
  );
}
