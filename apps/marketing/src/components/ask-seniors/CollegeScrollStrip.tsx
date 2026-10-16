'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Box, Typography } from '@neram/ui';
import type { AskSeniorsCollege } from '@neram/database';
import { tokens } from '@/design-system';

interface CollegeScrollStripProps {
  colleges: AskSeniorsCollege[];
  direction?: 'forward' | 'reverse';
  durationMs?: number;
}

/**
 * CollegeScrollStrip — pure-CSS infinite horizontal marquee of college logo chips.
 * Duplicates the list once for a seamless loop. Pauses on hover.
 * Decorative strip only (chips have tabIndex -1, not in keyboard nav).
 */
export default function CollegeScrollStrip({
  colleges,
  direction = 'forward',
  durationMs = 32000,
}: CollegeScrollStripProps) {
  if (!colleges.length) return null;

  // Duplicate for seamless loop: translate -50% returns to the start
  const items = [...colleges, ...colleges];

  return (
    <Box
      sx={{
        overflow: 'hidden',
        width: '100%',
        // Edge fade masks
        maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',

        // Define the marquee keyframes inline (MUI injects into <style>)
        '@keyframes collegeMarquee': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      }}
    >
      {/* Scroll track — pause on hover */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: '12px',
          width: 'max-content',
          animation: `collegeMarquee ${durationMs}ms linear infinite`,
          animationDirection: direction === 'reverse' ? 'reverse' : 'normal',
          '&:hover': {
            animationPlayState: 'paused',
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          py: '6px',
          // Prevent layout shift while animation loads
          willChange: 'transform',
        }}
      >
        {items.map((college, idx) => {
          const initials = college.short_name.slice(0, 3).toUpperCase();

          return (
            <Box
              key={`${college.id}-${idx}`}
              component={Link}
              href={`/colleges/${college.state_slug}/${college.slug}`}
              tabIndex={-1}
              aria-hidden="true"
              sx={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '10px',
                flexShrink: 0,
                textDecoration: 'none',
                color: 'inherit',
                px: '12px',
                py: '8px',
                borderRadius: '50px',
                border: `1px solid ${tokens.lineDark}`,
                bgcolor: tokens.navy800,
                transition: 'border-color 150ms ease',
                cursor: 'pointer',
                '&:hover': {
                  borderColor: tokens.gold500,
                  '& .chip-name': { color: tokens.gold500 },
                },
              }}
            >
              {/* Logo avatar */}
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  bgcolor: tokens.surface,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  p: '3px',
                }}
              >
                {college.logo_url ? (
                  <Image
                    src={college.logo_url}
                    alt=""
                    width={30}
                    height={30}
                    style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                  />
                ) : (
                  <Typography
                    sx={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: tokens.navy900,
                      lineHeight: 1,
                      letterSpacing: '-0.5px',
                      userSelect: 'none',
                    }}
                  >
                    {initials}
                  </Typography>
                )}
              </Box>

              {/* College name + city */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <Typography
                  className="chip-name"
                  sx={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: tokens.paper,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    transition: 'color 0.2s ease',
                  }}
                >
                  {college.short_name}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '11px',
                    color: tokens.paperSubtle,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {college.city}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
