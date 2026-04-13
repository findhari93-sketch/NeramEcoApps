'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack } from '@mui/material';

export interface NavPill {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface NavPillsProps {
  pills: NavPill[];
  activeId?: string;
}

export default function NavPills({ pills, activeId }: NavPillsProps) {
  const [active, setActive] = useState(activeId ?? pills[0]?.id);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection observer to highlight pill matching visible section
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );

    pills.forEach((pill) => {
      const el = document.getElementById(pill.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [pills]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -72; // sticky header height
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
    setActive(id);
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <Stack
        direction="row"
        gap={0}
        sx={{ minWidth: 'max-content', px: { xs: 2, sm: 3 } }}
      >
        {pills.map((pill) => (
          <Button
            key={pill.id}
            onClick={() => scrollTo(pill.id)}
            size="small"
            startIcon={pill.icon}
            sx={{
              py: 1.5,
              px: { xs: 1.5, sm: 2 },
              borderRadius: 0,
              borderBottom: active === pill.id ? '2px solid' : '2px solid transparent',
              borderBottomColor: active === pill.id ? 'primary.main' : 'transparent',
              color: active === pill.id ? 'primary.main' : 'text.secondary',
              fontWeight: active === pill.id ? 700 : 400,
              fontSize: { xs: '0.8rem', sm: '0.875rem' },
              whiteSpace: 'nowrap',
              minWidth: 'unset',
              textTransform: 'none',
              transition: 'all 0.15s',
            }}
          >
            {pill.label}
          </Button>
        ))}
      </Stack>
    </Box>
  );
}
