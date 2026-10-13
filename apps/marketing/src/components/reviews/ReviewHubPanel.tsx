/**
 * The top of /reviews: the facts sentence answer engines can quote, and Google's
 * own rating for each centre.
 *
 * Replaces the old "Rating summary", which averaged the published reviews. Staff
 * now choose what is published, so that average would be self-serving; Google's
 * rating is not ours to curate, and it is what parents check anyway.
 * Server component, no client state.
 */

import { Box, Link as MuiLink, Paper, Stack, Typography } from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { CentreGoogleRating } from '@/lib/reviews/hub';
import { Stars, focusRing } from './ReviewParts';

export interface ReviewHubPanelLabels {
  factsTitle: string;
  reviewCount: string;
  googleTitle: string;
  googleIntro: string;
  googleRating: (rating: string) => string;
  googleReviews: (count: number) => string;
  googleOpen: string;
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
    <Paper component="section" aria-labelledby="hub-facts-title" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
      <Typography id="hub-facts-title" component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 1 }}>
        {labels.factsTitle}
      </Typography>
      {sentence && (
        <Typography data-testid="review-facts" sx={{ fontSize: '1rem', lineHeight: 1.6, maxWidth: '65ch' }}>
          {sentence}
        </Typography>
      )}

      {google.length > 0 && (
        <Box sx={{ mt: sentence ? 2.5 : 0 }}>
          <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 700 }}>
            {labels.googleTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {labels.googleIntro}
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
            {google.map((g) => (
              <Box
                component="li"
                key={`${g.name}-${g.city}`}
                sx={{ p: 1.5, border: '1px solid', borderColor: 'grey.200', borderRadius: 2, minWidth: 0 }}
              >
                <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{g.city || g.name}</Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 800 }} aria-hidden="true">
                    {g.rating.toFixed(1)}
                  </Typography>
                  <Stars rating={g.rating} label={labels.googleRating(g.rating.toFixed(1))} size={18} />
                  <Typography variant="body2" color="text.secondary">
                    {labels.googleReviews(g.count)}
                  </Typography>
                </Stack>
                {g.url && (
                  <MuiLink
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 44, fontWeight: 600, ...focusRing }}
                  >
                    {labels.googleOpen}
                    <OpenInNewIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                  </MuiLink>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}
      <Typography variant="body2" sx={{ mt: 2, fontWeight: 600 }}>
        {labels.reviewCount}
      </Typography>
    </Paper>
  );
}
