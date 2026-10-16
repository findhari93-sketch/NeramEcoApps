import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import CheckList from './CheckList';
import { tokens as t, v } from './tokens';

export interface FeeCardProps {
  /** Plan name (plan grids). Omit in a course detail aside. */
  title?: ReactNode;
  /** Small label above the price, e.g. "Course fee". */
  label?: ReactNode;
  /** e.g. "₹25,000". */
  price: ReactNode;
  /** Under the price: a payment note or a "See payment options" link. */
  priceNote?: ReactNode;
  /** Ruled facts: batch size, timing, start date, mode. */
  facts?: Array<{ label: ReactNode; value: ReactNode }>;
  features?: ReactNode[];
  /** Usually a full-width primary CtaButton and an outline one. */
  actions?: ReactNode;
  footnote?: ReactNode;
  /** 3px gold top border (always on in a course aside; the popular plan in a grid). */
  highlight?: boolean;
  /** Navy pill top-right, e.g. "Most Popular". */
  badge?: ReactNode;
  /** Stick below the header in a T1 aside. */
  sticky?: boolean;
  component?: 'aside' | 'article' | 'div';
}

/** The fee card: the T1 course aside, and the plan cards on Premium and Fees. */
export default function FeeCard({
  title,
  label,
  price,
  priceNote,
  facts,
  features,
  actions,
  footnote,
  highlight = true,
  badge,
  sticky = false,
  component = 'div',
}: FeeCardProps) {
  return (
    <Box
      component={component}
      sx={{
        bgcolor: t.surface,
        color: t.ink,
        border: `1px solid ${t.line}`,
        borderTop: highlight ? `3px solid ${t.gold500}` : `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2.25,
        minWidth: 0,
        height: sticky ? 'auto' : '100%',
        boxSizing: 'border-box',
        ...(sticky && { position: { md: 'sticky' }, top: { md: 88 } }),
      }}
    >
      {(title || badge) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
          {title && (
            <Typography component="h3" sx={{ m: 0, fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.25 }}>
              {title}
            </Typography>
          )}
          {badge && (
            <Box
              component="span"
              sx={{
                bgcolor: t.navy900,
                color: t.gold500,
                fontSize: '0.75rem',
                fontWeight: 700,
                px: 1.25,
                py: 0.625,
                borderRadius: `${t.radiusPill}px`,
                flexShrink: 0,
              }}
            >
              {badge}
            </Box>
          )}
        </Box>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {label && (
          <Typography component="span" sx={{ fontSize: '0.8125rem', color: t.inkMuted }}>
            {label}
          </Typography>
        )}
        <Typography component="span" sx={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1 }}>
          {price}
        </Typography>
        {priceNote && <Box sx={{ fontSize: '0.875rem', color: t.inkMuted }}>{priceNote}</Box>}
      </Box>
      {facts && facts.length > 0 && (
        <Box
          component="dl"
          sx={{
            m: 0,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '10px 16px',
            fontSize: '0.9375rem',
            borderTop: `1px solid ${t.line}`,
            pt: 2,
          }}
        >
          {facts.map((f, i) => (
            <Box key={i} sx={{ display: 'contents' }}>
              <Box component="dt" sx={{ color: t.inkMuted }}>
                {f.label}
              </Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 600 }}>
                {f.value}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {features && features.length > 0 && (
        <Box sx={{ borderTop: `1px solid ${t.line}`, pt: 2 }}>
          <CheckList variant="compact" items={features} />
        </Box>
      )}
      {actions && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mt: sticky ? 0 : 'auto' }}>{actions}</Box>}
      {footnote && <Box sx={{ fontSize: '0.8125rem', color: v.muted }}>{footnote}</Box>}
    </Box>
  );
}
