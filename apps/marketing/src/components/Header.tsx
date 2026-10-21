'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import {
  AppBar,
  Typography,
  Box,
  IconButton,
  SwipeableDrawer,
  List,
  ListItemButton,
  Collapse,
  CloseIcon,
  MenuIcon,
  useScrollDirection,
  siteDarkTheme,
  siteLightTheme,
} from '@neram/ui';
import { ClickAwayListener, Fade, Paper, Popper, useMediaQuery } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ConstructionOutlinedIcon from '@mui/icons-material/ConstructionOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LanguageIcon from '@mui/icons-material/Language';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useTranslations } from 'next-intl';
import { useFirebaseAuth } from '@neram/auth';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { locales, localeLabels, type Locale } from '@/i18n';
import { tokens as tk, indicLabelSx } from '@/design-system';
import AuthButton, { AvatarRing, requestLogin, useSiteSignOut } from './AuthButton';
import BrandWordmark from './brand/BrandWordmark';
import UserNotificationBell from './UserNotificationBell';
import { useApplicationStatus } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';
import { DEMO_FLAG_EVENT, getDemoCta, readDemoActive, type DemoActiveFlag } from '@/lib/demo-cta';
import DemoHeaderChip, { isConfirmedDemoFlag } from './header/DemoHeaderChip';
import CollegesMegaMenu from '@/components/college-hub/CollegesMegaMenu';
import MegaMenuPanel, { NavBadge, isCurrent, type NavLink } from '@/components/nav/MegaMenuPanel';
import { NAV_GROUPS, groupLinks, type NavGroup } from '@/components/nav/nav-groups';
import {
  getHeaderState,
  PRIMARY_LABELS,
  SECONDARY_LABELS,
  STATUS_SENTENCES,
  type HeaderState,
  type StatusDot,
} from './header/header-state';
import { HEADER_CONTAINER, fromTier, headerTier, type HeaderTier } from './header/header-tier';
import { getHeaderTone } from './header/header-tone';

// Search (dialog + Fuse + the ~70 KB generated index) is its own chunk, fetched
// on the first open (or on hover/focus of the search button) instead of being
// shipped with the header on every page.
const loadSearchDialog = () => import('./SearchDialog');
const SearchDialog = dynamic(loadSearchDialog, { ssr: false });
// Laptops search in the header itself; same index, its own chunk.
const loadInlineSearch = () => import('./search/InlineSearch');
const InlineSearch = dynamic(loadInlineSearch, {
  ssr: false,
  loading: () => <Box sx={{ flex: '1 1 auto', maxWidth: 720, mx: 'auto', height: 44, borderRadius: `${tk.radius}px`, border: `1px solid ${tk.lineStrong}` }} />,
});

const DOT_COLOR: Record<StatusDot, string> = {
  draft: tk.statusDraft,
  review: tk.statusReview,
  done: tk.statusDone,
};

const SECONDARY_ICON = {
  freeDemo: VideocamOutlinedIcon,
  myDemo: EventAvailableOutlinedIcon,
  myEnrollment: BadgeOutlinedIcon,
} as const;

const TOOLS_HREF = '/tools';
const MORE_KEY = 'more';

function StatusDotMark({ dot }: { dot: StatusDot | null }) {
  if (!dot) return null;
  return (
    <Box
      component="span"
      aria-hidden
      sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: DOT_COLOR[dot], boxShadow: '0 0 0 2px rgba(6,13,31,0.35)' }}
    />
  );
}

function PrimaryIcon({ kind, size }: { kind: HeaderState['primary']['kind']; size: number }) {
  const Icon = kind === 'app' ? NorthEastIcon : kind === 'help' ? HelpOutlineIcon : ArrowForwardIcon;
  return <Icon aria-hidden sx={{ fontSize: size }} />;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Header() {
  const params = useParams();
  const locale = params.locale as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();

  const tone = getHeaderTone(pathname);
  const light = tone === 'light';
  const ink = light ? tk.ink : tk.paper;
  const openBg = light ? tk.surfaceHover : 'rgba(255,255,255,0.08)';
  const outlineBorder = light ? tk.lineStrong : 'rgba(245,240,232,0.24)';

  const { scrollDirection, isAtTop } = useScrollDirection();
  const { user } = useFirebaseAuth();
  const { status: appStatus } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const { signOut, signingOut } = useSiteSignOut();
  const isEnrolled = appStatus === 'enrolled' || appStatus === 'partial_payment';
  // Phones get "View fees" in the drawer; laptops find Course fees under About.
  const showFeesLink = !isEnrolled && pathname !== '/fees';

  // "Free demo", or "My demo" once one is booked. Read from a browser flag the
  // booking card writes, so no page pays for an API call.
  const [demoActive, setDemoActive] = useState<DemoActiveFlag | null>(null);
  useEffect(() => {
    setDemoActive(readDemoActive());
    const onStorage = () => setDemoActive(readDemoActive());
    window.addEventListener('storage', onStorage);
    window.addEventListener(DEMO_FLAG_EVENT, onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(DEMO_FLAG_EVENT, onStorage);
    };
  }, [pathname]);
  const demoCta = getDemoCta({ pathname, applicationStatus: appStatus, enrolled: isEnrolled, active: demoActive });
  const hs = getHeaderState({ status: appStatus, signedIn: !!user, demo: demoCta, pathname });
  const labels = PRIMARY_LABELS[hs.primary.kind];

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpenState] = useState(false);
  // Mount the dialog only after the first open; it stays mounted afterwards so
  // its close transition and recent searches keep working.
  const [searchMounted, setSearchMounted] = useState(false);
  const setSearchOpen = (next: boolean) => {
    if (next) setSearchMounted(true);
    setSearchOpenState(next);
  };
  const preloadSearch = () => {
    void loadSearchDialog();
    void loadInlineSearch();
  };
  // Laptops: the search field replaces the nav until the user is done with it.
  const [inlineSearch, setInlineSearch] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const openSearch = () => {
    if (window.matchMedia('(min-width: 900px)').matches) {
      setOpenMenu(null);
      setInlineSearch(true);
    } else {
      setSearchOpen(true);
    }
  };
  const closeInlineSearch = useCallback((restoreFocus: boolean) => {
    setInlineSearch(false);
    if (restoreFocus) window.setTimeout(() => searchButtonRef.current?.focus(), 0);
  }, []);

  // Desktop: which group's panel is open
  const [openMenu, setOpenMenu] = useState<{ key: string; anchorEl: HTMLElement } | null>(null);

  // Mobile: which group is expanded in the drawer
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const handleLocaleChange = (newLocale: Locale) => {
    router.replace(pathname, { locale: newLocale });
  };

  // Ctrl+K / Cmd+K keyboard shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // openSearch only calls state setters, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setInlineSearch(false), [pathname]);

  const closeDrawer = () => setMobileMenuOpen(false);

  // Desktop menus are non-modal: the header stays clickable above the scrim, so
  // another trigger swaps the open menu in one click.
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusPanelOnOpen = useRef(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const handleMenuOpen = (key: string, event: React.MouseEvent<HTMLElement>) => {
    // detail is 0 when the click came from Enter or Space.
    focusPanelOnOpen.current = event.detail === 0;
    setOpenMenu({ key, anchorEl: event.currentTarget });
  };

  const handleMenuClose = () => setOpenMenu(null);

  const openKey = openMenu?.key ?? null;
  useEffect(() => {
    if (!openKey) return;
    if (focusPanelOnOpen.current) {
      focusPanelOnOpen.current = false;
      requestAnimationFrame(() => {
        document.getElementById(`nav-panel-${openKey}`)?.querySelector<HTMLElement>('a[href], input, button')?.focus();
      });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpenMenu(null);
      triggerRefs.current[openKey]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openKey]);

  useEffect(() => setOpenMenu(null), [pathname]);

  // Width tiers are CSS container queries; this only closes an open panel when
  // the tier changes, since its trigger may have moved into (or out of) More.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let tier: HeaderTier = headerTier(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(() => {
      const next = headerTier(el.getBoundingClientRect().width);
      if (next !== tier) {
        tier = next;
        setOpenMenu(null);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleClickAway = (event: MouseEvent | TouchEvent) => {
    // A trigger click is handled by the trigger itself (toggle or swap).
    const target = event.target as Node;
    if (Object.values(triggerRefs.current).some((el) => el?.contains(target))) return;
    setOpenMenu(null);
  };

  const toggleMobileGroup = (key: string) => setExpandedGroup((prev) => (prev === key ? null : key));

  // Active = the group's own columns, not its shortcut cards and footer link:
  // Colleges and Exam Hub also point at counselling and /tools pages, which
  // lit up two nav items at once.
  const isGroupActive = (group: NavGroup) => {
    if (group.key === 'colleges') return /^\/colleges(\/|$)/.test(pathname);
    if (group.key === 'counseling') return /^\/counseling(\/|$)/.test(pathname);
    const own: NavLink[] =
      group.variant === 'cards'
        ? group.aside?.cards ?? []
        : group.columns.flatMap((col) => [...col.links, ...(col.more ? [col.more] : [])]);
    return own.some((link) => {
      const href = link.href.split(/[?#]/)[0];
      if (href.startsWith('/colleges')) return false; // Colleges owns those
      return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
    });
  };
  const toolsActive = pathname === TOOLS_HREF || pathname.startsWith(`${TOOLS_HREF}/`);
  const moreActive = toolsActive || NAV_GROUPS.some((g) => g.inMore && isGroupActive(g));

  // ─── Shared styles ──────────────────────────────────────────────────────
  const focus = { '&:focus-visible': { outline: tk.focusOutline, outlineOffset: 2 } } as const;

  const navItemSx = (on: boolean, open: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    height: 44,
    px: '10px',
    border: 0,
    borderRadius: `${tk.radius}px`,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    font: 'inherit',
    fontSize: 15,
    fontWeight: on || open ? 600 : 500,
    color: ink,
    opacity: on || open ? 1 : 0.82,
    bgcolor: open ? openBg : 'transparent',
    // Active: a straight 2px gold rule along the bottom (an inset shadow would follow the radius).
    position: 'relative',
    ...(on && { '&::after': { content: '""', position: 'absolute', left: 10, right: 10, bottom: 0, height: 2, bgcolor: tk.gold500 } }),
    textDecoration: 'none',
    transition: 'opacity 150ms ease, background-color 150ms ease',
    '&:hover': { opacity: 1, bgcolor: openBg },
    ...focus,
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  });

  const chevronSx = (open: boolean) => ({
    fontSize: 18,
    transition: 'transform 200ms ease',
    transform: open ? 'rotate(180deg)' : 'none',
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  });

  const iconButtonSx = {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: `${tk.radius}px`,
    color: ink,
    '&:hover': { bgcolor: openBg },
    '&.Mui-focusVisible': { outline: tk.focusOutline, outlineOffset: 2 },
  } as const;

  const ghost = hs.primary.ghost;
  const primarySx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 1,
    height: 44,
    px: 2,
    flexShrink: 0,
    boxSizing: 'border-box',
    borderRadius: `${tk.radius}px`,
    border: ghost ? `1px solid ${outlineBorder}` : 0,
    bgcolor: ghost ? 'transparent' : tk.gold500,
    color: ghost ? ink : tk.navy900,
    font: 'inherit',
    fontSize: 14,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms ease, border-color 150ms ease',
    '&:hover': ghost ? { borderColor: tk.gold500 } : { bgcolor: tk.gold300 },
    ...focus,
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  } as const;

  // ─── Pieces ─────────────────────────────────────────────────────────────

  /** The primary action as a link, or a button for Go to App (SSO hand-off). */
  const renderPrimary = (sx: object, children: React.ReactNode, onDone?: () => void) =>
    hs.primary.href ? (
      <Box component={Link} href={hs.primary.href as '/apply'} onClick={onDone} sx={sx}>
        {children}
      </Box>
    ) : (
      <Box component="button" type="button" onClick={() => { onDone?.(); goToApp(); }} sx={sx}>
        {children}
      </Box>
    );

  const SecondaryIcon = hs.secondary ? SECONDARY_ICON[hs.secondary.kind] : null;
  const secondaryLabel = hs.secondary ? t(`header.${SECONDARY_LABELS[hs.secondary.kind]}`) : '';

  const panelPaperSx = {
    borderRadius: `${tk.radius}px`,
    border: `1px solid ${tk.line}`,
    bgcolor: tk.surface,
    color: tk.ink,
    backgroundImage: 'none',
    boxShadow: tk.shadowMegaMenu,
    overflowX: 'hidden',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - var(--broadcast-banner-height, 0px) - 88px)',
    maxWidth: '94vw',
  } as const;

  const renderPopper = (key: string, panel: React.ReactNode) => {
    const isOpen = openMenu?.key === key;
    return (
      // Rendered right after its trigger (no portal) so Tab moves from the
      // trigger into the panel, and the panel sits above the scrim.
      <Popper
        open={isOpen}
        anchorEl={isOpen ? openMenu?.anchorEl : null}
        placement="bottom-start"
        disablePortal
        transition
        modifiers={[
          { name: 'offset', options: { offset: [0, 10] } },
          { name: 'preventOverflow', options: { padding: 16 } },
          { name: 'flip', enabled: false },
        ]}
        sx={{ zIndex: 1 }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={reduceMotion ? 0 : 160} easing="cubic-bezier(0, 0, 0.2, 1)">
            <div>
              <ClickAwayListener onClickAway={handleClickAway}>
                <Paper id={`nav-panel-${key}`} elevation={0} sx={panelPaperSx}>
                  {panel}
                </Paper>
              </ClickAwayListener>
            </div>
          </Fade>
        )}
      </Popper>
    );
  };

  const moreLinks: { title: string; links: NavLink[] }[] = [
    ...NAV_GROUPS.filter((g) => g.inMore).map((g) => ({
      title: t(`nav.${g.labelKey}`),
      links: [...(g.footer ? [g.footer.cta] : []), ...(g.aside?.cards ?? []).map(({ label, href, badge }) => ({ label, href, badge }))],
    })),
    { title: t('header.freeTools'), links: [{ label: t('header.freeTools'), href: TOOLS_HREF }] },
  ];

  const morePanel = (
    <Box component="section" aria-label={`${t('header.more')} menu`} sx={{ width: 'min(340px, 94vw)', py: 1.5 }}>
      {moreLinks.map((group) => (
        <Box component="nav" key={group.title} aria-label={group.title} sx={{ px: 1.5, py: 1, '& + &': { borderTop: `1px solid ${tk.line}` } }}>
          <Typography component="h2" sx={{ m: 0, mb: 0.5, mx: 1.5, fontFamily: tk.fontMono, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: tk.gold800, ...indicLabelSx }}>
            {group.title}
          </Typography>
          {group.links.map((l) => {
            const on = isCurrent(pathname, l.href);
            return (
              <Box
                key={l.href + l.label}
                component={Link}
                href={l.href as any}
                onClick={handleMenuClose}
                aria-current={on ? 'page' : undefined}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  minHeight: 44,
                  px: 1.5,
                  borderRadius: `${tk.radius}px`,
                  color: tk.ink,
                  bgcolor: on ? tk.surfaceHover : 'transparent',
                  fontSize: '0.9375rem',
                  fontWeight: on ? 700 : 500,
                  textDecoration: 'none',
                  '&:hover': { bgcolor: tk.surfaceHover },
                  '&:focus-visible': { outline: tk.focusOutline, outlineOffset: -2 },
                }}
              >
                {l.label}
                {l.badge && <NavBadge label={l.badge} />}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );

  const hideBelowCompact = { display: 'none', [fromTier('compact')]: { display: 'inline-flex' } };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          top: 'var(--broadcast-banner-height, 0px)',
          transform:
            scrollDirection === 'down' && !isAtTop && !mobileMenuOpen && !openMenu ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), top 200ms ease',
          bgcolor: light ? tk.surface : tk.navy900,
          color: ink,
          backgroundImage: 'none',
          boxShadow: 'none',
          borderRadius: 0,
          borderBottom: `1px solid ${light ? tk.line : tk.lineDark}`,
          fontFamily: tk.fontSans,
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <ThemeProvider theme={light ? siteLightTheme : siteDarkTheme}>
          {/* Full width up to 1680px, so the logo sits at the far left on laptops.
              The container is what the width tiers measure. */}
          <Box
            ref={containerRef}
            sx={{
              containerType: 'inline-size',
              containerName: HEADER_CONTAINER,
              position: 'relative',
              width: '100%',
              maxWidth: 1680,
              mx: 'auto',
              boxSizing: 'border-box',
            }}
          >
            {/* ── Laptop bar: Brand | Nav | Actions | Account ── */}
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5, height: 64, px: 3 }}>
              <Box
                component={Link}
                href="/"
                aria-label="Neram Classes home"
                sx={{ display: 'flex', flexShrink: 0, mr: 2, color: ink, textDecoration: 'none', borderRadius: `${tk.radius}px`, ...focus }}
              >
                <BrandWordmark tone={tone} />
              </Box>

              <Box
                component="nav"
                aria-label="Main"
                sx={{ flex: 1, minWidth: 0, display: inlineSearch ? 'none' : 'flex', alignItems: 'center', height: 44 }}
              >
                {NAV_GROUPS.map((group) => {
                  const isOpen = openMenu?.key === group.key;
                  const on = isGroupActive(group);
                  return (
                    <Box key={group.key} sx={{ display: 'contents' }}>
                      <Box
                        component="button"
                        type="button"
                        ref={(el: HTMLButtonElement | null) => { triggerRefs.current[group.key] = el; }}
                        aria-expanded={isOpen}
                        aria-controls={`nav-panel-${group.key}`}
                        onClick={(e: React.MouseEvent<HTMLElement>) => (isOpen ? handleMenuClose() : handleMenuOpen(group.key, e))}
                        sx={{ ...navItemSx(on, isOpen), ...(group.inMore ? hideBelowCompact : {}) }}
                      >
                        {t(`nav.${group.labelKey}`)}
                        <KeyboardArrowDownIcon aria-hidden sx={chevronSx(isOpen)} />
                      </Box>
                      {renderPopper(
                        group.key,
                        group.key === 'colleges' ? (
                          <CollegesMegaMenu columns={group.columns} aside={group.aside} footer={group.footer} pathname={pathname} onNavigate={handleMenuClose} />
                        ) : (
                          <MegaMenuPanel
                            label={t(`nav.${group.labelKey}`)}
                            columns={group.columns}
                            aside={group.aside}
                            footer={group.footer}
                            variant={group.variant}
                            pathname={pathname}
                            onNavigate={handleMenuClose}
                          />
                        ),
                      )}
                    </Box>
                  );
                })}

                <Box component={Link} href={TOOLS_HREF} aria-current={toolsActive ? 'page' : undefined} sx={{ ...navItemSx(toolsActive, false), ...hideBelowCompact }}>
                  {t('header.freeTools')}
                </Box>

                {/* 900 to 1059px: Counseling, About and Free Tools move in here. */}
                <Box
                  component="button"
                  type="button"
                  ref={(el: HTMLButtonElement | null) => { triggerRefs.current[MORE_KEY] = el; }}
                  aria-expanded={openMenu?.key === MORE_KEY}
                  aria-controls={`nav-panel-${MORE_KEY}`}
                  onClick={(e: React.MouseEvent<HTMLElement>) => (openMenu?.key === MORE_KEY ? handleMenuClose() : handleMenuOpen(MORE_KEY, e))}
                  sx={{ ...navItemSx(moreActive, openMenu?.key === MORE_KEY), [fromTier('compact')]: { display: 'none' } }}
                >
                  {t('header.more')}
                  <KeyboardArrowDownIcon aria-hidden sx={chevronSx(openMenu?.key === MORE_KEY)} />
                </Box>
                {renderPopper(MORE_KEY, morePanel)}
              </Box>

              {inlineSearch && <InlineSearch onClose={closeInlineSearch} />}

              {!inlineSearch && (
                <IconButton
                  ref={searchButtonRef}
                  onClick={openSearch}
                  onPointerEnter={preloadSearch}
                  onFocus={preloadSearch}
                  aria-label={t('header.search')}
                  title={`${t('header.search')} (Ctrl K)`}
                  aria-keyshortcuts="Control+K Meta+K"
                  sx={iconButtonSx}
                >
                  <SearchIcon sx={{ fontSize: 22 }} />
                </IconButton>
              )}

              {hs.secondary && SecondaryIcon && (() => {
                const link = (
                <Box
                  component={Link}
                  href={hs.secondary.href as '/demo-class'}
                  title={secondaryLabel}
                  aria-label={secondaryLabel}
                  aria-current={isCurrent(pathname, hs.secondary.href) ? 'page' : undefined}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    height: 44,
                    minWidth: 44,
                    px: '11px',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                    border: `1px solid ${outlineBorder}`,
                    borderRadius: `${tk.radius}px`,
                    color: ink,
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    textDecoration: 'none',
                    transition: 'border-color 150ms ease',
                    '&:hover': { borderColor: tk.gold500 },
                    ...focus,
                    [fromTier('full')]: { px: '14px' },
                  }}
                >
                  <SecondaryIcon aria-hidden sx={{ fontSize: 20 }} />
                  <Box component="span" sx={{ display: 'none', [fromTier('full')]: { display: 'inline' } }}>
                    {secondaryLabel}
                  </Box>
                </Box>
                );
                return hs.secondary.kind === 'myDemo' && isConfirmedDemoFlag(demoActive) ? (
                  <DemoHeaderChip flag={demoActive} variant="bar" light={light} label={secondaryLabel} signedIn={!!user} fallback={link} />
                ) : (
                  link
                );
              })()}

              {renderPrimary(
                { ...primarySx, ml: 0.5 },
                <>
                  <StatusDotMark dot={hs.dot} />
                  {labels.full === labels.compact ? (
                    t(`header.${labels.full}`)
                  ) : (
                    <>
                      <Box component="span" sx={{ [fromTier('full')]: { display: 'none' } }}>{t(`header.${labels.compact}`)}</Box>
                      <Box component="span" sx={{ display: 'none', [fromTier('full')]: { display: 'inline' } }}>{t(`header.${labels.full}`)}</Box>
                    </>
                  )}
                  <PrimaryIcon kind={hs.primary.kind} size={18} />
                </>,
              )}

              <UserNotificationBell tone={tone} />
              <AuthButton tone={tone} goldRing={hs.goldRing} />
            </Box>

            {/* ── Phone bar: wordmark, search, short primary, menu ── */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 0.5, height: 56, pl: 2, pr: 1 }}>
              <Box
                component={Link}
                href="/"
                aria-label="Neram Classes home"
                sx={{ display: 'flex', flexShrink: 0, color: ink, textDecoration: 'none', borderRadius: `${tk.radius}px`, ...focus }}
              >
                <BrandWordmark size="sm" tone={tone} />
              </Box>
              <Box sx={{ flex: 1 }} />
              <IconButton onClick={() => setSearchOpen(true)} onPointerEnter={preloadSearch} aria-label={t('header.search')} sx={iconButtonSx}>
                <SearchIcon sx={{ fontSize: 22 }} />
              </IconButton>
              {hs.secondary?.kind === 'myDemo' && isConfirmedDemoFlag(demoActive) && (
                <DemoHeaderChip flag={demoActive} variant="phone" light={light} label={secondaryLabel} signedIn={!!user} fallback={null} />
              )}
              {renderPrimary(
                { ...primarySx, px: 1.75, gap: 0.75 },
                <>
                  <StatusDotMark dot={hs.dot} />
                  {t(`header.${labels.short}`)}
                </>,
              )}
              <IconButton
                aria-label={t('header.openMenu')}
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(true)}
                sx={iconButtonSx}
              >
                <MenuIcon />
              </IconButton>
            </Box>
          </Box>
        </ThemeProvider>
      </AppBar>

      {/* ── Phone drawer: account, actions, nav, language ── */}
      <SwipeableDrawer
        anchor="right"
        open={mobileMenuOpen}
        onOpen={() => setMobileMenuOpen(true)}
        onClose={closeDrawer}
        PaperProps={{ sx: { width: 'min(380px, 100vw)', bgcolor: tk.surface, color: tk.ink, backgroundImage: 'none' } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, pl: 2, pr: 1, borderBottom: `1px solid ${tk.line}` }}>
          <BrandWordmark size="sm" tone="light" />
          <IconButton onClick={closeDrawer} aria-label={t('header.closeMenu')} sx={{ ...iconButtonSx, color: tk.ink, '&:hover': { bgcolor: tk.surfaceHover } }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Account card first, then the two actions full width */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, bgcolor: tk.ground, borderBottom: `1px solid ${tk.line}` }}>
          {user ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <AvatarRing name={user.name || user.email || 'User'} avatar={user.avatar} goldRing={hs.goldRing} tone="light" />
              <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: tk.ink }} noWrap>
                  {user.name || user.email}
                </Typography>
                {STATUS_SENTENCES[hs.key] && (
                  <Typography component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: tk.inkMuted }}>
                    <StatusDotMark dot={hs.dot} />
                    {t(`header.${STATUS_SENTENCES[hs.key]}`)}
                  </Typography>
                )}
              </Box>
              <Box sx={{ color: tk.ink }}>
                <UserNotificationBell tone="light" />
              </Box>
            </Box>
          ) : (
            <Box
              component="button"
              type="button"
              onClick={() => { closeDrawer(); requestLogin(); }}
              sx={{ alignSelf: 'flex-start', minHeight: 44, p: 0, border: 0, bgcolor: 'transparent', color: tk.ink, font: 'inherit', fontSize: 15, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px', cursor: 'pointer', ...focus }}
            >
              {t('header.logInToSee')}
            </Box>
          )}

          {renderPrimary(
            {
              ...primarySx,
              display: 'flex',
              justifyContent: 'space-between',
              height: 'auto',
              minHeight: 52,
              fontSize: 16,
              ...(ghost && { bgcolor: tk.surface, color: tk.ink, border: `1px solid ${tk.ink}` }),
            },
            <>
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StatusDotMark dot={hs.dot} />
                {t(`header.${labels.full}`)}
              </Box>
              <PrimaryIcon kind={hs.primary.kind} size={20} />
            </>,
            closeDrawer,
          )}

          {hs.secondary && SecondaryIcon && (
            <Box
              component={Link}
              href={hs.secondary.href as '/demo-class'}
              onClick={closeDrawer}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 48, px: 2, boxSizing: 'border-box', border: `1px solid ${tk.ink}`, borderRadius: `${tk.radius}px`, color: tk.ink, fontSize: 15, fontWeight: 600, textDecoration: 'none', '&:hover': { bgcolor: tk.navy900, color: tk.paper, borderColor: tk.navy900 }, ...focus }}
            >
              <SecondaryIcon aria-hidden sx={{ fontSize: 20 }} />
              {hs.secondary.kind === 'freeDemo' ? t('header.freeDemoClass') : secondaryLabel}
            </Box>
          )}

          {showFeesLink && (
            <Box
              component={Link}
              href="/fees"
              onClick={closeDrawer}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 48, px: 2, boxSizing: 'border-box', border: `1px solid ${tk.lineStrong}`, borderRadius: `${tk.radius}px`, bgcolor: tk.surface, color: tk.ink, fontSize: 15, fontWeight: 600, textDecoration: 'none', '&:hover': { borderColor: tk.gold500 }, ...focus }}
            >
              <CurrencyRupeeIcon aria-hidden sx={{ fontSize: 20 }} />
              {t('header.viewFees')}
            </Box>
          )}
        </Box>

        {/* Nav groups as 52px rows */}
        <List disablePadding sx={{ flexGrow: 1 }}>
          {NAV_GROUPS.map((group) => {
            const isOpen = expandedGroup === group.key;
            const on = isGroupActive(group);
            return (
              <Box key={group.key} sx={{ borderBottom: `1px solid ${tk.line}` }}>
                <ListItemButton
                  onClick={() => toggleMobileGroup(group.key)}
                  aria-expanded={isOpen}
                  sx={{ minHeight: 52, px: 2, gap: 1.5, boxShadow: on ? `inset 3px 0 0 ${tk.gold500}` : 'none' }}
                >
                  <Box component="span" sx={{ display: 'flex', color: tk.inkMuted }}>{group.icon}</Box>
                  <Box component="span" sx={{ flex: 1, fontSize: 16, fontWeight: 600, color: tk.ink }}>{t(`nav.${group.labelKey}`)}</Box>
                  <KeyboardArrowDownIcon aria-hidden sx={{ ...chevronSx(isOpen), fontSize: 20, color: tk.inkMuted }} />
                </ListItemButton>

                <Collapse in={isOpen} timeout={reduceMotion ? 0 : 200}>
                  <List disablePadding sx={{ bgcolor: tk.ground, pb: 1 }}>
                    {groupLinks(group).map((link) => {
                      const linkOn = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                      return (
                        <ListItemButton
                          key={`${link.href}|${link.label}`}
                          component={Link}
                          href={link.href as any}
                          onClick={closeDrawer}
                          selected={linkOn}
                          sx={{
                            minHeight: 44,
                            pl: 6.5,
                            gap: 1,
                            fontSize: 15,
                            color: tk.ink,
                            fontWeight: linkOn ? 700 : 400,
                            '&.Mui-selected, &.Mui-selected:hover': { bgcolor: tk.surfaceHover },
                          }}
                        >
                          {link.label}
                          {link.badge && <NavBadge label={link.badge} />}
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            );
          })}

          <ListItemButton
            component={Link}
            href={TOOLS_HREF}
            onClick={closeDrawer}
            selected={toolsActive}
            sx={{ minHeight: 52, px: 2, gap: 1.5, borderBottom: `1px solid ${tk.line}`, boxShadow: toolsActive ? `inset 3px 0 0 ${tk.gold500}` : 'none', '&.Mui-selected, &.Mui-selected:hover': { bgcolor: tk.surface } }}
          >
            <ConstructionOutlinedIcon aria-hidden sx={{ fontSize: 20, color: tk.inkMuted }} />
            <Box component="span" sx={{ flex: 1, fontSize: 16, fontWeight: 600, color: tk.ink }}>{t('header.freeTools')}</Box>
            <ChevronRightIcon aria-hidden sx={{ fontSize: 20, color: tk.inkMuted }} />
          </ListItemButton>
        </List>

        {/* Language, then sign out */}
        <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 14, color: tk.inkMuted }}>
            <LanguageIcon aria-hidden sx={{ fontSize: 20 }} />
            {t('header.language')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {locales.map((loc) => {
              const on = loc === locale;
              return (
                <Box
                  key={loc}
                  component="button"
                  type="button"
                  aria-pressed={on}
                  onClick={() => { handleLocaleChange(loc); closeDrawer(); }}
                  sx={{
                    minHeight: 44,
                    px: 1.75,
                    borderRadius: `${tk.radiusPill}px`,
                    border: `1px solid ${on ? tk.navy900 : tk.lineStrong}`,
                    bgcolor: on ? tk.navy900 : tk.surface,
                    color: on ? tk.paper : tk.ink,
                    font: 'inherit',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    ...focus,
                  }}
                >
                  {localeLabels[loc]}
                </Box>
              );
            })}
          </Box>
          {user && (
            <Box
              component="button"
              type="button"
              onClick={() => { void signOut(); }}
              disabled={signingOut}
              sx={{ alignSelf: 'flex-start', minHeight: 44, px: 0, border: 0, bgcolor: 'transparent', color: tk.inkMuted, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', ...focus }}
            >
              {t('header.signOut')}
            </Box>
          )}
        </Box>
      </SwipeableDrawer>

      {/* Laptops: dim the page under an open menu. It starts below the header, so
          the header stays sharp and another menu is one click away. */}
      <Fade in={!!openMenu} timeout={reduceMotion ? 0 : { enter: 200, exit: 150 }} unmountOnExit>
        <Box
          data-testid="nav-scrim"
          aria-hidden
          onClick={handleMenuClose}
          sx={{
            display: { xs: 'none', md: 'block' },
            position: 'fixed',
            top: 'calc(var(--broadcast-banner-height, 0px) + 64px)',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: (theme) => theme.zIndex.appBar - 1,
            bgcolor: 'rgba(6,13,31,0.4)',
          }}
        />
      </Fade>

      {searchMounted && <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />}
      {/* Spacer under the fixed bar */}
      <Box aria-hidden sx={{ height: { xs: 56, md: 64 }, mt: 'var(--broadcast-banner-height, 0px)' }} />
    </>
  );
}
