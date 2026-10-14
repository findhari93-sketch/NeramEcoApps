'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import type { CollegeDetail, CollegeListItem } from '@/lib/college-hub/types';
import { addToCompareList, compareHref } from '@/lib/college-hub/compare-store';
import { collegeHref, feeLabel, seatsLabel, shortName, typeLabel } from '@/lib/college-hub/format';
import { COMPARE_MAX } from '@/lib/college-hub/constants';
import CollegeLogo from '../directory/CollegeLogo';

interface Props {
  college: CollegeDetail;
  similar: CollegeListItem[];
  stateName: string;
}

/** "Similar B.Arch colleges" (canvas: four compact cards, horizontal scroll on phones). */
export default function SimilarCollegeCards({ college, similar, stateName }: Props) {
  const router = useRouter();
  if (similar.length === 0) return null;
  const name = shortName(college);

  const compareAll = () => {
    const picks = [college, ...similar].slice(0, COMPARE_MAX);
    for (const c of picks) addToCompareList({ slug: c.slug, name: c.name, shortName: shortName(c), stateSlug: c.state_slug });
    router.push(compareHref(picks));
  };

  return (
    <Box component="section" aria-labelledby="similar-heading" sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, px: { xs: 2, md: 0 }, py: { xs: 2.5, md: 1 }, bgcolor: { xs: 'background.paper', md: 'transparent' } }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px 16px' }}>
        <Typography id="similar-heading" variant="h2" sx={{ m: 0, fontSize: { xs: '1.15rem', md: 20 }, fontWeight: 700 }}>
          Similar B.Arch colleges in {stateName}
        </Typography>
        <Box
          component="button"
          type="button"
          onClick={compareAll}
          sx={{ minHeight: 44, px: 0, border: 0, bgcolor: 'transparent', color: 'primary.dark', font: 'inherit', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
        >
          Compare {name} with these
        </Box>
      </Box>
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: { xs: 'flex', md: 'grid' },
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
          gap: 1.5,
          overflowX: { xs: 'auto', md: 'visible' },
          mr: { xs: -2, md: 0 },
          pr: { xs: 2, md: 0 },
          pb: { xs: 0.5, md: 0 },
          scrollSnapType: { xs: 'x mandatory', md: 'none' },
        }}
      >
        {similar.map((s) => {
          const fee = feeLabel(s, 'short');
          const seats = seatsLabel(s, 'short');
          return (
            <Box
              component="li"
              key={s.id}
              sx={{ flex: { xs: '0 0 228px', md: 'initial' }, scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', gap: 1.25, p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
              <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                <CollegeLogo name={s.name} logoUrl={s.logo_url} size={40} radius={1.25} />
                <Box
                  component={Link}
                  href={collegeHref(s)}
                  sx={{ fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.3, color: 'text.primary', textDecoration: 'none', minHeight: '2.6em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', '&:hover': { color: 'primary.main' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', borderRadius: 0.5 } }}
                >
                  {s.name}
                </Box>
              </Box>
              <Typography sx={{ m: 0, fontSize: '0.82rem', color: 'text.secondary' }}>
                {s.city} · {typeLabel(s.type, 'short')} · {s.naac_grade ? `NAAC ${s.naac_grade}` : 'No NAAC grade'}
              </Typography>
              <Box sx={{ mt: 'auto', pt: 1.25, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, fontSize: '0.88rem' }}>
                <Box component="b" sx={{ color: fee.startsWith('₹') ? 'text.primary' : 'text.secondary', fontWeight: fee.startsWith('₹') ? 700 : 500 }}>{fee}</Box>
                <Box component="span" sx={{ color: 'text.secondary' }}>{seats}</Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
