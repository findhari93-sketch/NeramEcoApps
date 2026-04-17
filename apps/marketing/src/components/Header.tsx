'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Container,
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
  Chip,
  MenuIcon,
  CloseIcon,
  HelpOutlineIcon,
  useScrollDirection,
  ListItemIcon,
  Popover,
  Collapse,
} from '@neram/ui';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import SearchIcon from '@mui/icons-material/Search';
import SchoolIcon from '@mui/icons-material/School';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { locales, localeLabels, type Locale } from '@/i18n';
import { useTranslations } from 'next-intl';
import AuthButton from './AuthButton';
import UserNotificationBell from './UserNotificationBell';
import SearchDialog from './SearchDialog';
import { useApplicationStatus, type AppStatusSummary } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';

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
        label: t('header.applyNow'),
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

interface NavLink {
  label: string;
  href: string;
  badge?: string;
}

interface NavColumn {
  title: string;
  links: NavLink[];
}

interface NavGroup {
  key: string;
  labelKey: 'colleges' | 'nataPrepNav' | 'counselingNav' | 'aboutNav';
  icon: React.ReactNode;
  columns: NavColumn[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'colleges',
    labelKey: 'colleges',
    icon: <SchoolIcon fontSize="small" />,
    columns: [
      {
        title: 'Browse',
        links: [
          { label: 'All Architecture Colleges', href: '/colleges' },
          { label: 'Tamil Nadu Colleges', href: '/colleges/tamil-nadu' },
          { label: 'Compare Colleges', href: '/colleges/compare' },
          { label: 'Saved Colleges', href: '/colleges/saved' },
        ],
      },
      {
        title: 'Rankings',
        links: [
          { label: 'NIRF Architecture', href: '/colleges/rankings/nirf' },
          { label: 'ArchIndex Rankings', href: '/colleges/rankings/archindex' },
        ],
      },
      {
        title: 'By Admission',
        links: [
          { label: 'TNEA Colleges', href: '/colleges/tnea' },
          { label: 'JoSAA Colleges', href: '/colleges/josaa' },
        ],
      },
    ],
  },
  {
    key: 'nata',
    labelKey: 'nataPrepNav',
    icon: <MenuBookIcon fontSize="small" />,
    columns: [
      {
        title: 'Courses',
        links: [
          { label: 'NATA 2026', href: '/nata-2026', badge: 'NEW' },
          { label: 'All Courses', href: '/courses' },
          { label: 'Fees & Scholarships', href: '/fees' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { label: 'NATA Syllabus', href: '/nata-syllabus' },
          { label: 'Previous Year Papers', href: '/previous-year-papers' },
          { label: 'Best Books', href: '/best-books-nata-jee' },
          { label: 'Cutoff Calculator', href: '/tools/cutoff-calculator' },
        ],
      },
    ],
  },
  {
    key: 'counseling',
    labelKey: 'counselingNav',
    icon: <TrendingUpIcon fontSize="small" />,
    columns: [
      {
        title: 'Admission Help',
        links: [
          { label: 'Counseling Guide', href: '/counseling' },
          { label: 'College Predictor', href: '/tools/college-predictor' },
          { label: 'Rank Predictor', href: '/tools/rank-predictor' },
          { label: 'COA Checker', href: '/tools/coa-checker' },
        ],
      },
    ],
  },
  {
    key: 'about',
    labelKey: 'aboutNav',
    icon: <InfoOutlinedIcon fontSize="small" />,
    columns: [
      {
        title: '',
        links: [
          { label: 'About Us', href: '/about' },
          { label: 'Student Reviews', href: '/testimonials' },
          { label: 'Careers', href: '/careers' },
          { label: 'Contact', href: '/contact' },
        ],
      },
    ],
  },
];

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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);

  const handleMenuOpen = (key: string, event: React.MouseEvent<HTMLElement>) => {
    setOpenMenu({ key, anchorEl: event.currentTarget });
  };

  const handleMenuClose = () => setOpenMenu(null);

  const toggleMobileGroup = (key: string) =>
    setExpandedGroup((prev) => (prev === key ? null : key));

  // Check if any link in a group matches the current path
  const isGroupActive = (group: NavGroup) =>
    group.columns.some((col) =>
      col.links.some(
        (link) =>
          pathname === link.href ||
          (link.href !== '/' && pathname.startsWith(link.href)),
      ),
    );

  return (
    <>
      <AppBar
        position="fixed"
        elevation={1}
        sx={{
          top: 'var(--broadcast-banner-height, 0px)',
          transform:
            scrollDirection === 'down' && !isAtTop && !mobileMenuOpen
              ? 'translateY(-100%)'
              : 'translateY(0)',
          transition:
            'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), top 200ms ease',
          backgroundImage: 'none',
          borderRadius: 0,
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ minHeight: { xs: 56, md: 64 } }}>

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
              <Typography
                sx={{
                  fontFamily: '"Museo", sans-serif',
                  fontSize: '20px',
                  lineHeight: 1.2,
                  color: 'inherit',
                }}
              >
                <Box component="span" sx={{ fontWeight: 700 }}>neram</Box>
                <Box component="span" sx={{ fontWeight: 300 }}>Classes</Box>
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Typography
                  sx={{
                    fontSize: '9px',
                    fontStyle: 'italic',
                    fontWeight: 400,
                    color: 'rgb(81 81 81)',
                    letterSpacing: '0.19px',
                    lineHeight: 1,
                  }}
                >
                  Supported by
                </Typography>
                <Box sx={{ width: 9, height: 9, position: 'relative', flexShrink: 0 }}>
                  <Box sx={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '4px', bgcolor: '#F25022', borderRadius: '0.5px' }} />
                  <Box sx={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '4px', bgcolor: '#7FBA00', borderRadius: '0.5px' }} />
                  <Box sx={{ position: 'absolute', bottom: 0, left: 0, width: '4px', height: '4px', bgcolor: '#00A4EF', borderRadius: '0.5px' }} />
                  <Box sx={{ position: 'absolute', bottom: 0, right: 0, width: '4px', height: '4px', bgcolor: '#FFB900', borderRadius: '0.5px' }} />
                </Box>
                <Typography
                  sx={{
                    fontSize: '9.6px',
                    fontWeight: 700,
                    color: 'inherit',
                    letterSpacing: '0.19px',
                    lineHeight: 1,
                  }}
                >
                  Microsoft
                </Typography>
              </Box>
            </Box>

            {/* ── Desktop: Grouped nav buttons ── */}
            <Box
              sx={{
                flexGrow: 1,
                display: { xs: 'none', md: 'flex' },
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
                  <Button
                    key={group.key}
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
                      px: 1.25,
                      py: 1,
                      fontWeight: isActive || isOpen ? 600 : 400,
                      opacity: isActive || isOpen ? 1 : 0.85,
                      bgcolor: isOpen ? 'rgba(255,255,255,0.12)' : 'transparent',
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
                        bgcolor: 'rgba(255,255,255,0.1)',
                        '&::after': { width: '60%' },
                      },
                    }}
                  >
                    {t(`nav.${group.labelKey}`)}
                  </Button>
                );
              })}
            </Box>

            {/* ── Desktop Search ── */}
            <Box
              onClick={() => setSearchOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSearchOpen(true)}
              aria-label="Search (Ctrl+K)"
              sx={{
                display: { xs: 'none', md: 'flex' },
                alignItems: 'center',
                gap: 1,
                height: 36,
                minWidth: 200,
                px: 1.5,
                mr: 1,
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.7)',
                transition: 'all 0.2s ease',
                flexShrink: 0,
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.4)',
                  color: 'white',
                },
              }}
            >
              <SearchIcon sx={{ fontSize: 17 }} />
              <Typography variant="body2" sx={{ flex: 1, fontSize: '0.85rem', color: 'inherit' }}>
                Search
              </Typography>
              <Box
                component="kbd"
                sx={{
                  fontSize: '0.65rem',
                  fontFamily: 'inherit',
                  px: 0.6,
                  py: 0.25,
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: '4px',
                  color: 'rgba(255,255,255,0.5)',
                  letterSpacing: '0.02em',
                  lineHeight: 1.4,
                }}
              >
                Ctrl K
              </Box>
            </Box>

            {/* Spacer for mobile */}
            <Box sx={{ flexGrow: 1, display: { xs: 'block', md: 'none' } }} />

            {/* ── Mobile Search Icon ── */}
            <IconButton
              color="inherit"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              sx={{
                display: { xs: 'flex', md: 'none' },
                width: 40,
                height: 40,
                borderRadius: '8px',
                mr: 0.5,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
              }}
            >
              <SearchIcon sx={{ fontSize: 22 }} />
            </IconButton>

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
            ) : ctaConfig.href ? (
              <Button
                component={Link}
                href={ctaConfig.href}
                variant={ctaConfig.variant}
                color={appStatus ? undefined : 'secondary'}
                size="small"
                sx={{
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: { xs: '0.75rem', md: '0.875rem' },
                  px: { xs: 1.5, md: 2.5 },
                  mr: 1,
                  textTransform: 'none',
                  ...ctaConfig.sx,
                }}
              >
                {ctaConfig.label}
              </Button>
            ) : (
              <Button
                onClick={goToApp}
                variant={ctaConfig.variant}
                size="small"
                sx={{
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: { xs: '0.75rem', md: '0.875rem' },
                  px: { xs: 1.5, md: 2.5 },
                  mr: 1,
                  textTransform: 'none',
                  ...ctaConfig.sx,
                }}
              >
                {ctaConfig.label}
              </Button>
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
        </Container>

        {/* ── Desktop Dropdown Popovers ── */}
        {NAV_GROUPS.map((group) => (
          <Popover
            key={group.key}
            open={openMenu?.key === group.key}
            anchorEl={openMenu?.anchorEl ?? null}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            disableScrollLock
            PaperProps={{
              elevation: 8,
              sx: {
                mt: 1,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'visible',
                minWidth: 220,
              },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                gap: 0,
                p: 1,
              }}
            >
              {group.columns.map((col, ci) => (
                <Box
                  key={ci}
                  sx={{
                    minWidth: 180,
                    px: 1,
                    borderRight: ci < group.columns.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  {col.title && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'text.disabled',
                        px: 1.5,
                        pt: 1,
                        pb: 0.5,
                        fontSize: '0.65rem',
                      }}
                    >
                      {col.title}
                    </Typography>
                  )}
                  {col.links.map((link) => {
                    const isActive =
                      pathname === link.href ||
                      (link.href !== '/' && pathname.startsWith(link.href));
                    return (
                      <ListItemButton
                        key={link.href}
                        component={Link}
                        href={link.href as any}
                        onClick={handleMenuClose}
                        selected={isActive}
                        sx={{
                          borderRadius: 1.5,
                          py: 0.75,
                          px: 1.5,
                          mb: 0.25,
                          minHeight: 36,
                          '&.Mui-selected': {
                            bgcolor: 'primary.50',
                            color: 'primary.main',
                            '&:hover': { bgcolor: 'primary.100' },
                          },
                        }}
                      >
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Typography variant="body2" sx={{ fontWeight: isActive ? 600 : 400 }}>
                                {link.label}
                              </Typography>
                              {link.badge && (
                                <Chip
                                  label={link.badge}
                                  size="small"
                                  sx={{
                                    height: 16,
                                    fontSize: '0.55rem',
                                    fontWeight: 800,
                                    bgcolor: '#FF6B35',
                                    color: '#fff',
                                    '& .MuiChip-label': { px: 0.5 },
                                  }}
                                />
                              )}
                            </Box>
                          }
                        />
                      </ListItemButton>
                    );
                  })}
                </Box>
              ))}
            </Box>
          </Popover>
        ))}

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
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <Typography
                sx={{
                  fontFamily: '"Museo", sans-serif',
                  fontSize: '18px',
                  lineHeight: 1.2,
                  color: 'text.primary',
                }}
              >
                <Box component="span" sx={{ fontWeight: 700 }}>neram</Box>
                <Box component="span" sx={{ fontWeight: 300 }}>Classes</Box>
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Typography sx={{ fontSize: '9px', fontStyle: 'italic', fontWeight: 400, color: 'text.primary', letterSpacing: '0.19px', lineHeight: 1 }}>
                  Supported by
                </Typography>
                <Box sx={{ width: 9, height: 9, position: 'relative', flexShrink: 0 }}>
                  <Box sx={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '4px', bgcolor: '#F25022', borderRadius: '0.5px' }} />
                  <Box sx={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '4px', bgcolor: '#7FBA00', borderRadius: '0.5px' }} />
                  <Box sx={{ position: 'absolute', bottom: 0, left: 0, width: '4px', height: '4px', bgcolor: '#00A4EF', borderRadius: '0.5px' }} />
                  <Box sx={{ position: 'absolute', bottom: 0, right: 0, width: '4px', height: '4px', bgcolor: '#FFB900', borderRadius: '0.5px' }} />
                </Box>
                <Typography sx={{ fontSize: '9.6px', fontWeight: 700, color: 'text.primary', letterSpacing: '0.19px', lineHeight: 1 }}>
                  Microsoft
                </Typography>
              </Box>
            </Box>
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
              const allLinks = group.columns.flatMap((col) => col.links);

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
                            key={link.href}
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
                                  {link.badge && (
                                    <Chip
                                      label={link.badge}
                                      size="small"
                                      sx={{
                                        height: 16,
                                        fontSize: '0.55rem',
                                        fontWeight: 800,
                                        bgcolor: '#FF6B35',
                                        color: '#fff',
                                        '& .MuiChip-label': { px: 0.5 },
                                      }}
                                    />
                                  )}
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

      {/* Spacer */}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Toolbar
        disableGutters
        sx={{ minHeight: { xs: 56, md: 64 }, mt: 'var(--broadcast-banner-height, 0px)' }}
      />
    </>
  );
}
