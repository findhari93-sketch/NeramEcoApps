import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import CtaButton from './CtaButton';
import { tokens as t, v } from './tokens';

export interface ProgramCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  /** Small pills: duration, Online, Offline. */
  chips?: ReactNode[];
  features?: ReactNode[];
  featuresTitle?: ReactNode;
  cta?: { label: ReactNode; href: string; external?: boolean };
  /** 3px gold top border and a navy "Most Popular" pill. */
  highlight?: boolean;
  highlightLabel?: ReactNode;
}

/** A coaching programme card (Coaching overview, Courses). White on ground. */
export default function ProgramCard({
  title,
  subtitle,
  description,
  chips,
  features,
  featuresTitle = "What you'll learn",
  cta,
  highlight = false,
  highlightLabel = 'Most Popular',
}: ProgramCardProps) {
  return (
    <Box
      component="article"
      sx={{
        bgcolor: v.card,
        border: `1px solid ${v.line}`,
        borderTop: highlight ? `3px solid ${t.gold500}` : `1px solid ${v.line}`,
        borderRadius: `${t.radius}px`,
        p: { xs: 2.5, sm: 3.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100%',
        boxSizing: 'border-box',
        color: v.fg,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
          <Typography variant="h3" component="h3" sx={{ m: 0, fontSize: '1.375rem' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography component="p" sx={{ m: 0, fontSize: '0.9375rem', fontWeight: 600, color: v.eyebrow }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {highlight && (
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
            {highlightLabel}
          </Box>
        )}
      </Box>
      {description && (
        <Typography component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.55, color: v.muted }}>
          {description}
        </Typography>
      )}
      {chips && chips.length > 0 && (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {chips.map((chip, i) => (
            <Box
              component="li"
              key={i}
              sx={{
                border: `1px solid ${v.line}`,
                borderRadius: `${t.radiusPill}px`,
                px: 1.5,
                py: 0.5,
                fontSize: '0.8125rem',
                fontWeight: 500,
              }}
            >
              {chip}
            </Box>
          ))}
        </Box>
      )}
      {features && features.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography component="p" sx={{ m: 0, fontSize: '0.875rem', fontWeight: 700 }}>
            {featuresTitle}
          </Typography>
          <Box
            component="ul"
            sx={{
              m: 0,
              p: 0,
              listStyle: 'none',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '8px 16px',
            }}
          >
            {features.map((f, i) => (
              <Box
                component="li"
                key={i}
                sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', fontSize: '0.9375rem', lineHeight: 1.4 }}
              >
                <CheckIcon aria-hidden sx={{ fontSize: 18, color: v.eyebrow, mt: '1px' }} />
                {f}
              </Box>
            ))}
          </Box>
        </Box>
      )}
      {cta && (
        <CtaButton variant="outline" size="md" fullWidth href={cta.href} external={cta.external} sx={{ mt: 'auto' }}>
          {cta.label}
        </CtaButton>
      )}
    </Box>
  );
}
