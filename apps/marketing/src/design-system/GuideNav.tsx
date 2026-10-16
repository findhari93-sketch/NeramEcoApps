'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { Link } from '@/i18n/routing';
import { tokens as t } from './tokens';

export interface GuideNavItem {
  label: string;
  href: string;
  /** An *Outlined icon element (18px). */
  icon?: ReactNode;
}

export interface GuideNavProps {
  /** Mono heading, e.g. "NATA 2026 guide". Also the nav's accessible name. */
  title: string;
  items: GuideNavItem[];
  /** href of the page you are on. */
  current?: string;
}

/**
 * T2 guide rail. Wide screens: a column of 40px rows; the current one is a
 * white row with a gold inset rail and a 1px line. Phones: the same links as
 * a horizontal scroller of pills, with the current one first in view.
 */
export default function GuideNav({ title, items, current }: GuideNavProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Phones: bring the current pill into view inside the scroller (never scrolls the page).
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const on = list.querySelector<HTMLElement>('[aria-current="page"]');
    if (on) list.scrollLeft = Math.max(0, on.offsetLeft - list.offsetLeft - 16);
  }, [current]);

  return (
    <Box component="nav" aria-label={title} sx={{ minWidth: 0 }}>
      <Typography
        component="span"
        sx={{
          display: 'block',
          px: { md: 1.5 },
          pb: 1,
          fontFamily: t.fontMono,
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: t.inkMuted,
        }}
      >
        {title}
      </Typography>
      <Box
        component="ul"
        ref={listRef}
        sx={{
          m: 0,
          p: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: { xs: 'row', md: 'column' },
          gap: { xs: 1, md: '2px' },
          overflowX: { xs: 'auto', md: 'visible' },
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          // Let the scroller run to the screen edge on phones.
          mx: { xs: -2, sm: -3, md: 0 },
          px: { xs: 2, sm: 3, md: 0 },
          pb: { xs: 0.5, md: 0 },
        }}
      >
        {items.map((item) => {
          const on = item.href === current;
          return (
            <Box component="li" key={item.href} sx={{ flexShrink: 0 }}>
              <Box
                component={Link}
                href={item.href}
                aria-current={on ? 'page' : undefined}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  minHeight: { xs: 44, md: 40 },
                  px: 1.5,
                  boxSizing: 'border-box',
                  borderRadius: { xs: `${t.radiusPill}px`, md: `${t.radius}px` },
                  fontSize: '0.875rem',
                  fontWeight: on ? 700 : 500,
                  whiteSpace: 'nowrap',
                  color: on ? t.ink : t.inkMuted,
                  textDecoration: 'none',
                  bgcolor: on ? t.surface : { xs: t.surface, md: 'transparent' },
                  border: { xs: `1px solid ${on ? t.ink : t.line}`, md: 'none' },
                  boxShadow: { md: on ? `inset 3px 0 0 ${t.gold500}, 0 0 0 1px ${t.line}` : 'none' },
                  transition: 'background-color 150ms ease, color 150ms ease',
                  '&:hover': { color: t.ink, bgcolor: t.surface },
                  '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
                  '& svg': { fontSize: 18, flexShrink: 0, color: on ? t.gold800 : 'inherit' },
                }}
              >
                {item.icon}
                {item.label}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
