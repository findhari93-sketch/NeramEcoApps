'use client';

import { useEffect, useRef } from 'react';
import { Box, Typography, Grid, Chip } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import { scrollRevealSx } from '@/hooks/useScrollAnimation';
import CalculateIcon from '@mui/icons-material/Calculate';
import SchoolIcon from '@mui/icons-material/School';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import QuizIcon from '@mui/icons-material/Quiz';
import CropIcon from '@mui/icons-material/Crop';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Link from 'next/link';
import { TOOLS, COMING_SOON_TOOLS, type Tool } from '@/lib/landing-data';

const ICON_MAP: Record<string, React.ReactNode> = {
  Calculator: <CalculateIcon sx={{ fontSize: 28 }} />,
  School: <SchoolIcon sx={{ fontSize: 28 }} />,
  LocationOn: <LocationOnIcon sx={{ fontSize: 28 }} />,
  Quiz: <QuizIcon sx={{ fontSize: 28 }} />,
  Crop: <CropIcon sx={{ fontSize: 28 }} />,
};

/**
 * Observe a parent container and reveal children with staggered delays.
 * Each direct child with `data-reveal` gets 'is-visible' class added
 * when the parent scrolls into view.
 */
function useStaggerReveal(margin = '-60px') {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const children = node.querySelectorAll('[data-reveal]');
          children.forEach((child) => child.classList.add('is-visible'));
          observer.unobserve(node);
        }
      },
      { rootMargin: margin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [margin]);

  return ref;
}

function ToolCard({ tool, index }: { tool: Tool; index: number }) {
  return (
    <Box
      data-reveal
      sx={scrollRevealSx(index)}
    >
      <Box
        component={Link}
        href={tool.href}
        sx={{
          display: 'block',
          p: 3,
          borderRadius: '16px',
          bgcolor: neramTokens.navy[800],
          border: `1px solid ${tool.featured ? `${tool.color}30` : neramTokens.navy[600] + '40'}`,
          transition: 'all 0.3s ease',
          cursor: 'pointer',
          height: '100%',
          textDecoration: 'none',
          position: 'relative',
          overflow: 'hidden',
          '&:hover': {
            transform: 'translateY(-4px)',
            borderColor: `${tool.color}60`,
            boxShadow: `0 12px 40px ${tool.color}20`,
          },
        }}
      >
        {/* Icon */}
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '14px',
            bgcolor: `${tool.color}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: tool.color,
            mb: 2,
          }}
        >
          {ICON_MAP[tool.icon]}
        </Box>

        {/* Badge */}
        {tool.badge && (
          <Chip
            label={tool.badge}
            size="small"
            sx={{
              position: 'absolute',
              top: 16,
              right: 16,
              bgcolor: `${tool.color}20`,
              color: tool.color,
              fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              borderRadius: '6px',
            }}
          />
        )}

        {/* Title */}
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            fontSize: '1.1rem',
            color: neramTokens.cream[100],
            mb: 1,
          }}
        >
          {tool.title}
        </Typography>

        {/* Description */}
        <Typography
          variant="body2"
          sx={{
            color: neramTokens.cream[300],
            lineHeight: 1.6,
            mb: 2,
            fontSize: '0.85rem',
          }}
        >
          {tool.description}
        </Typography>

        {/* Arrow */}
        <Box sx={{ display: 'flex', alignItems: 'center', color: tool.color, gap: 0.5 }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Try Now</Typography>
          <ArrowForwardIcon sx={{ fontSize: 16 }} />
        </Box>
      </Box>
    </Box>
  );
}

export default function ToolsShowcase() {
  const gridRef = useStaggerReveal('-60px');

  return (
    <Box
      component="section"
      id="tools"
      sx={{
        bgcolor: neramTokens.navy[900],
        py: { xs: 8, md: 12 },
        px: { xs: 2, md: 4 },
      }}
    >
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        {/* Section header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 7 } }}>
          <Typography
            sx={{
              fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: neramTokens.gold[500],
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              mb: 2,
            }}
          >
            Powerful Tools
          </Typography>
          <Typography
            variant="h2"
            sx={{
              fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif',
              fontSize: { xs: '2rem', md: '3rem' },
              fontWeight: 700,
              color: neramTokens.cream[100],
            }}
          >
            Everything for Your NATA Journey
          </Typography>
        </Box>

        {/* Tools grid */}
        <Grid container spacing={3} ref={gridRef}>
          {TOOLS.map((tool, i) => (
            <Grid
              item
              key={tool.id}
              xs={12}
              sm={6}
              md={tool.featured ? 6 : 4}
            >
              <ToolCard tool={tool} index={i} />
            </Grid>
          ))}

          {/* Coming Soon card */}
          <Grid item xs={12} sm={6} md={4}>
            <Box
              data-reveal
              sx={scrollRevealSx(TOOLS.length)}
            >
              <Box
                sx={{
                  p: 3,
                  borderRadius: '16px',
                  bgcolor: neramTokens.navy[800],
                  border: `1px dashed ${neramTokens.navy[600]}60`,
                  height: '100%',
                  opacity: 0.7,
                }}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '14px',
                    bgcolor: `${neramTokens.navy[600]}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: neramTokens.cream[300],
                    mb: 2,
                  }}
                >
                  <MoreHorizIcon sx={{ fontSize: 28 }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', color: neramTokens.cream[100], mb: 1.5 }}>
                  Coming Soon
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {COMING_SOON_TOOLS.map((name) => (
                    <Chip
                      key={name}
                      label={name}
                      size="small"
                      sx={{
                        bgcolor: neramTokens.navy[700],
                        color: neramTokens.cream[300],
                        fontSize: '0.75rem',
                        borderRadius: '6px',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
