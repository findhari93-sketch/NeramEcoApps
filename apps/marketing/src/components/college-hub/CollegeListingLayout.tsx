'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { ReactNode } from 'react';

interface CollegeListingLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
}

const SIDEBAR_WIDTH = 280;
const COLLAPSED_WIDTH = 44;
const GAP = 24;
const OUTER_PAD = 24;
const COLLAPSE_KEY = 'college_filter_collapsed';
const FIXED_TOP = 72;

export default function CollegeListingLayout({ sidebar, children }: CollegeListingLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [nearFooter, setNearFooter] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    const node = endRef.current;
    if (!node) return;
    let ticking = false;
    const check = () => {
      ticking = false;
      const rect = node.getBoundingClientRect();
      // Hide whenever the sentinel has reached or passed the viewport bottom.
      // Covers both "footer entering from below" and "scrolled deep into footer".
      const shouldHide = rect.top < window.innerHeight;
      setNearFooter((prev) => (prev === shouldHide ? prev : shouldHide));
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(check);
      }
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  const contentOffset = OUTER_PAD + sidebarWidth + GAP;

  return (
    <>
      {/* Desktop: fixed left sidebar pinned to viewport (hidden near footer) */}
      <Box
        component="aside"
        aria-hidden={nearFooter}
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          position: 'fixed',
          top: FIXED_TOP,
          left: OUTER_PAD,
          width: sidebarWidth,
          height: `calc(100vh - ${FIXED_TOP + 16}px)`,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          transition: 'width 0.2s ease, opacity 0.18s ease, transform 0.18s ease',
          zIndex: 10,
          overflow: 'hidden',
          opacity: nearFooter ? 0 : 1,
          transform: nearFooter ? 'translateX(-8px)' : 'translateX(0)',
          pointerEvents: nearFooter ? 'none' : 'auto',
        }}
      >
        {/* Collapse toggle */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-end',
            p: 0.75,
            borderBottom: collapsed ? 'none' : '1px solid',
            borderColor: 'divider',
          }}
        >
          <Tooltip title={collapsed ? 'Expand filters' : 'Collapse filters'} placement="right">
            <IconButton
              size="small"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand filters' : 'Collapse filters'}
              sx={{
                width: 28,
                height: 28,
                bgcolor: 'grey.100',
                '&:hover': { bgcolor: 'grey.200' },
              }}
            >
              {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Filter content (hidden when collapsed) */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: collapsed ? 'none' : 'block',
          }}
        >
          {sidebar}
        </Box>
      </Box>

      {/* Content column: offset by fixed sidebar width on desktop */}
      <Box
        sx={{
          ml: { xs: 0, md: `${contentOffset}px` },
          mr: { xs: 0, md: `${OUTER_PAD}px` },
          px: { xs: 2, sm: 3, md: 0 },
          transition: 'margin-left 0.2s ease',
          minWidth: 0,
        }}
      >
        {/* Mobile: sidebar renders its own FAB + drawer here */}
        <Box sx={{ display: { xs: 'block', md: 'none' } }}>{sidebar}</Box>
        {children}
        {/* Sentinel: hides the fixed sidebar when it enters viewport (i.e. near footer) */}
        <Box ref={endRef} aria-hidden sx={{ height: 1, width: '100%' }} />
      </Box>
    </>
  );
}
