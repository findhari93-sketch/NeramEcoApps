import type { ReactNode } from 'react';
import Image from 'next/image';
import { Box, Typography } from '@neram/ui';
import CtaButton from './CtaButton';
import { tokens as t, v } from './tokens';

export interface CourseCardProps {
  title: ReactNode;
  description?: ReactNode;
  image?: string;
  imageAlt?: string;
  /** Pill on the image, e.g. "All Levels". */
  badge?: ReactNode;
  meta?: { label: ReactNode; value: ReactNode };
  cta: { label: ReactNode; href: string };
}

/** Course card with a 180px image (Home "Featured Courses", Courses list). */
export default function CourseCard({ title, description, image, imageAlt = '', badge, meta, cta }: CourseCardProps) {
  return (
    <Box
      component="article"
      sx={{
        bgcolor: v.card,
        border: `1px solid ${v.line}`,
        borderRadius: `${t.radius}px`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: v.fg,
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: t.gold500 },
      }}
    >
      {/* Without an image the tile is the navy blueprint, not a broken image. */}
      <Box sx={{ position: 'relative', height: 180, bgcolor: t.navy800, flexShrink: 0, ...(!image && t.blueprint) }}>
        {image && (
          <Image
            src={image}
            alt={imageAlt}
            fill
            sizes="(max-width: 600px) 100vw, 400px"
            style={{ objectFit: 'cover' }}
            // next/image does not optimise SVGs; serve them as they are.
            unoptimized={image.endsWith('.svg')}
          />
        )}
        {badge && (
          <Box
            component="span"
            sx={{
              position: 'absolute',
              top: 12,
              right: 12,
              bgcolor: t.navy900,
              color: t.gold500,
              fontSize: '0.75rem',
              fontWeight: 600,
              px: 1.25,
              py: 0.5,
              borderRadius: `${t.radiusPill}px`,
            }}
          >
            {badge}
          </Box>
        )}
      </Box>
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
        <Typography variant="h3" component="h3" sx={{ m: 0, fontSize: '1.25rem' }}>
          {title}
        </Typography>
        {description && (
          <Typography component="p" sx={{ m: 0, fontSize: '0.9375rem', lineHeight: 1.55, color: v.muted }}>
            {description}
          </Typography>
        )}
        {meta && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mt: 'auto' }}>
            <Typography component="span" sx={{ fontSize: '0.75rem', color: v.muted }}>
              {meta.label}
            </Typography>
            <Typography component="strong" sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>
              {meta.value}
            </Typography>
          </Box>
        )}
        <CtaButton variant="outline" size="md" fullWidth href={cta.href} sx={meta ? undefined : { mt: 'auto' }}>
          {cta.label}
        </CtaButton>
      </Box>
    </Box>
  );
}
