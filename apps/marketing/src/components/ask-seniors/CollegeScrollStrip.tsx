'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Box, Typography } from '@neram/ui';
import type { AskSeniorsCollege } from '@neram/database';

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
                gap: '8px',
                flexShrink: 0,
                textDecoration: 'none',
                color: 'inherit',
                px: '10px',
                py: '6px',
                borderRadius: '40px',
                border: '1px solid rgba(255,255,255,0.08)',
                bgcolor: 'transparent',
                transition: 'border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease',
                cursor: 'pointer',
                '&:hover': {
                  borderColor: 'rgba(232,160,32,0.55)',
                  bgcolor: 'rgba(232,160,32,0.07)',
                  transform: 'translateY(-3px)',
                  '& .chip-name': {
                    color: '#e8a020',
                  },
                },
              }}
            >
              {/* Logo avatar */}
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  bgcolor: 'white',
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
                      color: '#1a3060',
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
                    color: 'rgba(245,240,232,0.9)',
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
                    color: 'rgba(245,240,232,0.45)',
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
