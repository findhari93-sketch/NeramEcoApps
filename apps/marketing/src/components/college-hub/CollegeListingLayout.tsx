'use client';

import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import type { ReactNode } from 'react';
import { tokens } from '@/design-system';

/** Content width of the directory (canvas: 1360px container). */
export const DIRECTORY_MAX_WIDTH = 1360;

const SIDEBAR_WIDTH = 280;
const COLLAPSED_WIDTH = 56;
const COLLAPSE_KEY = 'college_filter_collapsed';
/** Site header height on desktop (Header.tsx Toolbar minHeight md). */
const HEADER_HEIGHT = 64;

export interface SidebarControls {
  /** Collapses the rail to a slim strip (the button lives in the rail's header row). */
  onCollapse: () => void;
}

interface CollegeListingLayoutProps {
  /** Full-width white band above the filters and results (breadcrumb, title, search, stats). */
  hero?: ReactNode;
  sidebar: (controls: SidebarControls) => ReactNode;
  /** Active filter count, shown on the collapsed strip. */
  activeFilters?: number;
  children: ReactNode;
}

/**
 * Directory layout (canvas: Desktop · List view): a full-width hero band, then a
 * 1360px container with a sticky 280px filter card beside the results. Phones
 * get the hero and the results only (filters live in the bottom sheet).
 */
export default function CollegeListingLayout({ hero, sidebar, activeFilters = 0, children }: CollegeListingLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
    } catch {
      // Storage blocked: start expanded.
    }
  }, []);

  const setAndStore = (next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage errors.
    }
  };

  const stickyTop = `calc(var(--broadcast-banner-height, 0px) + ${HEADER_HEIGHT + 16}px)`;

  return (
    <>
      {hero && (
        <Box sx={{ bgcolor: tokens.surface, borderBottom: { md: '1px solid' }, borderColor: { md: tokens.line } }}>
          <Box sx={{ maxWidth: DIRECTORY_MAX_WIDTH, mx: 'auto', px: { xs: 2, md: 4 }, pt: { xs: 0, md: 2.5 }, pb: { xs: 0, md: 3.5 } }}>{hero}</Box>
        </Box>
      )}

      <Box sx={{ bgcolor: tokens.ground }}>
        <Box
          sx={{
            maxWidth: DIRECTORY_MAX_WIDTH,
            mx: 'auto',
            px: { xs: 2, md: 4 },
            pt: { xs: 0, md: 3 },
            pb: { xs: 3, md: 7 },
            display: 'flex',
            alignItems: 'flex-start',
            gap: 3.5,
          }}
        >
          <Box
            component="aside"
            aria-label={collapsed ? 'Filters (collapsed)' : undefined}
            sx={{
              display: { xs: 'none', md: 'block' },
              flex: `0 0 ${collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH}px`,
              width: collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH,
              position: 'sticky',
              top: stickyTop,
              maxHeight: `calc(100vh - var(--broadcast-banner-height, 0px) - ${HEADER_HEIGHT + 32}px)`,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              bgcolor: tokens.surface,
              border: '1px solid',
              borderColor: tokens.line,
              borderRadius: 1,
              scrollbarWidth: 'thin',
            }}
          >
            {collapsed ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.5 }}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setAndStore(false)}
                  aria-label={activeFilters ? `Expand filters, ${activeFilters} active` : 'Expand filters'}
                  sx={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: tokens.line, borderRadius: 1, bgcolor: tokens.surface, color: tokens.ink, cursor: 'pointer', '&:hover': { bgcolor: tokens.surfaceHover }, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
                >
                  <TuneIcon aria-hidden sx={{ fontSize: 20 }} />
                  {activeFilters > 0 && (
                    <Box component="span" sx={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, px: 0.5, boxSizing: 'border-box', borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.navy900, color: tokens.paper, fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {activeFilters}
                    </Box>
                  )}
                </Box>
                <Box component="span" aria-hidden sx={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.inkMuted, mt: 0.5 }}>
                  Filters
                </Box>
              </Box>
            ) : (
              sidebar({ onCollapse: () => setAndStore(true) })
            )}
          </Box>

          <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>{children}</Box>
        </Box>
      </Box>
    </>
  );
}
