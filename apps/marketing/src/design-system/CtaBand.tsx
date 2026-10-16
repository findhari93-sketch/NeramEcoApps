import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import Surface from './surface/Surface';
import { eyebrowSx, tokens as t } from './tokens';

export interface CtaBandProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Usually a primary CtaButton and a link CtaButton. */
  actions?: ReactNode;
  id?: string;
}

/** The dark closing band on every page, just above the footer. */
export default function CtaBand({ eyebrow = 'Get started', title, lede, actions, id = 'cta' }: CtaBandProps) {
  return (
    <Surface tone="dark" rule id={id} aria-labelledby={`${id}-title`}>
      <Box
        sx={{
          maxWidth: 760,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          py: { xs: 10, md: 12 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 2,
        }}
      >
        {eyebrow && (
          <Typography component="p" sx={eyebrowSx}>
            {eyebrow}
          </Typography>
        )}
        <Typography id={`${id}-title`} variant="h2" component="h2" sx={{ m: 0, color: t.paper }}>
          {title}
        </Typography>
        {lede && (
          <Typography component="p" sx={{ m: 0, maxWidth: 520, fontSize: '1.125rem', lineHeight: 1.5, color: t.paperMuted }}>
            {lede}
          </Typography>
        )}
        {actions && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', mt: 2 }}>{actions}</Box>
        )}
      </Box>
    </Surface>
  );
}
