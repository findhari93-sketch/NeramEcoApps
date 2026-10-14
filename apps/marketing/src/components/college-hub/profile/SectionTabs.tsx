'use client';

import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

export interface SectionTab {
  id: string;
  label: string;
}

/**
 * Sticky "On this page" tabs (canvas: underlined tabs under the hero). The tab
 * of the section in view is marked current; tapping one scrolls to it.
 */
export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-35% 0px -60% 0px', threshold: 0 }
    );
    tabs.forEach((t) => {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [tabs]);

  // Keep the current tab visible in the scrolling strip.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    const list = listRef.current;
    if (!el || !list) return;
    const left = el.offsetLeft - list.clientWidth / 2 + el.clientWidth / 2;
    list.scrollTo({ left, behavior: 'auto' });
  }, [active]);

  const go = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
    setActive(id);
  };

  if (tabs.length < 2) return null;

  return (
    <Box
      component="nav"
      aria-label="On this page"
      sx={{
        position: 'sticky',
        top: 'var(--broadcast-banner-height, 0px)',
        zIndex: 10,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box
        component="ul"
        ref={listRef}
        sx={{
          maxWidth: 1360,
          mx: 'auto',
          px: { xs: 1, md: 4 },
          my: 0,
          listStyle: 'none',
          display: 'flex',
          gap: 0.5,
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <Box
                component="a"
                href={`#${t.id}`}
                data-tab={t.id}
                aria-current={on ? 'true' : undefined}
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) => go(e, t.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  height: { xs: 48, md: 52 },
                  px: { xs: 1.5, md: 1.75 },
                  boxSizing: 'border-box',
                  borderBottom: '3px solid',
                  borderBottomColor: on ? 'primary.main' : 'transparent',
                  color: on ? 'text.primary' : 'text.secondary',
                  textDecoration: 'none',
                  fontSize: '0.92rem',
                  fontWeight: on ? 700 : 500,
                  transition: 'color 150ms, border-color 150ms',
                  '&:hover': { color: 'text.primary' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -3 },
                }}
              >
                {t.label}
              </Box>
            </li>
          );
        })}
      </Box>
    </Box>
  );
}
