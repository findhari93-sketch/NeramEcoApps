'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  SwipeableDrawer,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  Tooltip,
  MenuIcon,
  CloseIcon,
  HelpOutlineIcon,
  useScrollDirection,
  ListItemIcon,
  Collapse,
} from '@neram/ui';
import { ClickAwayListener, Fade, Paper, Popper, useMediaQuery } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import CastForEducationOutlinedIcon from '@mui/icons-material/CastForEducationOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import SearchIcon from '@mui/icons-material/Search';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import SchoolIcon from '@mui/icons-material/School';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { locales, localeLabels, type Locale } from '@/i18n';
import { useTranslations } from 'next-intl';
import AuthButton from './AuthButton';
import BrandWordmark from './brand/BrandWordmark';
import UserNotificationBell from './UserNotificationBell';
// Search (dialog + Fuse + the ~70 KB generated index) is its own chunk, fetched
// on the first open (or on hover/focus of the search button) instead of being
// shipped with the header on every page.
const loadSearchDialog = () => import('./SearchDialog');
const SearchDialog = dynamic(loadSearchDialog, { ssr: false });
// Laptops search in the header itself; same index, its own chunk.
const loadInlineSearch = () => import('./search/InlineSearch');
const InlineSearch = dynamic(loadInlineSearch, {
  ssr: false,
  loading: () => <Box sx={{ flex: '1 1 auto', maxWidth: 720, mx: 'auto', height: 44, borderRadius: 22, border: '1.5px solid', borderColor: 'primary.main' }} />,
});
import { useApplicationStatus, type AppStatusSummary } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';
import { getDemoCta, readDemoActive, type DemoActiveFlag } from '@/lib/demo-cta';
import CollegesMegaMenu from '@/components/college-hub/CollegesMegaMenu';
import MegaMenuPanel, { NavBadge, type NavAside, type NavColumn, type NavFooter, type NavLink } from '@/components/nav/MegaMenuPanel';
import HeaderCtaPill from './HeaderCtaPill';

// ─── CTA config (unchanged) ────────────────────────────────────────────────

function getCtaConfig(status: AppStatusSummary, t: ReturnType<typeof useTranslations>) {
  switch (status) {
    case 'enrolled':
    case 'partial_payment':
      return {
        label: t('header.goToApp'),
        href: null as null,
        variant: 'contained' as const,
        sx: {
          bgcolor: '#2E7D32',
          color: '#fff',
          '&:hover': { bgcolor: '#1B5E20', boxShadow: 2 },
        },
      };
    case 'approved':
      return {
        label: t('header.payAndJoin'),
        href: '/apply' as const,
        variant: 'contained' as const,
        sx: {
          bgcolor: '#2E7D32',
          color: '#fff',
          animation: 'ctaPulse 2s ease-in-out infinite',
          '@keyframes ctaPulse': {
            '0%, 100%': { boxShadow: '0 0 0 0 rgba(46,125,50,0.4)' },
            '50%': { boxShadow: '0 0 0 8px rgba(46,125,50,0)' },
          },
          '&:hover': { bgcolor: '#1B5E20', boxShadow: 2 },
        },
      };
    case 'draft':
      return {
        label: t('header.continueApplication'),
        href: '/apply' as const,
        variant: 'outlined' as const,
        sx: {
          color: 'white',
          borderColor: 'rgba(255,255,255,0.6)',
          '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
        },
      };
    case 'submitted':
    case 'under_review':
    case 'pending_verification':
      return {
        label: t('header.trackApplication'),
        href: '/apply' as const,
        variant: 'outlined' as const,
        sx: {
          color: 'white',
          borderColor: 'rgba(144,202,249,0.7)',
          '&:hover': { borderColor: '#90CAF9', bgcolor: 'rgba(144,202,249,0.1)' },
        },
      };
    default:
      return {
        label: t('header.joinNow'),
        href: '/apply' as const,
        variant: 'contained' as const,
        sx: {
          boxShadow: 'none',
          '&:hover': { boxShadow: 2 },
        },
      };
  }
}

// ─── Nav group structure ────────────────────────────────────────────────────

interface NavGroup {
  key: string;
  labelKey: 'colleges' | 'examHubNav' | 'counselingNav' | 'aboutNav';
  icon: React.ReactNode;
  columns: NavColumn[];
  aside?: NavAside;
  footer?: NavFooter;
  /** 'cards': the desktop panel is a single column of icon cards. */
  variant?: 'columns' | 'cards';
}

// Desktop shows each group as one MegaMenuPanel; the phone drawer lists every
// link of the group (columns, "more" links, side cards and the footer link).
const NAV_GROUPS: NavGroup[] = [
  {
    key: 'colleges',
    labelKey: 'colleges',
    icon: <SchoolIcon fontSize="small" />,
    columns: [
      {
        title: 'By state',
        links: [
          { label: 'Tamil Nadu', href: '/colleges/tamil-nadu' },
          { label: 'Karnataka', href: '/colleges/karnataka' },
          { label: 'Maharashtra', href: '/colleges/maharashtra' },
          { label: 'Delhi NCR', href: '/colleges/delhi' },
          { label: 'Kerala', href: '/colleges/kerala' },
          { label: 'Telangana', href: '/colleges/telangana' },
        ],
        more: { label: 'All states', href: '/colleges#explore' },
      },
      {
        title: 'By exam and counselling',
        links: [
          { label: 'NATA colleges', href: '/colleges?exam=NATA#browse' },
          { label: 'JEE Main Paper 2 colleges', href: '/colleges?exam=JEE_PAPER_2#browse' },
          { label: 'TNEA counselling', href: '/colleges/tnea' },
          { label: 'JoSAA counselling', href: '/colleges/josaa' },
          { label: 'KEAM counselling', href: '/counseling/keam-arch' },
          { label: 'KCET counselling', href: '/colleges/counseling/kcet' },
        ],
        more: { label: 'All counselling', href: '/colleges#explore' },
      },
      {
        title: 'Rankings and filters',
        links: [
          { label: 'NIRF Architecture', href: '/colleges/rankings/nirf' },
          { label: 'ArchIndex top rated', href: '/colleges/rankings/archindex' },
          { label: 'COA approved', href: '/colleges/accreditation/coa-approved' },
          { label: 'Government colleges', href: '/colleges/type/government' },
          { label: 'Private colleges', href: '/colleges/type/private' },
          { label: 'Fee under ₹3L', href: '/colleges/fees/below-3-lakhs' },
        ],
        more: { label: 'All fee ranges', href: '/colleges#explore' },
      },
    ],
    aside: {
      title: 'Your tools',
      cards: [
        { label: 'Compare colleges', hint: 'Up to 4, side by side', href: '/colleges/compare', Icon: CompareArrowsIcon, tone: 'primary' },
        { label: 'Saved colleges', hint: 'Your shortlist', href: '/colleges/saved', Icon: FavoriteBorderIcon, tone: 'secondary' },
        { label: 'Browse by city', hint: 'Colleges near you', href: '/colleges#explore', Icon: PlaceOutlinedIcon, tone: 'success' },
        { label: 'College predictor', hint: 'Colleges for your score', href: '/tools/college-predictor', Icon: CalculateOutlinedIcon, tone: 'warning' },
      ],
    },
    footer: {
      lead: 'B.Arch colleges across India',
      text: 'with fees, seats and admission routes.',
      cta: { label: 'Browse all colleges', href: '/colleges#browse' },
    },
  },
  {
    key: 'examHub',
    labelKey: 'examHubNav',
    icon: <MenuBookIcon fontSize="small" />,
    columns: [
      {
        title: 'NATA 2026',
        links: [
          { label: 'Eligibility', href: '/nata-2026/eligibility' },
          { label: 'Important Dates', href: '/nata-2026/important-dates' },
          { label: 'Syllabus', href: '/nata-2026/syllabus' },
        ],
        more: { label: 'NATA 2026 Hub', href: '/nata-2026' },
      },
      {
        title: 'JEE Main Paper 2',
        links: [
          { label: 'Paper 2A: B.Arch', href: '/jee-barch-hub#paper-2a' },
          { label: 'Paper 2B: B.Planning', href: '/jee-barch-hub#paper-2b' },
          { label: 'NITs / SPAs / IIITs', href: '/colleges/josaa' },
          { label: 'JEE Paper 2 Prep', href: '/jee-paper-2-preparation' },
        ],
        more: { label: 'JEE B.Arch Hub', href: '/jee-barch-hub' },
      },
      {
        title: 'AAT 2026',
        badge: 'NEW',
        links: [
          { label: 'Eligibility', href: '/aat-2026#eligibility' },
          { label: 'Schedule', href: '/aat-2026#schedule' },
          { label: 'Syllabus (5 sections)', href: '/aat-2026#syllabus' },
          { label: 'Drawing Kit', href: '/aat-2026#drawing-kit' },
        ],
        more: { label: 'AAT 2026 Hub', href: '/aat-2026' },
      },
      {
        title: 'PGETA 2026',
        badge: 'NEW',
        links: [
          { label: 'Eligibility', href: '/pgeta-2026#eligibility' },
          { label: '3 Test Dates', href: '/pgeta-2026#schedule' },
          { label: 'Syllabus (4 modules)', href: '/pgeta-2026#exam-pattern' },
          { label: 'Fees + Scholarships', href: '/pgeta-2026#fees' },
        ],
        more: { label: 'PGETA 2026 Hub', href: '/pgeta-2026' },
      },
    ],
    aside: {
      title: 'Prepare',
      cards: [
        { label: 'NATA Online Coaching', hint: 'Live classes for NATA and JEE', href: '/nata-online-coaching', Icon: CastForEducationOutlinedIcon, tone: 'primary', badge: 'TOP' },
        { label: 'Free Tools & Mocks', hint: 'Practice tests and tools', href: '/tools', Icon: QuizOutlinedIcon, tone: 'success' },
        { label: 'aiArchitek: AI Tools', hint: 'AI help for drawing and design', href: '/aiarchitek', Icon: AutoAwesomeOutlinedIcon, tone: 'secondary' },
      ],
    },
    footer: {
      lead: 'Every B.Arch entrance exam',
      text: 'with dates, eligibility and syllabus.',
      cta: { label: 'NATA vs JEE Paper 2', href: '/counseling/concepts/nata-vs-jee-paper-2' },
    },
  },
  {
    key: 'counseling',
    labelKey: 'counselingNav',
    icon: <TrendingUpIcon fontSize="small" />,
    columns: [
      {
        title: 'JEE Main Paper 2 route',
        links: [
          { label: 'JoSAA (NIT/IIT/SPA)', href: '/counseling/josaa', badge: 'NEW' },
          { label: 'CSAB Special', href: '/counseling/csab-special' },
          { label: 'CSAB-NEUT (NE & UTs)', href: '/counseling/csab-neut' },
          { label: 'JAC Delhi (IGDTUW)', href: '/counseling/jac-delhi-barch' },
          { label: 'JAC Chandigarh (CCA)', href: '/counseling/jac-chandigarh-barch' },
        ],
      },
      {
        title: 'NATA-only',
        links: [
          { label: 'KEAM (Kerala)', href: '/counseling/keam-arch' },
          { label: 'CEPT University', href: '/counseling/cept-university' },
          { label: 'HSTES (Haryana)', href: '/counseling/hstes-barch' },
          { label: 'DTE Goa (GCA Panaji)', href: '/counseling/dte-goa-barch' },
        ],
      },
      {
        title: 'NATA + JEE P2 accepted',
        links: [
          { label: 'TNEA (Tamil Nadu)', href: '/counseling/tnea-barch' },
          { label: 'MHT-CET (Maharashtra)', href: '/counseling/mht-cet-barch', badge: 'NEW' },
          { label: 'KEA (Karnataka)', href: '/counseling/kea-barch' },
          { label: 'ACPC (Gujarat)', href: '/counseling/acpc-barch' },
          { label: 'AP B.Arch', href: '/counseling/ap-barch' },
          { label: 'TG B.Arch (Telangana)', href: '/counseling/tg-barch' },
          { label: 'UPTAC (Uttar Pradesh)', href: '/counseling/uptac-barch' },
        ],
      },
      {
        title: 'Concepts',
        links: [
          { label: 'Freeze vs Float vs Slide', href: '/counseling/concepts/freeze-float-slide' },
          { label: 'JoSAA vs CSAB', href: '/counseling/concepts/josaa-vs-csab' },
          { label: 'AAT explained', href: '/counseling/concepts/aat-explained' },
          { label: 'NATA vs JEE Paper 2', href: '/counseling/concepts/nata-vs-jee-paper-2' },
          { label: '45% vs 50% PCM rule', href: '/counseling/concepts/eligibility-45-vs-50-rule' },
        ],
      },
    ],
    aside: {
      title: 'Tools',
      cards: [
        { label: 'College Predictor', hint: 'Colleges for your score', href: '/tools/college-predictor', Icon: CalculateOutlinedIcon, tone: 'warning' },
        { label: 'Cutoff Calculator', hint: 'Check where you stand', href: '/tools/cutoff-calculator', Icon: InsightsOutlinedIcon, tone: 'primary' },
      ],
    },
    footer: {
      lead: '28 B.Arch counsellings',
      text: 'grouped by the exam they accept.',
      cta: { label: 'All 28 counsellings', href: '/counseling' },
    },
  },
  {
    key: 'about',
    labelKey: 'aboutNav',
    icon: <InfoOutlinedIcon fontSize="small" />,
    variant: 'cards',
    columns: [],
    aside: {
      title: 'Neram Classes',
      cards: [
        { label: 'About Us', hint: 'Who we are and how we teach', href: '/about', Icon: InfoOutlinedIcon, tone: 'primary' },
        { label: 'Course fees', hint: 'Plans and what each includes', href: '/fees', Icon: CurrencyRupeeIcon, tone: 'success' },
        { label: 'Student Reviews', hint: 'What our students say', href: '/testimonials', Icon: StarBorderRoundedIcon, tone: 'secondary' },
        { label: 'Careers', hint: 'Teach or work with us', href: '/careers', Icon: WorkOutlineIcon, tone: 'info' },
        { label: 'Contact', hint: 'Talk to our team', href: '/contact', Icon: MailOutlineIcon, tone: 'warning' },
      ],
    },
  },
];

/** Every link of a group, in reading order, for the phone drawer and the active check. */
function groupLinks(group: NavGroup): NavLink[] {
  const all: NavLink[] = [
    ...group.columns.flatMap((col) => [
      ...col.links,
      ...(col.more ? [{ ...col.more, badge: col.more.badge ?? col.badge }] : []),
    ]),
    ...(group.aside?.cards ?? []).map(({ label, href, badge }) => ({ label, href, badge })),
    ...(group.footer ? [group.footer.cta] : []),
  ];
  const seen = new Set<string>();
  return all.filter((l) => {
    const k = `${l.href}|${l.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Header() {
  const params = useParams();
  const locale = params.locale as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();

  const isApplyPage = pathname === '/apply';
  const { scrollDirection, isAtTop } = useScrollDirection();
  const { status: appStatus } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const ctaConfig = getCtaConfig(appStatus, t);
  const isEnrolled = appStatus === 'enrolled' || appStatus === 'partial_payment';
  // Phones get "View fees" in the drawer; laptops find Course fees under About.
  const showFeesLink = !isEnrolled && !isApplyPage && pathname !== '/fees';

  // "Free demo" beside Join Now, or "My demo" once one is booked. Read from a
  // browser flag the booking card writes, so no page pays for an API call.
  const [demoActive, setDemoActive] = useState<DemoActiveFlag | null>(null);
  useEffect(() => {
    setDemoActive(readDemoActive());
    const onStorage = () => setDemoActive(readDemoActive());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [pathname]);
  const demoCta = getDemoCta({ pathname, applicationStatus: appStatus, enrolled: isEnrolled, active: demoActive });

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

  // Desktop: which group's popover is open
  const [openMenu, setOpenMenu] = useState<{ key: string; anchorEl: HTMLElement } | null>(null);

  // Mobile: which group is expanded in accordion
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

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);

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

  const handleClickAway = (event: MouseEvent | TouchEvent) => {
    // A trigger click is handled by the trigger itself (toggle or swap).
    const target = event.target as Node;
    if (Object.values(triggerRefs.current).some((el) => el?.contains(target))) return;
    setOpenMenu(null);
  };

  const toggleMobileGroup = (key: string) =>
    setExpandedGroup((prev) => (prev === key ? null : key));

  // Check if any link in a group matches the current path
  const isGroupActive = (group: NavGroup) =>
    (group.key === 'colleges' && /^\/colleges(\/|$)/.test(pathname)) ||
    groupLinks(group).some(
      (link) =>
        pathname === link.href ||
        (link.href !== '/' && pathname.startsWith(link.href)),
    );

  return (
    <>
      <AppBar
        position="fixed"
        elevation={1}
        sx={{
          top: 'var(--broadcast-banner-height, 0px)',
          transform:
            scrollDirection === 'down' && !isAtTop && !mobileMenuOpen && !openMenu
              ? 'translateY(-100%)'
              : 'translateY(0)',
          transition:
            'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), top 200ms ease',
          backgroundImage: 'none',
          borderRadius: 0,
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        {/* Full width up to 1680px, so the logo sits at the far left on laptops */}
        <Box sx={{ width: '100%', maxWidth: 1680, mx: 'auto', px: { xs: 2, md: 3 }, boxSizing: 'border-box' }}>
          <Toolbar disableGutters sx={{ minHeight: { xs: 56, md: 64 }, gap: { md: 0.5 } }}>

            {/* ── Logo + Microsoft Badge ── */}
            <Box
              component={Link}
              href="/"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                mr: { xs: 0, md: 3 },
                textDecoration: 'none',
                color: 'inherit',
                flexShrink: 0,
              }}
            >
              <BrandWordmark />
            </Box>

            {/* ── Desktop: Grouped nav buttons ── */}
            <Box
              sx={{
                flexGrow: 1,
                display: { xs: 'none', md: inlineSearch ? 'none' : 'flex' },
                gap: 0.25,
                alignItems: 'center',
              }}
            >
              {/* Home icon (when not on homepage) */}
              {pathname !== '/' && (
                <Tooltip title={t('nav.home')} arrow>
                  <IconButton
                    component={Link}
                    href="/"
                    color="inherit"
                    size="small"
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '8px',
                      opacity: 0.75,
                      transition: 'opacity 0.2s, background-color 0.2s',
                      '&:hover': { opacity: 1, bgcolor: 'action.hover' },
                    }}
                  >
                    <HomeRoundedIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              )}

              {/* Group buttons */}
              {NAV_GROUPS.map((group) => {
                const isActive = isGroupActive(group);
                const isOpen = openMenu?.key === group.key;
                return (
                  <Box key={group.key} sx={{ display: 'contents' }}>
                  <Button
                    ref={(el: HTMLButtonElement | null) => { triggerRefs.current[group.key] = el; }}
                    aria-expanded={isOpen}
                    aria-controls={`nav-panel-${group.key}`}
                    onClick={(e) => isOpen ? handleMenuClose() : handleMenuOpen(group.key, e)}
                    endIcon={
                      <KeyboardArrowDownIcon
                        sx={{
                          fontSize: '16px !important',
                          transition: 'transform 200ms ease',
                          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      />
                    }
                    sx={{
                      color: 'inherit',
                      minWidth: 0,
                      px: { md: 0.75, lg: 1.25 },
                      whiteSpace: { md: 'normal', lg: 'nowrap' },
                      py: 1,
                      fontWeight: isActive || isOpen ? 600 : 400,
                      opacity: isActive || isOpen ? 1 : 0.85,
                      bgcolor: isOpen ? 'action.selected' : 'transparent',
                      borderRadius: '8px',
                      position: 'relative',
                      overflow: 'visible',
                      transition: 'opacity 0.2s ease, background-color 0.2s ease',
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        bottom: 4,
                        left: '50%',
                        width: isActive ? '60%' : '0%',
                        height: '2px',
                        bgcolor: 'currentcolor',
                        borderRadius: '1px',
                        transform: 'translateX(-50%)',
                        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      },
                      '&:hover': {
                        opacity: 1,
                        bgcolor: 'action.hover',
                        '&::after': { width: '60%' },
                      },
                    }}
                  >
                    {t(`nav.${group.labelKey}`)}
                  </Button>
                  {/* Rendered right after its trigger (no portal) so Tab moves from the
                      trigger into the panel, and the panel sits above the scrim. */}
                  <Popper
                    open={isOpen}
                    anchorEl={isOpen ? openMenu?.anchorEl : null}
                    placement="bottom-start"
                    disablePortal
                    transition
                    modifiers={[
                      { name: 'offset', options: { offset: [0, 8] } },
                      { name: 'preventOverflow', options: { padding: 16 } },
                      { name: 'flip', enabled: false },
                    ]}
                    sx={{ zIndex: 1 }}
                  >
                    {({ TransitionProps }) => (
                      <Fade {...TransitionProps} timeout={reduceMotion ? 0 : 160} easing="cubic-bezier(0, 0, 0.2, 1)">
                        <div>
                          <ClickAwayListener onClickAway={handleClickAway}>
                            <Paper
                              id={`nav-panel-${group.key}`}
                              elevation={8}
                              sx={{
                                borderRadius: 2,
                                border: '1px solid',
                                borderColor: 'divider',
                                overflowX: 'hidden',
                                overflowY: 'auto',
                                maxHeight: 'calc(100vh - var(--broadcast-banner-height, 0px) - 88px)',
                                maxWidth: '94vw',
                              }}
                            >
                              {group.key === 'colleges' ? (
                                <CollegesMegaMenu
                                  columns={group.columns}
                                  aside={group.aside}
                                  footer={group.footer}
                                  pathname={pathname}
                                  onNavigate={handleMenuClose}
                                />
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
                              )}
                            </Paper>
                          </ClickAwayListener>
                        </div>
                      </Fade>
                    )}
                  </Popper>
                  </Box>
                );
              })}

              {/* Free Tools direct link */}
              <Button
                component={Link}
                href="/tools"
                sx={{
                  color: 'inherit',
                  minWidth: 0,
                  px: { md: 0.75, lg: 1.25 },
                  whiteSpace: { md: 'normal', lg: 'nowrap' },
                  py: 1,
                  fontWeight: pathname === '/tools' || pathname.startsWith('/tools/') ? 600 : 400,
                  opacity: pathname === '/tools' || pathname.startsWith('/tools/') ? 1 : 0.85,
                  borderRadius: '8px',
                  position: 'relative',
                  overflow: 'visible',
                  transition: 'opacity 0.2s ease, background-color 0.2s ease',
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    bottom: 4,
                    left: '50%',
                    width: pathname === '/tools' || pathname.startsWith('/tools/') ? '60%' : '0%',
                    height: '2px',
                    bgcolor: 'currentcolor',
                    borderRadius: '1px',
                    transform: 'translateX(-50%)',
                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  },
                  '&:hover': {
                    opacity: 1,
                    bgcolor: 'action.hover',
                    '&::after': { width: '60%' },
                  },
                }}
              >
                Free Tools
              </Button>
            </Box>

            {inlineSearch && <InlineSearch onClose={closeInlineSearch} />}

            {/* Spacer for mobile */}
            <Box sx={{ flexGrow: 1, display: { xs: 'block', md: 'none' } }} />

            {/* ── Search: an icon that opens the field in the header (laptops) or full screen (phones) ── */}
            {!inlineSearch && (
              <Tooltip title="Search (Ctrl K)" arrow>
                <IconButton
                  ref={searchButtonRef}
                  color="inherit"
                  onClick={openSearch}
                  onPointerEnter={preloadSearch}
                  onFocus={preloadSearch}
                  aria-label="Search"
                  aria-keyshortcuts="Control+K Meta+K"
                  sx={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    borderRadius: '50%',
                    mr: 0.5,
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                  }}
                >
                  <SearchIcon sx={{ fontSize: 22 }} />
                </IconButton>
              </Tooltip>
            )}

            {/* My Enrollment (enrolled students) */}
            {isEnrolled && (
              <Button
                component={Link}
                href="/my-enrollment"
                size="small"
                sx={{
                  display: { xs: 'none', md: 'inline-flex' },
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  px: 2,
                  mr: 0.5,
                  textTransform: 'none',
                  color: 'white',
                  opacity: pathname === '/my-enrollment' ? 1 : 0.8,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', opacity: 1 },
                }}
              >
                My Enrollment
              </Button>
            )}

            {/* CTA */}
            {isApplyPage ? (
              <Button
                component={Link}
                href="/contact"
                variant="outlined"
                size="small"
                startIcon={<HelpOutlineIcon sx={{ fontSize: { xs: 16, md: 18 } }} />}
                sx={{
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: { xs: '0.75rem', md: '0.875rem' },
                  px: { xs: 1.5, md: 2.5 },
                  mr: 1,
                  textTransform: 'none',
                  color: 'white',
                  borderColor: 'rgba(255,255,255,0.6)',
                  '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                {t('header.needHelp')}
              </Button>
            ) : (
              <HeaderCtaPill
                status={appStatus}
                demo={demoCta ? { href: demoCta.href, label: demoCta.label === 'myDemo' ? t('header.myDemo') : t('header.freeDemo') } : null}
                primary={{ label: ctaConfig.label, href: ctaConfig.href, onClick: goToApp }}
              />
            )}

            {/* Desktop: Notifications + Auth */}
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5 }}>
              <UserNotificationBell />
              <AuthButton />
            </Box>

            {/* Mobile: Hamburger */}
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              <IconButton
                edge="end"
                color="inherit"
                aria-label={t('header.openMenu')}
                onClick={toggleMobileMenu}
                sx={{ p: 1.5 }}
              >
                <MenuIcon />
              </IconButton>
            </Box>
          </Toolbar>
        </Box>


        {/* ── Mobile Navigation Drawer ── */}
        <SwipeableDrawer
          anchor="right"
          open={mobileMenuOpen}
          onOpen={() => setMobileMenuOpen(true)}
          onClose={toggleMobileMenu}
          PaperProps={{ sx: { width: 280 } }}
        >
          {/* Drawer Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              px: 2,
              py: 1.5,
            }}
          >
            <BrandWordmark size="sm" />
            <IconButton onClick={toggleMobileMenu} aria-label={t('header.closeMenu')}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Divider />

          {/* Search */}
          <ListItemButton
            onClick={() => { setMobileMenuOpen(false); setSearchOpen(true); }}
            sx={{ py: 1.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <SearchIcon sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText primary="Search" primaryTypographyProps={{ fontWeight: 400 }} />
          </ListItemButton>

          {/* Home (when not on homepage) */}
          {pathname !== '/' && (
            <ListItemButton
              component={Link}
              href="/"
              onClick={toggleMobileMenu}
              sx={{ py: 1.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <HomeRoundedIcon sx={{ fontSize: 20 }} />
              </ListItemIcon>
              <ListItemText primary={t('nav.home')} primaryTypographyProps={{ fontWeight: 400 }} />
            </ListItemButton>
          )}

          {/* Nav groups as accordion */}
          <List sx={{ flexGrow: 1, py: 0 }}>
            {NAV_GROUPS.map((group) => {
              const isOpen = expandedGroup === group.key;
              const isActive = isGroupActive(group);
              const allLinks = groupLinks(group);

              return (
                <Box key={group.key}>
                  <ListItemButton
                    onClick={() => toggleMobileGroup(group.key)}
                    sx={{
                      py: 1.5,
                      borderLeft: isActive ? '3px solid' : '3px solid transparent',
                      borderColor: isActive ? 'primary.main' : 'transparent',
                      bgcolor: isActive ? 'primary.50' : 'transparent',
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {group.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={t(`nav.${group.labelKey}`)}
                      primaryTypographyProps={{ fontWeight: isActive ? 600 : 400 }}
                    />
                    <KeyboardArrowDownIcon
                      sx={{
                        fontSize: 20,
                        color: 'text.secondary',
                        transition: 'transform 200ms ease',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    />
                  </ListItemButton>

                  <Collapse in={isOpen} timeout={200}>
                    <List disablePadding sx={{ bgcolor: 'grey.50' }}>
                      {allLinks.map((link) => {
                        const isLinkActive =
                          pathname === link.href ||
                          (link.href !== '/' && pathname.startsWith(link.href));
                        return (
                          <ListItemButton
                            key={`${link.href}|${link.label}`}
                            component={Link}
                            href={link.href as any}
                            onClick={toggleMobileMenu}
                            selected={isLinkActive}
                            sx={{
                              pl: 6.5,
                              py: 1.25,
                              '&.Mui-selected': {
                                color: 'primary.main',
                                bgcolor: 'primary.50',
                              },
                            }}
                          >
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: isLinkActive ? 600 : 400 }}>
                                    {link.label}
                                  </Typography>
                                  {link.badge && <NavBadge label={link.badge} />}
                                </Box>
                              }
                            />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  </Collapse>
                  <Divider />
                </Box>
              );
            })}
          </List>

          {/* Free Tools */}
          <ListItemButton
            component={Link}
            href="/tools"
            onClick={toggleMobileMenu}
            selected={pathname === '/tools' || pathname.startsWith('/tools/')}
            sx={{
              py: 1.5,
              borderLeft: pathname === '/tools' || pathname.startsWith('/tools/') ? '3px solid' : '3px solid transparent',
              borderColor: pathname === '/tools' || pathname.startsWith('/tools/') ? 'primary.main' : 'transparent',
              bgcolor: pathname === '/tools' || pathname.startsWith('/tools/') ? 'primary.50' : 'transparent',
              '&.Mui-selected': { color: 'primary.main', bgcolor: 'primary.50' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <TrendingUpIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Free Tools"
              primaryTypographyProps={{ fontWeight: pathname === '/tools' || pathname.startsWith('/tools/') ? 600 : 400 }}
            />
          </ListItemButton>
          <Divider />

          {/* My Enrollment */}
          {isEnrolled && (
            <Box sx={{ px: 2, pb: 1 }}>
              <Button
                component={Link}
                href="/my-enrollment"
                variant="outlined"
                fullWidth
                onClick={toggleMobileMenu}
                sx={{ borderRadius: '6px', fontWeight: 600, textTransform: 'none', py: 1 }}
              >
                My Enrollment
              </Button>
            </Box>
          )}

          {/* Mobile CTA */}
          {!isApplyPage && (
            <Box sx={{ px: 2, pb: 1.5 }}>
              {demoCta && (
                <Button
                  component={Link}
                  href={demoCta.href}
                  variant="outlined"
                  fullWidth
                  onClick={toggleMobileMenu}
                  startIcon={<VideocamOutlinedIcon />}
                  sx={{
                    mb: 1,
                    minHeight: 48,
                    borderRadius: '6px',
                    fontWeight: 600,
                    textTransform: 'none',
                  }}
                >
                  {demoCta.label === 'myDemo' ? t('header.myDemo') : t('header.freeDemoClass')}
                </Button>
              )}
              {ctaConfig.href ? (
                <Button
                  component={Link}
                  href={ctaConfig.href}
                  variant={ctaConfig.variant}
                  color={appStatus ? undefined : 'secondary'}
                  fullWidth
                  onClick={toggleMobileMenu}
                  sx={{
                    borderRadius: '6px',
                    fontWeight: 600,
                    textTransform: 'none',
                    py: 1.2,
                    ...(appStatus === 'approved'
                      ? { bgcolor: '#2E7D32', color: '#fff', '&:hover': { bgcolor: '#1B5E20' } }
                      : appStatus === 'draft'
                        ? { borderColor: 'primary.main', color: 'primary.main' }
                        : appStatus
                          ? { borderColor: '#1976D2', color: '#1976D2' }
                          : {}),
                  }}
                >
                  {ctaConfig.label}
                </Button>
              ) : (
                <Button
                  onClick={() => { toggleMobileMenu(); goToApp(); }}
                  variant={ctaConfig.variant}
                  fullWidth
                  sx={{
                    borderRadius: '6px',
                    fontWeight: 600,
                    textTransform: 'none',
                    py: 1.2,
                    bgcolor: '#2E7D32',
                    color: '#fff',
                    '&:hover': { bgcolor: '#1B5E20' },
                  }}
                >
                  {ctaConfig.label}
                </Button>
              )}
              {showFeesLink && (
                <Button
                  component={Link}
                  href="/fees"
                  variant="outlined"
                  fullWidth
                  onClick={toggleMobileMenu}
                  startIcon={<CurrencyRupeeIcon />}
                  sx={{
                    mt: 1,
                    minHeight: 48,
                    borderRadius: '6px',
                    fontWeight: 600,
                    textTransform: 'none',
                  }}
                >
                  {t('header.viewFees')}
                </Button>
              )}
            </Box>
          )}
          <Divider />

          {/* Auth */}
          <Box
            sx={{
              px: 2,
              py: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              '& .MuiButton-root': { ml: 0, flex: 1 },
            }}
          >
            <UserNotificationBell />
            <AuthButton />
          </Box>
          <Divider />

          {/* Language */}
          <Box sx={{ px: 2, py: 2 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mb: 1, display: 'block', fontWeight: 500 }}
            >
              {t('header.language')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {locales.map((loc) => (
                <Button
                  key={loc}
                  size="small"
                  variant={loc === locale ? 'contained' : 'outlined'}
                  onClick={() => { handleLocaleChange(loc); toggleMobileMenu(); }}
                  sx={{
                    minWidth: 0,
                    minHeight: 36,
                    px: 1.5,
                    fontSize: '0.75rem',
                    borderRadius: '6px',
                  }}
                >
                  {localeLabels[loc]}
                </Button>
              ))}
            </Box>
          </Box>
        </SwipeableDrawer>
      </AppBar>

      {/* Laptops: dim and lightly blur the page under an open menu. It starts below
          the header, so the header stays sharp and another menu is one click away. */}
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
            bgcolor: (theme) => alpha(theme.palette.grey[900], 0.4),
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
          }}
        />
      </Fade>

      {/* Spacer */}
      {searchMounted && <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />}
      <Toolbar
        disableGutters
        sx={{ minHeight: { xs: 56, md: 64 }, mt: 'var(--broadcast-banner-height, 0px)' }}
      />
    </>
  );
}
