import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { iconTileSx, tokens as t } from './tokens';

export interface InfoCardProps {
  title: ReactNode;
  body?: ReactNode;
  /** Short mono code in the navy tile ("A1", "01", "B2"). Use this or `icon`. */
  code?: ReactNode;
  /** An *Outlined icon in the navy tile. */
  icon?: ReactNode;
  /** Mono gold800 text at the right of the title ("30 marks", "Free"). */
  meta?: ReactNode;
  titleAs?: 'h3' | 'h4' | 'strong';
  children?: ReactNode;
}

/**
 * A white row card for article content (T2): navy tile with a code or icon,
 * title with an optional mono meta on the right, muted body. Stack several
 * with a 12px gap for syllabus parts, steps or documents.
 */
export default function InfoCard({ title, body, code, icon, meta, titleAs = 'h3', children }: InfoCardProps) {
  const tile = code ?? icon;
  return (
    <Box
      sx={{
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
        px: { xs: 2.5, sm: 3 },
        py: 2.5,
        display: 'grid',
        gridTemplateColumns: tile ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
        columnGap: 2,
        rowGap: 0.5,
        color: t.ink,
      }}
    >
      {tile && (
        <Box
          aria-hidden={!code}
          sx={{ ...iconTileSx, gridRow: 'span 3', alignSelf: 'start', fontFamily: t.fontMono, fontWeight: 700, fontSize: '0.9375rem' }}
        >
          {tile}
        </Box>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography component={titleAs} sx={{ m: 0, fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.35 }}>
          {title}
        </Typography>
        {meta && (
          <Typography component="span" sx={{ fontFamily: t.fontMono, fontSize: '0.875rem', fontWeight: 700, color: t.gold800, whiteSpace: 'nowrap' }}>
            {meta}
          </Typography>
        )}
      </Box>
      {body && (
        <Typography component="p" sx={{ m: 0, fontSize: '0.9375rem', lineHeight: 1.6, color: t.inkMuted }}>
          {body}
        </Typography>
      )}
      {children && <Box sx={{ fontSize: '0.9375rem', lineHeight: 1.6, color: t.inkMuted }}>{children}</Box>}
    </Box>
  );
}
