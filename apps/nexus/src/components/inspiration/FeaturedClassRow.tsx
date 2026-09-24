'use client';

import Link from 'next/link';
import { Box, Skeleton, Typography } from '@neram/ui';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import StudentAvatar from '@/components/students/StudentAvatar';
import { useAuthSWR } from '@/lib/nexus-swr';
import type { ClassFeaturedCard } from '@/lib/inspiration-present';
import { rememberListUrl } from './inspiration-nav';

const CARD_WIDTH = { xs: 156, sm: 188 };

/** "23 Sept", in IST, so a feature made late at night is not dated the day before. */
export function featuredDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export interface FeaturedClassRowProps {
  /** '/student/inspiration' or '/teacher/inspiration'. */
  base: string;
  staff: boolean;
}

/**
 * The class wall: drawings a teacher featured in the viewer's classroom, newest
 * first, with the face and full name of whoever drew them.
 *
 * A row on Inspiration rather than a page of its own (founder, 2026-09-24): the
 * student already comes here for ideas, and a second shelf is a second place to
 * forget to look. It scrolls sideways inside itself so the page never does, and
 * it is simply absent when nothing has been featured yet.
 */
export default function FeaturedClassRow({ base, staff }: FeaturedClassRowProps) {
  const { data, error, isLoading } = useAuthSWR<{ items: ClassFeaturedCard[] }>(
    '/api/inspiration/search?featured=class',
    { dedupingInterval: 0 },
  );
  const items = data?.items ?? [];

  // Nothing featured, or the read failed: the grid below still works, so stay quiet.
  if (error || (!isLoading && items.length === 0)) return null;

  return (
    <Box component="section" aria-labelledby="featured-class-heading" data-testid="featured-class-row" sx={{ mb: 3, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <StarRoundedIcon aria-hidden sx={{ color: 'warning.dark', fontSize: 22 }} />
        <Typography id="featured-class-heading" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>
          Featured from your class
        </Typography>
      </Box>

      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          pb: 1,
          display: 'flex',
          gap: 1.5,
          overflowX: 'auto',
          overscrollBehaviorX: 'contain',
          scrollSnapType: 'x mandatory',
          '@media (prefers-reduced-motion: no-preference)': { scrollBehavior: 'smooth' },
        }}
      >
        {isLoading && !data
          ? [0, 1, 2].map((i) => (
              <Box component="li" key={i} aria-hidden sx={{ flex: '0 0 auto', width: CARD_WIDTH }}>
                <Skeleton variant="rounded" sx={{ width: '100%', height: 'auto', aspectRatio: '3 / 4', borderRadius: 2 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                  <Skeleton variant="circular" width={32} height={32} />
                  <Skeleton variant="text" sx={{ flex: 1 }} />
                </Box>
              </Box>
            ))
          : items.map((card) => <FeaturedCard key={card.id} card={card} href={`${base}/${card.id}`} staff={staff} />)}
      </Box>
    </Box>
  );
}

function FeaturedCard({ card, href, staff }: { card: ClassFeaturedCard; href: string; staff: boolean }) {
  // The credit already reads "Harshitaa Thiyagu · 2026 batch" for a featured drawing.
  const name = card.credit;
  const when = featuredDate(card.featuredIn.featuredAt);
  // A teacher may teach several classrooms, so they are told which one; a student is in theirs.
  const meta = staff && card.featuredIn.classroomName ? `${when} · ${card.featuredIn.classroomName}` : `Featured ${when}`;

  return (
    <Box component="li" sx={{ flex: '0 0 auto', width: CARD_WIDTH, scrollSnapAlign: 'start', minWidth: 0 }}>
      <Box
        component={Link}
        href={href}
        onClick={rememberListUrl}
        aria-label={`${card.title}, by ${name}, ${meta}`}
        sx={{
          display: 'block',
          color: 'inherit',
          textDecoration: 'none',
          borderRadius: 2,
          '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          '@media (prefers-reduced-motion: no-preference)': {
            '& img': { transition: 'transform 150ms ease-out' },
            '&:hover img': { transform: 'scale(1.02)' },
          },
        }}
      >
        <Box sx={{ borderRadius: 2, overflow: 'hidden', bgcolor: 'grey.100', border: '2px solid', borderColor: 'warning.light' }}>
          <Box
            component="img"
            src={card.thumbnailUrl ?? card.imageUrl}
            alt={card.alt}
            loading="lazy"
            decoding="async"
            sx={{ display: 'block', width: '100%', aspectRatio: '3 / 4', objectFit: 'cover' }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, minHeight: 44 }}>
          <StudentAvatar userId={card.author?.id ?? null} name={card.author?.name ?? null} src={card.author?.avatarUrl ?? null} size={32} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap title={name} sx={{ fontWeight: 600 }}>
              {name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {meta}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
