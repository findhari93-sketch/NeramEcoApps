/**
 * Server-rendered building blocks shared by the review, story and alumni pages.
 * No client state: MUI components render on the server, links are plain anchors.
 * Touch targets are 48px, focus rings come from the theme plus a visible outline.
 */

import Image from 'next/image';
import Link from 'next/link';
import { Avatar, Box, Button, Card, CardContent, Chip, Paper, Stack, Typography } from '@neram/ui';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import type { PublicReview } from '@/lib/reviews/json-ld';
import { examLabel, initials, isOptimizableImage } from '@/lib/reviews/rules';

/** Visible keyboard focus for every link and button on these pages. */
export const focusRing = {
  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
} as const;

export function Stars({ rating, label, size = 20 }: { rating: number; label: string; size?: number }) {
  // Nearest half star, so a 4.6 average shows 4.5 stars, not 5.
  const halves = Math.max(0, Math.min(10, Math.round(rating * 2)));
  return (
    <Box role="img" aria-label={label} sx={{ display: 'inline-flex', alignItems: 'center', color: 'warning.main' }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const Icon = halves >= i * 2 ? StarIcon : halves === i * 2 - 1 ? StarHalfIcon : StarBorderIcon;
        return <Icon key={i} aria-hidden="true" sx={{ fontSize: size }} />;
      })}
    </Box>
  );
}

export function PersonAvatar({ name, photo, size = 48 }: { name: string; photo: string | null; size?: number }) {
  if (isOptimizableImage(photo)) {
    return (
      <Box sx={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
        <Image src={photo} alt={name} fill sizes={`${size}px`} style={{ objectFit: 'cover' }} />
      </Box>
    );
  }
  return (
    <Avatar aria-hidden="true" sx={{ width: size, height: size, bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700, flexShrink: 0 }}>
      {initials(name)}
    </Avatar>
  );
}

export interface ReviewCardLabels {
  stars: (rating: number) => string;
  joined: (college: string) => string;
  featured: string;
}

export function ReviewCard({ review, labels, headingLevel = 'h3' }: { review: PublicReview; labels: ReviewCardLabels; headingLevel?: 'h3' | 'h4' }) {
  const meta = [examLabel(review.examType), review.year ? String(review.year) : '', review.city || ''].filter(Boolean).join(' · ');
  return (
    <Card component="article" variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5, flexGrow: 1, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <PersonAvatar name={review.displayName} photo={review.photo} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component={headingLevel} sx={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
              {review.displayName}
            </Typography>
            {meta && (
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {meta}
              </Typography>
            )}
          </Box>
        </Stack>

        {review.rating != null && <Stars rating={review.rating} label={labels.stars(review.rating)} />}

        <Typography
          component="blockquote"
          sx={{ m: 0, fontSize: '1rem', lineHeight: 1.6, color: 'text.primary', whiteSpace: 'pre-line', overflowWrap: 'anywhere', flexGrow: 1 }}
        >
          {review.body}
        </Typography>

        {(review.collegeAdmitted || review.isFeatured) && (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {review.collegeAdmitted && (
              <Chip
                size="small"
                variant="outlined"
                color="primary"
                label={labels.joined(review.collegeAdmitted)}
                sx={{ maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
              />
            )}
            {review.isFeatured && <Chip size="small" label={labels.featured} />}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions: Array<{ href: string; label: string; primary?: boolean }>;
}) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center', borderRadius: 3 }}>
      <VerifiedOutlinedIcon aria-hidden="true" sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
      <Typography component="h2" sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 520, mx: 'auto', lineHeight: 1.6 }}>
        {body}
      </Typography>
      <LinkButtons actions={actions} center />
    </Paper>
  );
}

export function LinkButtons({ actions, center = false }: { actions: Array<{ href: string; label: string; primary?: boolean }>; center?: boolean }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" justifyContent={center ? 'center' : 'flex-start'}>
      {actions.map((a) => (
        <Button
          key={a.href}
          component={Link}
          href={a.href}
          variant={a.primary ? 'contained' : 'outlined'}
          sx={{ minHeight: 48, px: 2.5, textTransform: 'none', fontWeight: 600, ...focusRing }}
        >
          {a.label}
        </Button>
      ))}
    </Stack>
  );
}
