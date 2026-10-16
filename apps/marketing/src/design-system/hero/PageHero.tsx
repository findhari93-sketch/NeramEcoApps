import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import Surface from '../surface/Surface';
import Breadcrumb, { type BreadcrumbItem } from '../Breadcrumb';
import StatStrip, { type StatItem } from '../StatStrip';
import { eyebrowSx, tokens as t } from '../tokens';

export interface PageHeroProps {
  breadcrumb?: BreadcrumbItem[];
  eyebrow?: ReactNode;
  /** The page's only h1. Wrap a phrase in <em> for the gold accent. */
  title: ReactNode;
  lede?: ReactNode;
  /** Gold-tint pills above the title (e.g. "NEW"). */
  pills?: ReactNode[];
  /** Usually a primary CtaButton and an outline CtaButton. */
  actions?: ReactNode;
  /** Stats in a full-width band under the hero copy. */
  stats?: StatItem[];
  /** Right column (booking card, quick check, facts). Two columns when set. */
  aside?: ReactNode;
  /** Minimum column width when there is an aside (420 or 440). */
  asideMin?: number;
  blueprint?: boolean;
  /** Extra content under the copy column (e.g. a search input). */
  children?: ReactNode;
  /** Content flush with the hero's bottom edge (T3 category tabs). */
  bottom?: ReactNode;
}

/**
 * The dark page opener: optional breadcrumb, mono eyebrow, h1, lede, actions,
 * then a stat band. With an aside it becomes two auto-fit columns that stack
 * on phones. Every page opens with this or a light DocHeader.
 */
export default function PageHero({
  breadcrumb,
  eyebrow,
  title,
  lede,
  pills,
  actions,
  stats,
  aside,
  asideMin = 420,
  blueprint = true,
  children,
  bottom,
}: PageHeroProps) {
  const copy = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {breadcrumb && <Breadcrumb items={breadcrumb} />}
      {pills && pills.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {pills.map((pill, i) => (
            <Box
              key={i}
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                bgcolor: t.goldTintBg,
                border: `1px solid ${t.goldTintBorder}`,
                borderRadius: `${t.radiusPill}px`,
                px: 1.75,
                py: 0.625,
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: t.gold300,
              }}
            >
              {pill}
            </Box>
          ))}
        </Box>
      )}
      {eyebrow && (
        <Typography component="p" sx={eyebrowSx}>
          {eyebrow}
        </Typography>
      )}
      <Typography
        variant="h1"
        component="h1"
        sx={{ m: 0, maxWidth: 780, color: t.paper, '& em': { fontStyle: 'normal', color: t.gold500 } }}
      >
        {title}
      </Typography>
      {lede && (
        <Typography variant="lede" sx={{ m: 0, maxWidth: 600, color: t.paperMuted, textWrap: 'pretty' }}>
          {lede}
        </Typography>
      )}
      {children}
      {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mt: 1 }}>{actions}</Box>}
    </Box>
  );

  return (
    <Surface tone="dark" blueprint={blueprint} component="header">
      <Box sx={{ maxWidth: t.container.page, mx: 'auto', px: { xs: 2, sm: 3 }, pt: { xs: 6, md: 9 }, pb: { xs: 6, md: 7 }, boxSizing: 'content-box' }}>
        {aside ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${asideMin}px), 1fr))`,
              gap: { xs: 4, md: 5 },
              alignItems: 'center',
            }}
          >
            {copy}
            <Box sx={{ minWidth: 0 }}>{aside}</Box>
          </Box>
        ) : (
          copy
        )}
        {stats && stats.length > 0 && (
          <Box sx={{ mt: { xs: 5, md: 7 } }}>
            <StatStrip items={stats} />
          </Box>
        )}
      </Box>
      {bottom}
    </Surface>
  );
}
