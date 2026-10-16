import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { tokens as t } from './tokens';

export interface CalloutProps {
  /** Optional bold first line (rendered as an h3 unless `titleAs` says otherwise). */
  title?: ReactNode;
  titleAs?: 'h3' | 'h4' | 'strong';
  /** note: gold rail (rules, cautions). success: green rail (confirmed facts). */
  tone?: 'note' | 'success';
  children?: ReactNode;
}

/**
 * A note in the article flow: a white box with a 3px coloured rail on the
 * left. Replaces the tinted yellow, blue and green "info" fills.
 */
export default function Callout({ title, titleAs = 'h3', tone = 'note', children }: CalloutProps) {
  return (
    <Box
      sx={{
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderLeft: 'none',
        borderRadius: `${t.radius}px`,
        boxShadow: `inset 3px 0 0 ${tone === 'success' ? t.success : t.gold500}`,
        px: { xs: 2.5, sm: 3 },
        py: 2.5,
        color: t.ink,
        fontSize: '1rem',
        lineHeight: 1.6,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {title && (
        <Typography component={titleAs} sx={{ m: 0, fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.4 }}>
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
}
