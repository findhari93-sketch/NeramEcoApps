'use client';

import { useRef } from 'react';
import { Box, Container, Typography, IconButton, Stack } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FeaturedCollegeCard from '../FeaturedCollegeCard';
import type { CollegeListItem } from '@/lib/college-hub/types';

interface FeaturedCollegesCarouselProps {
  colleges: CollegeListItem[];
}

export default function FeaturedCollegesCarousel({ colleges }: FeaturedCollegesCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (colleges.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const cardWidth = 300;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -cardWidth : cardWidth,
      behavior: 'smooth',
    });
  };

  return (
    <Box sx={{ py: { xs: 5, sm: 6, md: 8 } }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: { xs: 2.5, sm: 3 } }}
        >
          <Box>
            <Typography
              variant="h2"
              sx={{
                fontSize: { xs: '1.35rem', sm: '1.5rem' },
                fontWeight: 800,
                color: '#0f172a',
              }}
            >
              Featured Colleges
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
              Explore top architecture colleges in India
            </Typography>
          </Box>

          {/* Desktop scroll arrows */}
          <Stack direction="row" gap={0.5} sx={{ display: { xs: 'none', sm: 'flex' } }}>
            <IconButton
              onClick={() => scroll('left')}
              size="small"
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                '&:hover': { bgcolor: '#f1f5f9' },
              }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              onClick={() => scroll('right')}
              size="small"
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                '&:hover': { bgcolor: '#f1f5f9' },
              }}
            >
              <ChevronRightIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Container>

      {/* Scrollable card row */}
      <Box
        ref={scrollRef}
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          px: { xs: 2, sm: 3, md: `max(24px, calc((100vw - 1200px) / 2 + 24px))` },
          pb: 1,
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {colleges.map((college) => (
          <Box
            key={college.id}
            sx={{
              flex: '0 0 300px',
              scrollSnapAlign: 'start',
              maxWidth: 320,
            }}
          >
            <FeaturedCollegeCard college={college} variant="portrait" />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
