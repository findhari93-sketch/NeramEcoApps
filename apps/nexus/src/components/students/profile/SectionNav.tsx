'use client';

import { useEffect, useState } from 'react';
import { Box, Paper, Typography } from '@neram/ui';

export interface NavItem {
  id: string;
  label: string;
}

/**
 * Desktop-only jump list for the section stack.
 *
 * Rendered inside the sticky left rail, so on a monitor the whole profile is
 * reachable in one click without scrolling. Hidden below `md`, where the
 * accordion summaries already serve this purpose and a second navigation
 * control would just take up the screen the content needs.
 */
export default function SectionNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const nodes = items
      .map((i) => document.getElementById(i.id))
      .filter((n): n is HTMLElement => n !== null);

    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The topmost section currently intersecting wins, so the highlight
        // tracks reading position rather than whichever fired last.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [items]);

  return (
    <Paper sx={{ p: 1, mt: 2 }} component="nav" aria-label="Profile sections">
      <Box sx={{ display: 'grid' }}>
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <Box
              key={item.id}
              component="a"
              href={`#${item.id}`}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                setActive(item.id);
              }}
              aria-current={isActive ? 'true' : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                minHeight: 44,
                px: 1.5,
                borderRadius: 1,
                textDecoration: 'none',
                borderLeft: '3px solid',
                borderLeftColor: isActive ? 'primary.main' : 'transparent',
                bgcolor: isActive ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'primary.main' : 'text.secondary',
                }}
              >
                {item.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
