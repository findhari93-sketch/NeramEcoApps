import type { ReactNode } from 'react';
import Image from 'next/image';
import { Box, Typography } from '@neram/ui';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { initials } from './PersonCard';
import { tokens as t } from './tokens';

export interface ReviewCardProps {
  /** The review text. */
  quote: ReactNode;
  name: string;
  /** One muted line: city, exam and year, college. */
  meta?: ReactNode;
  /** Mono label at the top right ("NATA 2025"). */
  tag?: ReactNode;
  /** 1 to 5; omit to hide the stars. */
  rating?: number | null;
  photo?: string | null;
  /** Extra content under the caption (a "Watch the video review" link). */
  children?: ReactNode;
}

/**
 * A review as a figure (T8): stars and an exam tag, the quote, then the
 * person with a navy700 initials avatar. Sized for a CSS-columns masonry
 * (`ReviewWall`); `break-inside: avoid` keeps each card whole.
 */
export default function ReviewCard({ quote, name, meta, tag, rating, photo, children }: ReviewCardProps) {
  const stars = rating ? Math.max(1, Math.min(5, Math.round(rating))) : 0;
  return (
    <Box
      component="figure"
      sx={{
        breakInside: 'avoid',
        m: 0,
        mb: 2.5,
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
        p: 2.75,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
        color: t.ink,
      }}
    >
      {(stars > 0 || tag) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
          {stars > 0 ? (
            <Box role="img" aria-label={`${stars} out of 5 stars`} sx={{ display: 'flex', color: t.gold500, '& svg': { fontSize: 18 } }}>
              {Array.from({ length: stars }, (_, i) => (
                <StarRoundedIcon key={i} aria-hidden />
              ))}
            </Box>
          ) : (
            <span />
          )}
          {tag && (
            <Typography component="span" sx={{ fontFamily: t.fontMono, fontSize: '0.75rem', fontWeight: 700, color: t.inkMuted }}>
              {tag}
            </Typography>
          )}
        </Box>
      )}
      <Typography component="blockquote" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
        {quote}
      </Typography>
      <Box component="figcaption" sx={{ display: 'flex', gap: 1.5, alignItems: 'center', borderTop: `1px solid ${t.line}`, pt: 1.75 }}>
        <Box
          aria-hidden
          sx={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            overflow: 'hidden',
            position: 'relative',
            flexShrink: 0,
            bgcolor: t.navy700,
            color: t.paper,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
          }}
        >
          {photo ? <Image src={photo} alt="" fill sizes="44px" style={{ objectFit: 'cover' }} /> : initials(name)}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
          <Typography component="strong" sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>
            {name}
          </Typography>
          {meta && (
            <Typography component="span" sx={{ fontSize: '0.8125rem', color: t.inkMuted }}>
              {meta}
            </Typography>
          )}
        </Box>
      </Box>
      {children}
    </Box>
  );
}

/** CSS-columns masonry for ReviewCards: three columns from ~960px, one on phones. */
export function ReviewWall({ children }: { children: ReactNode }) {
  return <Box sx={{ columns: '3 300px', columnGap: '20px' }}>{children}</Box>;
}
