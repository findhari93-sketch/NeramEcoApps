'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTheme, useMediaQuery } from '@mui/material';
import {
  Box,
  Typography,
  IconButton,
  SwipeableDrawer,
  Tooltip,
  Divider,
} from '@neram/ui';
import { m3Primary, m3Neutral } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { spokePages } from './data/spokePages';

// ============================================
// CONSTANTS
// ============================================

const RAIL_WIDTH = 48;
const EXPANDED_WIDTH = 264;
const DRAWER_WIDTH = 280;

// ============================================
// TYPES
// ============================================

interface SpokeNavSidebarProps {
  locale: string;
  currentSlug: string;
}

// ============================================
// NAV ITEM (shared between desktop & mobile)
// ============================================

function NavItem({
  page,
  locale,
  isActive,
  expanded,
  onClick,
}: {
  page: (typeof spokePages)[number];
  locale: string;
  isActive: boolean;
  expanded: boolean;
  onClick?: () => void;
}) {
  const IconComp = page.icon;

  const content = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        height: 44,
        px: expanded ? 1.5 : 0,
        justifyContent: expanded ? 'flex-start' : 'center',
        borderLeft: isActive ? `3px solid ${page.tintDark}` : '3px solid transparent',
        bgcolor: isActive ? `${page.tint}66` : 'transparent',
        transition: 'all 0.2s ease',
        borderRadius: expanded ? '0 8px 8px 0' : 0,
        '&:hover': {
          bgcolor: isActive ? `${page.tint}88` : `${m3Neutral[95]}`,
        },
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          minWidth: 32,
          borderRadius: '50%',
          bgcolor: isActive ? page.tint : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 0.2s ease',
        }}
      >
        <IconComp
          sx={{
            fontSize: 18,
            color: isActive ? page.tintDark : m3Neutral[50],
          }}
        />
      </Box>
      {expanded && (
        <Typography
          sx={{
            fontSize: '0.82rem',
            fontWeight: isActive ? 700 : 500,
            color: isActive ? page.tintDark : m3Neutral[30],
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}
        >
          {page.title}
        </Typography>
      )}
    </Box>
  );

  if (!expanded) {
    return (
      <Tooltip title={page.title} placement="right" arrow>
        <Link
          href={`/${locale}/nata-2026/${page.slug}`}
          style={{ textDecoration: 'none', display: 'block' }}
          onClick={onClick}
          aria-current={isActive ? 'page' : undefined}
        >
          {content}
        </Link>
      </Tooltip>
    );
  }

  return (
    <Link
      href={`/${locale}/nata-2026/${page.slug}`}
      style={{ textDecoration: 'none', display: 'block' }}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
    >
      {content}
    </Link>
  );
}

// ============================================
// DESKTOP RAIL SIDEBAR
// ============================================

function DesktopRail({ locale, currentSlug }: SpokeNavSidebarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      component="nav"
      role="navigation"
      aria-label="NATA 2026 topic navigation"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      sx={{
        position: 'fixed',
        left: 0,
        top: 'calc(var(--broadcast-banner-height, 0px) + 64px)',
        height: 'calc(100vh - var(--broadcast-banner-height, 0px) - 64px)',
        width: expanded ? EXPANDED_WIDTH : RAIL_WIDTH,
        bgcolor: '#FFFFFF',
        borderRight: `1px solid ${m3Neutral[90]}`,
        boxShadow: expanded ? '4px 0 16px rgba(0,0,0,0.08)' : 'none',
        zIndex: 1100,
        overflowX: 'hidden',
        overflowY: 'auto',
        transition: 'width 200ms cubic-bezier(0.2, 0, 0, 1), box-shadow 200ms ease',
        display: 'flex',
        flexDirection: 'column',
        py: 1,
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: m3Neutral[80],
          borderRadius: 2,
        },
      }}
    >
      {/* Back to hub */}
      <Tooltip title={expanded ? '' : 'Back to NATA 2026'} placement="right" arrow>
        <Link
          href={`/${locale}/nata-2026`}
          style={{ textDecoration: 'none', display: 'block' }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              height: 40,
              px: expanded ? 1.5 : 0,
              justifyContent: expanded ? 'flex-start' : 'center',
              transition: 'all 0.2s ease',
              '&:hover': { bgcolor: m3Neutral[95] },
            }}
          >
            <ArrowBackIcon sx={{ fontSize: 18, color: m3Primary[40] }} />
            {expanded && (
              <Typography
                sx={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: m3Primary[40],
                  whiteSpace: 'nowrap',
                }}
              >
                NATA 2026 Hub
              </Typography>
            )}
          </Box>
        </Link>
      </Tooltip>

      <Divider sx={{ my: 0.5, mx: expanded ? 1.5 : 0.5 }} />

      {/* Nav items */}
      {spokePages.map((page) => (
        <NavItem
          key={page.slug}
          page={page}
          locale={locale}
          isActive={page.slug === currentSlug}
          expanded={expanded}
        />
      ))}
    </Box>
  );
}

// ============================================
// MOBILE TRIGGER + DRAWER
// ============================================

function MobileNav({ locale, currentSlug }: SpokeNavSidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <>
      {/* Floating trigger tab on left edge */}
      <AnimatePresence>
        {mounted && !drawerOpen && (
          <motion.div
            initial={{ x: -48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -48, opacity: 0 }}
            transition={{ delay: 0.8, duration: 0.3, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 1100,
            }}
          >
            <IconButton
              onClick={openDrawer}
              aria-label="Open NATA 2026 topic navigation"
              sx={{
                width: 36,
                height: 48,
                borderRadius: '0 12px 12px 0',
                bgcolor: m3Primary[40],
                color: '#FFFFFF',
                boxShadow: '2px 2px 8px rgba(0,0,0,0.15)',
                '&:hover': { bgcolor: m3Primary[30] },
              }}
            >
              <MenuIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SwipeableDrawer */}
      <SwipeableDrawer
        anchor="left"
        open={drawerOpen}
        onOpen={openDrawer}
        onClose={closeDrawer}
        swipeAreaWidth={20}
        disableSwipeToOpen={false}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: DRAWER_WIDTH,
            bgcolor: '#FFFFFF',
          },
        }}
      >
        {/* Drawer header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            borderBottom: `1px solid ${m3Neutral[90]}`,
          }}
        >
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '0.95rem',
              color: m3Neutral[10],
            }}
          >
            NATA 2026 Topics
          </Typography>
          <IconButton onClick={closeDrawer} size="small" aria-label="Close navigation">
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {/* Back to hub */}
        <Link
          href={`/${locale}/nata-2026`}
          style={{ textDecoration: 'none', display: 'block' }}
          onClick={closeDrawer}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              height: 44,
              px: 2,
              '&:hover': { bgcolor: m3Neutral[95] },
            }}
          >
            <ArrowBackIcon sx={{ fontSize: 18, color: m3Primary[40] }} />
            <Typography
              sx={{
                fontSize: '0.82rem',
                fontWeight: 600,
                color: m3Primary[40],
              }}
            >
              Back to NATA 2026 Hub
            </Typography>
          </Box>
        </Link>

        <Divider sx={{ mx: 2, my: 0.5 }} />

        {/* Nav items */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            py: 0.5,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {spokePages.map((page) => {
            const isActive = page.slug === currentSlug;
            const IconComp = page.icon;

            return (
              <Link
                key={page.slug}
                href={`/${locale}/nata-2026/${page.slug}`}
                style={{ textDecoration: 'none', display: 'block' }}
                onClick={closeDrawer}
                aria-current={isActive ? 'page' : undefined}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    height: 52,
                    px: 2,
                    borderLeft: isActive ? `3px solid ${page.tintDark}` : '3px solid transparent',
                    bgcolor: isActive ? `${page.tint}66` : 'transparent',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: isActive ? `${page.tint}88` : m3Neutral[95],
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      minWidth: 36,
                      borderRadius: '50%',
                      bgcolor: page.tint,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IconComp sx={{ fontSize: 18, color: page.tintDark }} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: '0.85rem',
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? page.tintDark : m3Neutral[20],
                        lineHeight: 1.3,
                      }}
                    >
                      {page.title}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '0.72rem',
                        color: m3Neutral[50],
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {page.desc}
                    </Typography>
                  </Box>
                </Box>
              </Link>
            );
          })}
        </Box>
      </SwipeableDrawer>
    </>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function SpokeNavSidebar({ locale, currentSlug }: SpokeNavSidebarProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Prevent hydration mismatch — render nothing on server
  if (!hasMounted) return null;

  return isDesktop ? (
    <DesktopRail locale={locale} currentSlug={currentSlug} />
  ) : (
    <MobileNav locale={locale} currentSlug={currentSlug} />
  );
}
