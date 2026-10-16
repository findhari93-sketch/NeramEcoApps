import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { tokens as t } from '@/design-system';

/**
 * Small server-safe building blocks for T2 guide articles (exam spokes,
 * counselling concepts) that the design system does not ship as components.
 */

/** A body paragraph in the article column (17px, 1.7), or muted 16px for notes and captions. */
export function GuideP({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <Typography
      component="p"
      sx={{
        m: 0,
        fontSize: muted ? '1rem' : '1.0625rem',
        lineHeight: muted ? 1.6 : 1.7,
        color: muted ? t.inkMuted : t.ink,
      }}
    >
      {children}
    </Typography>
  );
}

/**
 * A warning or side note: white box, 1px line, a 3px gold inset rail on the
 * left, radius 8. No tinted fills.
 */
export function GuideNote({
  title,
  titleAs = 'h3',
  children,
}: {
  title?: ReactNode;
  titleAs?: 'h2' | 'h3' | 'strong';
  children?: ReactNode;
}) {
  return (
    <Box
      sx={{
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderLeft: 'none',
        borderRadius: `${t.radius}px`,
        boxShadow: `inset 3px 0 0 ${t.gold500}`,
        px: { xs: 2.5, sm: 3 },
        py: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        color: t.ink,
      }}
    >
      {title && (
        <Typography component={titleAs} sx={{ m: 0, fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.35 }}>
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
}

/** A plain bulleted or numbered list in body text (for prose lists that are not ticks or steps). */
export function GuideList({ items, ordered = false }: { items: ReactNode[]; ordered?: boolean }) {
  return (
    <Box
      component={ordered ? 'ol' : 'ul'}
      sx={{
        m: 0,
        pl: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        fontSize: '1.0625rem',
        lineHeight: 1.7,
        color: t.ink,
        '& li::marker': { color: t.gold800, fontWeight: 700 },
      }}
    >
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Box>
  );
}

/** A grid wrapper that lays cards out with auto-fit (one column on phones). */
export function GuideGrid({ min = 260, children }: { min?: number; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 1.5 }}>
      {children}
    </Box>
  );
}

/** Stacks cards with the article's 12px card gap. */
export function GuideStack({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>{children}</Box>;
}

/** Small outlined pills (skills, tags): token border, radius 100, no fill. */
export function GuidePills({ items, label }: { items: readonly string[]; label?: string }) {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 1 }}
    >
      {items.map((item) => (
        <Box
          component="li"
          key={item}
          sx={{
            px: 1.5,
            py: 0.5,
            border: `1px solid ${t.line}`,
            borderRadius: `${t.radiusPill}px`,
            bgcolor: t.surface,
            fontSize: '0.875rem',
            fontWeight: 600,
            lineHeight: 1.5,
            color: t.ink,
          }}
        >
          {item}
        </Box>
      ))}
    </Box>
  );
}
