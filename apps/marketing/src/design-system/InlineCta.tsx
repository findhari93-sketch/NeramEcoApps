import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import DarkScope from './surface/DarkScope';
import { eyebrowSx, iconTileSx, surfaceVars, tokens as t } from './tokens';

export interface InlineCtaProps {
  eyebrow?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** Usually one primary CtaButton. */
  action?: ReactNode;
  /** Heading level (default h2). */
  titleAs?: 'h2' | 'h3';
}

/**
 * A navy box placed in the page or article flow (one per article). Copy on
 * the left, the action on the right; stacks on phones.
 */
export default function InlineCta({ eyebrow, icon, title, body, action, titleAs = 'h2' }: InlineCtaProps) {
  return (
    <Box
      component="aside"
      sx={{
        ...surfaceVars.dark,
        bgcolor: t.navy900,
        color: t.paper,
        borderRadius: `${t.radius}px`,
        p: { xs: 3, md: 4 },
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 3,
      }}
    >
      <DarkScope>
        <Box sx={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {icon && (
            <Box aria-hidden sx={{ ...iconTileSx, bgcolor: t.navy800, mb: 0.5 }}>
              {icon}
            </Box>
          )}
          {eyebrow && (
            <Typography component="p" sx={eyebrowSx}>
              {eyebrow}
            </Typography>
          )}
          <Typography component={titleAs} sx={{ m: 0, fontSize: 'clamp(1.25rem, 2.5vw, 1.625rem)', fontWeight: 800, lineHeight: 1.25, color: t.paper }}>
            {title}
          </Typography>
          {body && (
            <Typography component="p" sx={{ m: 0, maxWidth: 640, fontSize: '1rem', lineHeight: 1.6, color: t.paperMuted }}>
              {body}
            </Typography>
          )}
        </Box>
        {action && <Box sx={{ flex: '0 0 auto' }}>{action}</Box>}
      </DarkScope>
    </Box>
  );
}
