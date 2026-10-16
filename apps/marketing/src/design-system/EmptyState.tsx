import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { iconTileSx, tokens as t, v } from './tokens';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** Usually one CtaButton. */
  action?: ReactNode;
  /** Heading level for the title (default h2). */
  titleAs?: 'h2' | 'h3';
}

/** A centred card for empty, signed-out and "not yet" states. */
export default function EmptyState({ icon, title, body, action, titleAs = 'h2' }: EmptyStateProps) {
  return (
    <Box
      sx={{
        bgcolor: v.card,
        border: `1px solid ${v.line}`,
        borderRadius: `${t.radius}px`,
        px: { xs: 2.5, sm: 4 },
        py: { xs: 4, sm: 6 },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 1.5,
        color: v.fg,
      }}
    >
      {icon && (
        <Box aria-hidden sx={{ ...iconTileSx, mb: 0.5 }}>
          {icon}
        </Box>
      )}
      <Typography component={titleAs} sx={{ m: 0, fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.3 }}>
        {title}
      </Typography>
      {body && (
        <Typography component="p" sx={{ m: 0, maxWidth: 440, color: v.muted, lineHeight: 1.55 }}>
          {body}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Box>
  );
}
