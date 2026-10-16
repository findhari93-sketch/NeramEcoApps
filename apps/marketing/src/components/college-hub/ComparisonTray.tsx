'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Snackbar, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { COMPARE_MAX } from '@/lib/college-hub/constants';
import { COMPARE_LIMIT_EVENT, compareHref, useCompareList } from '@/lib/college-hub/compare-store';
import { initials } from '@/lib/college-hub/format';
import { ctaButtonSx, traySx } from './directory/hub-styles';
import { isHubRoute } from './hub-routes';
import { tokens } from '@/design-system';
import { alpha } from '@mui/material/styles';

/**
 * Compare tray, mounted once by SiteChrome (canvas: compare tray in the list
 * views and Mobile · Results). Laptop: a slim, dimmed pill that opens into the
 * full bar (named chips, empty slots) on hover or focus, and briefly whenever a
 * college is added. Its Compare button keeps the same spot in both states.
 * Phone: a floating bar with initials that sits above the hub bottom nav.
 */
export default function ComparisonTray() {
  const pathname = usePathname() ?? '';
  const { list, count, remove, clear } = useCompareList();
  const [limitName, setLimitName] = useState<string | null>(null);

  // Laptop tray: open while hovered or focused, and for a moment after each add.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [flash, setFlash] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCount = useRef(count);
  useEffect(() => {
    const added = count > prevCount.current;
    prevCount.current = count;
    if (!added) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 2500);
    return () => clearTimeout(id);
  }, [count]);
  useEffect(() => () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);
  const open = hovered || focused || flash;

  useEffect(() => {
    const onLimit = (e: Event) => setLimitName((e as CustomEvent<{ name: string }>).detail?.name ?? '');
    window.addEventListener(COMPARE_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(COMPARE_LIMIT_EVENT, onLimit);
  }, []);

  const onComparePage = /\/colleges\/compare\/?$/.test(pathname);
  const hub = isHubRoute(pathname);
  const href = compareHref(list);
  const cta = count > 1 ? `Compare ${count} colleges` : 'Add 1 more to compare';

  const snackbar = (
    <Snackbar
      open={limitName !== null}
      autoHideDuration={6000}
      onClose={() => setLimitName(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      message={
        <span>
          <b>You can compare up to {COMPARE_MAX} colleges.</b> {limitName ? `Remove one to add ${limitName}.` : 'Remove one to add another.'}
        </span>
      }
      action={
        <Box component={Link} href={href} onClick={() => setLimitName(null)} sx={{ color: 'inherit', fontWeight: 700, px: 1, minHeight: 44, display: 'flex', alignItems: 'center' }}>
          Manage list
        </Box>
      }
    />
  );

  if (count === 0 || onComparePage) return snackbar;

  return (
    <>
      {snackbar}

      {/* Desktop and tablet */}
      <Box
        component="aside"
        aria-label="Compare tray"
        data-testid="compare-tray"
        data-open={open ? 'true' : 'false'}
        onMouseEnter={() => {
          if (leaveTimer.current) clearTimeout(leaveTimer.current);
          setHovered(true);
        }}
        onMouseLeave={() => {
          // A short grace period so a cursor slipping off the edge does not fold it.
          leaveTimer.current = setTimeout(() => setHovered(false), 300);
        }}
        onFocus={() => setFocused(true)}
        onBlur={(e: React.FocusEvent<HTMLElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
        // Touch laptops have no hover: a tap opens it.
        onClick={() => setHovered(true)}
        sx={{
          ...traySx,
          display: { xs: 'none', md: 'flex' },
          position: 'fixed',
          zIndex: 1200,
          bottom: 16,
          // The right edge stays put (left of the chat button), so Compare never moves; it opens leftward.
          right: 112,
          maxWidth: 'min(1080px, calc(100% - 136px))',
          boxSizing: 'border-box',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: open ? '12px 16px' : 1.5,
          // Same padding open or folded: Compare's bottom-right corner never moves, even when the open bar wraps.
          py: 0.75,
          pr: 0.75,
          pl: open ? 2.5 : 1.25,
          borderRadius: open ? 1 : `${tokens.radiusPill}px`,
          opacity: open ? 1 : 0.65,
          boxShadow: open ? `0 12px 32px ${alpha(tokens.navy900, 0.28)}` : `0 6px 16px ${alpha(tokens.navy900, 0.18)}`,
          transition: 'opacity 200ms ease, box-shadow 200ms ease',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        {open ? (
          <>
          <Typography sx={{ m: 0, fontSize: '0.88rem', color: tokens.paperMuted }}>
            <Box component="b" sx={{ fontSize: '1rem', color: tokens.paper }}>
              {count} of {COMPARE_MAX}
            </Box>{' '}
            added
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1, flex: '1 1 360px', animation: 'trayIn 160ms ease-out', '@keyframes trayIn': { from: { opacity: 0 }, to: { opacity: 1 } }, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}>
            {list.map((e) => (
              <Box component="li" key={e.slug} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: 40, pl: 1.5, pr: 0.5, borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.navy800, fontSize: '0.84rem', fontWeight: 600 }}>
                {e.shortName}
                <Box
                  component="button"
                  type="button"
                  aria-label={`Remove ${e.shortName} from compare`}
                  onClick={() => remove(e.slug)}
                  sx={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: '50%', bgcolor: 'transparent', color: tokens.paperMuted, cursor: 'pointer', '&:hover': { bgcolor: tokens.navy700 }, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
                >
                  <CloseIcon aria-hidden sx={{ fontSize: 16 }} />
                </Box>
              </Box>
            ))}
            {Array.from({ length: COMPARE_MAX - count }).map((_, i) => (
              <Box component="li" key={`slot-${i}`} sx={{ display: 'flex', alignItems: 'center', height: 40, px: 1.75, boxSizing: 'border-box', borderRadius: `${tokens.radiusPill}px`, border: '1px dashed', borderColor: tokens.outlineDark, fontSize: '0.84rem', color: tokens.paperSubtle }}>
                Add a college
              </Box>
            ))}
          </Box>
          <Box
            component="button"
            type="button"
            onClick={clear}
            sx={{ height: 44, px: 1.75, border: 0, bgcolor: 'transparent', color: tokens.paperMuted, font: 'inherit', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', borderRadius: 1, '&:hover': { color: tokens.paper }, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
          >
            Clear
          </Box>
          </>
        ) : (
          <>
            <Box component="ul" aria-hidden sx={{ listStyle: 'none', m: 0, p: 0, pl: 0.75, display: 'flex' }}>
              {list.map((e) => (
                <Box component="li" key={e.slug} sx={{ width: 30, height: 30, ml: -0.75, boxSizing: 'border-box', borderRadius: '50%', border: '2px solid', borderColor: tokens.navy900, bgcolor: tokens.navy700, color: tokens.paper, fontSize: '0.66rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {initials(e.shortName)}
                </Box>
              ))}
            </Box>
            <Box component="span" sx={{ fontSize: '0.88rem', fontWeight: 600, color: tokens.paper, whiteSpace: 'nowrap' }}>
              {count} of {COMPARE_MAX} added
            </Box>
          </>
        )}
        <CompareCta href={href} enabled={count > 1} label={cta} />
      </Box>

      {/* Phone */}
      <Box
        component="aside"
        aria-label="Compare tray"
        data-testid="compare-tray"
        sx={{
          ...traySx,
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          zIndex: 1200,
          left: 12,
          right: 12,
          bottom: hub ? 'calc(76px + env(safe-area-inset-bottom))' : 'calc(12px + env(safe-area-inset-bottom))',
          alignItems: 'center',
          gap: 1.25,
          height: 56,
          pl: 1.25,
          pr: 0.75,
          boxSizing: 'border-box',
          borderRadius: 1,
          boxShadow: `0 10px 28px ${alpha(tokens.navy900, 0.32)}`,
        }}
      >
        <Box component="ul" aria-hidden sx={{ listStyle: 'none', m: 0, p: 0, pl: 0.75, display: 'flex' }}>
          {list.map((e) => (
            <Box component="li" key={e.slug} sx={{ width: 30, height: 30, ml: -0.75, boxSizing: 'border-box', borderRadius: '50%', border: '2px solid', borderColor: tokens.navy900, bgcolor: tokens.navy700, color: tokens.paper, fontSize: '0.66rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {initials(e.shortName)}
            </Box>
          ))}
        </Box>
        <Box component="span" sx={{ flex: '1 1 auto', fontSize: '0.9rem', fontWeight: 600 }}>
          {count} of {COMPARE_MAX} added
        </Box>
        <Box
          component="button"
          type="button"
          onClick={clear}
          aria-label="Clear compare list"
          sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, bgcolor: 'transparent', color: tokens.paperMuted, cursor: 'pointer', borderRadius: '50%', '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
        >
          <CloseIcon aria-hidden sx={{ fontSize: 20 }} />
        </Box>
        <CompareCta href={href} enabled={count > 1} label={count > 1 ? 'Compare' : 'Add 1 more'} compact />
      </Box>
    </>
  );
}

function CompareCta({ href, enabled, label, compact }: { href: string; enabled: boolean; label: string; compact?: boolean }) {
  const sx = {
    ...ctaButtonSx,
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    height: 44,
    px: compact ? 2 : 2.5,
    borderRadius: 1,
    fontSize: '0.94rem',
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
    '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 },
  };
  if (!enabled) {
    return (
      <Box component="span" aria-disabled="true" sx={{ ...sx, bgcolor: tokens.navy700, color: tokens.paperMuted, cursor: 'default', '&:hover': undefined }}>
        {label}
      </Box>
    );
  }
  return (
    <Box component={Link} href={href} sx={sx}>
      {label}
      <ArrowForwardIcon aria-hidden sx={{ fontSize: 18 }} />
    </Box>
  );
}
