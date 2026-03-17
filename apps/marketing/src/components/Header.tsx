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
} from '@neram/ui';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import SearchIcon from '@mui/icons-material/Search';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { locales, localeLabels, type Locale } from '@/i18n';
import { useTranslations } from 'next-intl';
import AuthButton from './AuthButton';
import UserNotificationBell from './UserNotificationBell';
import SearchDialog from './SearchDialog';
import { useApplicationStatus, type AppStatusSummary } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';

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

const navigationLinks = [
  { labelKey: 'about' as const, href: '/about' as const },
  { labelKey: 'courses' as const, href: '/courses' as const },
  { labelKey: 'testimonials' as const, href: '/testimonials' as const },
  { labelKey: 'nata2026' as const, href: '/nata-2026' as const, badge: 'NEW' as const },
  { labelKey: 'counseling' as const, href: '/counseling' as const },
  { labelKey: 'fees' as const, href: '/fees' as const },
  { labelKey: 'contact' as const, href: '/contact' as const },
  { labelKey: 'careers' as const, href: '/careers' as const },
];

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
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <>
      <AppBar
        position="fixed"
        elevation={1}
        sx={{
          top: 'var(--broadcast-banner-height, 0px)',
          transform: scrollDirection === 'down' && !isAtTop && !mobileMenuOpen
            ? 'translateY(-100%)'
            : 'translateY(0)',
          transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), top 200ms ease',
          backgroundImage: 'none',
          borderRadius: 0,
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
        }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ minHeight: { xs: 56, md: 64 } }}>
            {/* Logo + Microsoft Badge */}
            <Box
              component={Link}
              href="/"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                mr: { xs: 0, md: 4 },
                textDecoration: 'none',
                color: 'inherit',
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
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Typography
                  sx={{
                    fontSize: '9px',
                    fontStyle: 'italic',
                    fontWeight: 400,
                    color: 'rgb(81 81 81);',
                    letterSpacing: '0.19px',
                    lineHeight: 1,
                  }}
                >
                  Supported by
                </Typography>
                {/* Microsoft 4-color logo */}
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

            {/* Desktop Navigation Links */}
              <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, gap: 0.5, alignItems: 'center' }}>
                {pathname !== '/' && (
                  <Tooltip title={t('nav.home')} arrow>
                    <IconButton
                      component={Link}
                      href={'/'}
                      color="inherit"
                      size="small"
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: '8px',
                        opacity: 0.75,
                        transition: 'opacity 0.2s, background-color 0.2s',
                        '&:hover': {
                          opacity: 1,
                          bgcolor: 'action.hover',
                        },
                      }}
                    >
                      <HomeRoundedIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                )}
                {navigationLinks.map((link) => {
                  const isActive = pathname === link.href || (link.href as string !== '/' && pathname.startsWith(link.href));
                  return (
                    <Button
                      key={link.href}
                      component={Link}
                      href={link.href}
                      sx={{
                        color: 'inherit',
                        minWidth: 0,
                        px: 1.5,
                        py: 1,
                        fontWeight: isActive ? 600 : 400,
                        opacity: isActive ? 1 : 0.8,
                        bgcolor: 'transparent',
                        borderRadius: '8px',
                        position: 'relative',
                        overflow: 'visible',
                        transition: 'opacity 0.25s ease, background-color 0.25s ease',
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
                          '&::after': {
                            width: '60%',
                          },
                        },
                      }}
                    >
                      {'badge' in link && link.badge && (
                        <Box
                          component="span"
                          sx={{
                            position: 'absolute',
                            top: 0,
                            left: -2,
                            fontSize: '0.5rem',
                            fontWeight: 800,
                            letterSpacing: '0.05em',
                            lineHeight: 1,
                            color: '#fff',
                            bgcolor: '#FF6B35',
                            px: 0.6,
                            py: 0.3,
                            borderRadius: '6px',
                            transform: 'rotate(-15deg)',
                          }}
                        >
                          {link.badge}
                        </Box>
                      )}
                      {t(`nav.${link.labelKey}`)}
                    </Button>
                  );
                })}
              </Box>


            {/* Desktop Search Button */}
            <Tooltip title="Search (Ctrl+K)" arrow>
              <IconButton
                color="inherit"
                size="small"
                onClick={() => setSearchOpen(true)}
                sx={{
                  display: { xs: "none", md: "flex" },
                  width: 32,
                  height: 32,
                  borderRadius: "8px",
                  opacity: 0.75,
                  "&:hover": { opacity: 1, bgcolor: "action.hover" },
                }}
              >
                <SearchIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
            {/* Spacer for mobile */}
            <Box sx={{ flexGrow: 1, display: { xs: 'block', md: 'none' } }} />

            {/* My Enrollment link for enrolled students */}
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

            {/* CTA Button: "Need Help?" on /apply, dynamic status-aware button elsewhere */}
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
                  '&:hover': {
                    borderColor: 'white',
                    bgcolor: 'rgba(255,255,255,0.1)',
                  },
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

            {/* Desktop: Notifications + Auth Button */}
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5 }}>
              <UserNotificationBell />
              <AuthButton />
            </Box>

            {/* Mobile: Hamburger Menu */}
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

        {/* Mobile Navigation Drawer */}
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
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Typography
                  sx={{
                    fontSize: '9px',
                    fontStyle: 'italic',
                    fontWeight: 400,
                    color: 'text.primary',
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
                    color: 'text.primary',
                    letterSpacing: '0.19px',
                    lineHeight: 1,
                  }}
                >
                  Microsoft
                </Typography>
              </Box>
            </Box>
            <IconButton
              onClick={toggleMobileMenu}
              aria-label={t('header.closeMenu')}
            >
              <CloseIcon />
            </IconButton>
          </Box>
          <Divider />

          {/* Navigation Links */}
          <ListItemButton
            onClick={() => { setMobileMenuOpen(false); setSearchOpen(true); }}
            sx={{ py: 1.5 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <SearchIcon sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText
              primary="Search"
              primaryTypographyProps={{ fontWeight: 400 }}
            />
          </ListItemButton>
          <List sx={{ flexGrow: 1, py: 1 }}>
            {pathname !== '/' && (
              <ListItemButton
                component={Link}
                href={'/'}
                onClick={toggleMobileMenu}
                sx={{ py: 1.5 }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <HomeRoundedIcon sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText
                  primary={t('nav.home')}
                  primaryTypographyProps={{ fontWeight: 400 }}
                />
              </ListItemButton>
            )}
            {navigationLinks.map((link) => {
              const isActive = pathname === link.href || (link.href as string !== '/' && pathname.startsWith(link.href));
              return (
                <ListItemButton
                  key={link.href}
                  component={Link}
                  href={link.href}
                  selected={isActive}
                  onClick={toggleMobileMenu}
                  sx={{
                    py: 1.5,
                    '&.Mui-selected': {
                      color: 'primary.main',
                      borderLeft: '3px solid',
                      borderColor: 'primary.main',
                      bgcolor: 'primary.50',
                    },
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {t(`nav.${link.labelKey}`)}
                        {'badge' in link && link.badge && (
                          <Chip
                            label={link.badge}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.6rem',
                              fontWeight: 800,
                              letterSpacing: '0.05em',
                              bgcolor: '#FF6B35',
                              color: '#fff',
                              '& .MuiChip-label': { px: 0.75, py: 0 },
                            }}
                          />
                        )}
                      </Box>
                    }
                    primaryTypographyProps={{
                      fontWeight: isActive ? 600 : 400,
                      component: 'div',
                    }}
                  />
                </ListItemButton>
              );
            })}
          </List>

          {/* Mobile: My Enrollment link for enrolled students */}
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

          {/* Mobile CTA Button */}
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
                      ? {
                        bgcolor: '#2E7D32',
                        color: '#fff',
                        '&:hover': { bgcolor: '#1B5E20' },
                      }
                      : appStatus === 'draft'
                        ? {
                          borderColor: 'primary.main',
                          color: 'primary.main',
                        }
                        : appStatus
                          ? {
                            borderColor: '#1976D2',
                            color: '#1976D2',
                          }
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

          {/* Auth Section */}
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

          {/* Language Section */}
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
                  onClick={() => {
                    handleLocaleChange(loc);
                    toggleMobileMenu();
                  }}
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
      {/* Spacer to prevent content from sliding under fixed AppBar + broadcast banner */}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Toolbar disableGutters sx={{ minHeight: { xs: 56, md: 64 }, mt: 'var(--broadcast-banner-height, 0px)' }} />
    </>
  );
}
