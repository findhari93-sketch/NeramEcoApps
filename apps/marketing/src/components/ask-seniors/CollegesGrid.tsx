'use client';

import Image from 'next/image';
import { Box, Typography } from '@neram/ui';
import { Link } from '@/i18n/routing';
import { Section, tokens as t, focusRing, hoverGoldBorder } from '@/design-system';

interface AskSeniorsCollege {
  id: string;
  slug: string;
  state_slug: string;
  name: string;
  short_name: string;
  city: string;
  logo_url: string | null;
}

interface CollegesGridProps {
  colleges: AskSeniorsCollege[];
}

function getCollegeInitials(shortName: string): string {
  return shortName.slice(0, 3).toUpperCase();
}

/** Participating colleges as linked tiles (logo or initials, name, city). */
export default function CollegesGrid({ colleges }: CollegesGridProps) {
  return (
    <Section
      id="colleges"
      tone="white"
      header={{ eyebrow: 'Participating colleges', title: `${colleges.length} Architecture Colleges` }}
    >
      <Box
        component="ul"
        sx={{
          m: 0,
          p: 0,
          listStyle: 'none',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 156px), 1fr))',
          gap: { xs: 1.5, md: 2 },
        }}
      >
        {colleges.map((college) => (
          <Box component="li" key={college.id}>
            <Box
              component={Link}
              href={`/colleges/${college.state_slug}/${college.slug}`}
              sx={{
                height: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 0.75,
                p: 2,
                bgcolor: t.surface,
                border: `1px solid ${t.line}`,
                borderRadius: `${t.radius}px`,
                color: t.ink,
                textDecoration: 'none',
                ...hoverGoldBorder,
                ...focusRing,
              }}
            >
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  mb: 0.75,
                  borderRadius: '50%',
                  bgcolor: t.surface,
                  border: `1px solid ${t.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {college.logo_url ? (
                  <Image
                    src={college.logo_url}
                    alt={college.name}
                    width={50}
                    height={50}
                    style={{ objectFit: 'contain', padding: '4px' }}
                    unoptimized
                  />
                ) : (
                  <Typography component="span" aria-hidden sx={{ fontWeight: 700, fontSize: '0.875rem', color: t.navy900 }}>
                    {getCollegeInitials(college.short_name)}
                  </Typography>
                )}
              </Box>
              <Typography
                component="span"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {college.name}
              </Typography>
              <Typography component="span" sx={{ fontSize: '0.8125rem', color: t.inkMuted }}>
                {college.city}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Section>
  );
}
