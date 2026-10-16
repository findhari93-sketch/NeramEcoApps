'use client';

import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { Link } from '@/i18n/routing';
import { tokens as t, eyebrowSx, iconTileSx, v } from './tokens';

export interface FeatureCardProps {
  /** An @mui/icons-material *Outlined icon element. Never an emoji. */
  icon: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** Makes the whole card a link (ToolCard). */
  href?: string;
  external?: boolean;
  /** Heading level for the title (default h3). */
  titleAs?: 'h2' | 'h3' | 'h4';
  /** Small mono label above the title, e.g. "Step 1". */
  kicker?: ReactNode;
}

/**
 * Icon tile + title + body. Sits on a white band with the ground colour as
 * its fill (and vice versa), 1px line border, 28px padding. With an href it
 * is a ToolCard: the whole card links and the border turns gold on hover.
 */
export default function FeatureCard({ icon, title, body, href, external, titleAs = 'h3', kicker }: FeatureCardProps) {
  const linkProps = href
    ? external
      ? { component: 'a' as const, href, target: '_blank', rel: 'noopener noreferrer' }
      : { component: Link, href }
    : { component: 'div' as const };

  return (
    <Box
      {...linkProps}
      sx={{
        bgcolor: v.cardAlt,
        border: `1px solid ${v.line}`,
        borderRadius: `${t.radius}px`,
        p: { xs: 2.5, sm: 3.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        color: v.fg,
        textDecoration: 'none',
        height: '100%',
        boxSizing: 'border-box',
        ...(href && {
          cursor: 'pointer',
          transition: 'border-color 150ms ease',
          '&:hover': { borderColor: t.gold500 },
          '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
        }),
      }}
    >
      <Box aria-hidden sx={iconTileSx}>
        {icon}
      </Box>
      {kicker && (
        <Typography component="span" sx={{ ...eyebrowSx, mb: -0.75 }}>
          {kicker}
        </Typography>
      )}
      <Typography component={titleAs} sx={{ m: 0, fontSize: '1.1875rem', fontWeight: 700, lineHeight: 1.3 }}>
        {title}
      </Typography>
      {body && (
        <Typography component="p" sx={{ m: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: v.muted }}>
          {body}
        </Typography>
      )}
    </Box>
  );
}

/** A FeatureCard that links somewhere (free tools, related tools). */
export function ToolCard(props: FeatureCardProps & { href: string }) {
  return <FeatureCard {...props} />;
}
