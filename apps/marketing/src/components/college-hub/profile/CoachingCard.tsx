import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import { siteTokens } from '@neram/ui/site-tokens';

/** Neram coaching promo in the college page rail (canvas: dark "Preparing for NATA" card). */
export default function CoachingCard({ year, href }: { year: number; href: string }) {
  return (
    <Box component="aside" aria-labelledby="coaching-card-heading" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, p: { xs: 2.5, md: 3 }, mx: { xs: 2, md: 0 }, borderRadius: 1, bgcolor: siteTokens.navy900, color: siteTokens.paper }}>
      <Typography id="coaching-card-heading" component="p" sx={{ m: 0, fontSize: '1.1rem', fontWeight: 700 }}>
        Preparing for NATA {year}?
      </Typography>
      <Typography sx={{ m: 0, fontSize: '0.9rem', lineHeight: 1.5, color: siteTokens.paperMuted }}>
        Live classes for NATA and JEE Main Paper 2 from Neram Classes, coaching since 2009.
      </Typography>
      <Box
        component={Link}
        href={href}
        sx={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', minHeight: 44, px: 2, borderRadius: 1, bgcolor: siteTokens.gold500, color: siteTokens.navy900, fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none', '&:hover': { bgcolor: siteTokens.gold300 }, '&:focus-visible': { outline: siteTokens.focusOutline, outlineOffset: 2 } }}
      >
        See NATA coaching
      </Box>
    </Box>
  );
}
