/**
 * The top of the /reviews body: the facts sentence answer engines can quote, and
 * Google's own rating for each centre.
 *
 * Replaces the old "Rating summary", which averaged the published reviews. Staff
 * now choose what is published, so that average would be self-serving; Google's
 * rating is not ours to curate, and it is what parents check anyway.
 * Server component, no client state, design-system tokens only.
 */

import { Box, Typography } from '@neram/ui';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import StarHalfRoundedIcon from '@mui/icons-material/StarHalfRounded';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import { eyebrowSx, tokens as t } from '@/design-system';
import type { CentreGoogleRating } from '@/lib/reviews/hub';

export interface ReviewHubPanelLabels {
  factsTitle: string;
  reviewCount: string;
  googleTitle: string;
  googleIntro: string;
  googleRating: (rating: string) => string;
  googleReviews: (count: number) => string;
  googleOpen: string;
}

function GoogleStars({ rating, label }: { rating: number; label: string }) {
  // Nearest half star, so a 4.6 shows 4.5 stars, not 5.
  const halves = Math.max(0, Math.min(10, Math.round(rating * 2)));
  return (
    <Box role="img" aria-label={label} sx={{ display: 'inline-flex', alignItems: 'center', color: t.gold500, '& svg': { fontSize: 18 } }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const Icon = halves >= i * 2 ? StarRoundedIcon : halves === i * 2 - 1 ? StarHalfRoundedIcon : StarOutlineRoundedIcon;
        return <Icon key={i} aria-hidden />;
      })}
    </Box>
  );
}

export default function ReviewHubPanel({
  sentence,
  google,
  labels,
}: {
  sentence: string | null;
  google: CentreGoogleRating[];
  labels: ReviewHubPanelLabels;
}) {
  if (!sentence && google.length === 0) return null;
  return (
    <Box
      component="section"
      aria-labelledby="hub-facts-title"
      sx={{
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
        p: { xs: 2.5, sm: 3.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
        color: t.ink,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Typography id="hub-facts-title" component="h2" sx={eyebrowSx}>
          {labels.factsTitle}
        </Typography>
        {sentence && (
          <Typography data-testid="review-facts" component="p" sx={{ m: 0, fontSize: '1.0625rem', lineHeight: 1.6, maxWidth: '68ch' }}>
            {sentence}
          </Typography>
        )}
        <Typography component="p" sx={{ m: 0, fontSize: '0.875rem', fontWeight: 600, color: t.inkMuted }}>
          {labels.reviewCount}
        </Typography>
      </Box>

      {google.length > 0 && (
        <Box sx={{ borderTop: `1px solid ${t.line}`, pt: 2.5 }}>
          <Typography component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 700 }}>
            {labels.googleTitle}
          </Typography>
          <Typography component="p" sx={{ m: 0, mt: 0.5, mb: 2, fontSize: '0.9375rem', lineHeight: 1.5, color: t.inkMuted }}>
            {labels.googleIntro}
          </Typography>
          <Box
            component="ul"
            sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 1.5 }}
          >
            {google.map((g) => (
              <Box
                component="li"
                key={`${g.name}-${g.city}`}
                sx={{ p: 2, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, bgcolor: t.ground, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}
              >
                <Typography component="p" sx={{ m: 0, fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {g.city || g.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography component="span" aria-hidden="true" sx={{ fontFamily: t.fontMono, fontWeight: 700, fontSize: '1.125rem' }}>
                    {g.rating.toFixed(1)}
                  </Typography>
                  <GoogleStars rating={g.rating} label={labels.googleRating(g.rating.toFixed(1))} />
                  <Typography component="span" sx={{ fontSize: '0.875rem', color: t.inkMuted }}>
                    {labels.googleReviews(g.count)}
                  </Typography>
                </Box>
                {g.url && (
                  <Box
                    component="a"
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      alignSelf: 'flex-start',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      minHeight: 44,
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: t.gold800,
                      textDecoration: 'underline',
                      textUnderlineOffset: '2px',
                      '&:hover': { color: t.ink },
                      '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
                    }}
                  >
                    {labels.googleOpen}
                    <NorthEastIcon aria-hidden sx={{ fontSize: 16 }} />
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
