'use client';

import { useState } from 'react';
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
  Menu,
  MenuItem,
  Divider,
  Tooltip,
  Chip,
  useMediaQuery,
  useTheme,
  MenuIcon,
  CloseIcon,
  LanguageIcon,
  HelpOutlineIcon,
  useScrollDirection,
  ListItemIcon,
} from '@neram/ui';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { locales, localeLabels, type Locale } from '@/i18n';
import { useTranslations } from 'next-intl';
import AuthButton from './AuthButton';
import UserNotificationBell from './UserNotificationBell';
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
  { labelKey: 'nata2026' as const, href: '/nata-2026' as const, badge: 'NEW' as const },
  { labelKey: 'fees' as const, href: '/fees' as const },
  { labelKey: 'contact' as const, href: '/contact' as const },
];

export default function Header() {
  const params = useParams();
  const locale = params.locale as Locale;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();

  const isApplyPage = pathname === '/apply';
  const { scrollDirection, isAtTop } = useScrollDirection();
  const { status: appStatus } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const ctaConfig = getCtaConfig(appStatus, t);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuAnchor, setLangMenuAnchor] = useState<null | HTMLElement>(null);

  const handleLangMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setLangMenuAnchor(event.currentTarget);
  };

  const handleLangMenuClose = () => {
    setLangMenuAnchor(null);
  };

  const handleLocaleChange = (newLocale: Locale) => {
    router.replace(pathname, { locale: newLocale });
    handleLangMenuClose();
  };

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
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ minHeight: { xs: 56, md: 64 } }}>
          {/* Logo + Microsoft Badge */}
          <Box sx={{ display: 'flex', flexDirection: 'column', mr: { xs: 0, md: 4 } }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: 'inherit',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                lineHeight: 1.2,
              }}
            >
              <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
                Neram Classes
              </Link>
            </Typography>
            <Chip
              label="Supported by Microsoft"
              size="small"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                fontWeight: 600,
                letterSpacing: '0.02em',
                bgcolor: 'rgba(255,255,255,0.2)',
                color: 'inherit',
                border: '1px solid rgba(255,255,255,0.35)',
                '& .MuiChip-label': { px: 1, py: 0 },
                mt: 0.25,
                alignSelf: 'flex-start',
              }}
            />
          </Box>

          {/* Desktop Navigation Links */}
          {!isMobile && (
            <Box sx={{ flexGrow: 1, display: 'flex', gap: 0.5, alignItems: 'center' }}>
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
                      borderBottom: '2px solid transparent',
                      borderRadius: 0,
                      '&:hover': {
                        bgcolor: 'rgba(255,255,255,0.08)',
                        borderBottom: '2px solid rgba(255,255,255,0.6)',
                      },
                    }}
                  >
                    <HomeRoundedIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              )}
              {navigationLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                return (
                <Button
                  key={link.href}
                  component={Link}
                  href={link.href}
                  sx={{
                    color: 'inherit',
                    minWidth: 0,
                    px: 1.5,
                    fontWeight: isActive ? 700 : 400,
                    bgcolor: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                    borderBottom: isActive
                      ? '2px solid white'
                      : '2px solid transparent',
                    borderRadius: 0,
                    transition: 'border-color 0.2s, background-color 0.2s',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.08)',
                      borderBottom: '2px solid rgba(255,255,255,0.6)',
                    },
                  }}
                >
                  {t(`nav.${link.labelKey}`)}
                  {'badge' in link && link.badge && (
                    <Box
                      component="span"
                      sx={{
                        ml: 0.5,
                        position: 'relative',
                        top: -8,
                        display: 'inline-block',
                        fontSize: '0.55rem',
                        fontWeight: 800,
                        letterSpacing: '0.05em',
                        lineHeight: 1,
                        color: '#fff',
                        bgcolor: '#FF6B35',
                        px: 0.5,
                        py: 0.25,
                        borderRadius: '4px',
                        animation: 'badgePulse 2s ease-in-out infinite',
                        '@keyframes badgePulse': {
                          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,107,53,0.5)' },
                          '50%': { boxShadow: '0 0 0 4px rgba(255,107,53,0)' },
                        },
                      }}
                    >
                      {link.badge}
                    </Box>
                  )}
                </Button>
                );
              })}
            </Box>
          )}

          {/* Spacer for mobile */}
          {isMobile && <Box sx={{ flexGrow: 1 }} />}

          {/* CTA Button: "Need Help?" on /apply, dynamic status-aware button elsewhere */}
          {isApplyPage ? (
            <Button
              component={Link}
              href="/contact"
              variant="outlined"
              size={isMobile ? 'small' : 'medium'}
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
              size={isMobile ? 'small' : 'medium'}
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
              size={isMobile ? 'small' : 'medium'}
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

          {/* Desktop: Language Globe Icon */}
          {!isMobile && (
            <>
              <Tooltip title={t('header.changeLanguage')} arrow>
                <IconButton
                  onClick={handleLangMenuOpen}
                  color="inherit"
                  aria-label={t('header.changeLanguage')}
                  sx={{ ml: 0.5 }}
                >
                  <LanguageIcon />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={langMenuAnchor}
                open={Boolean(langMenuAnchor)}
                onClose={handleLangMenuClose}
                disableScrollLock
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{ sx: { minWidth: 160, mt: 1 } }}
              >
                {locales.map((loc) => (
                  <MenuItem
                    key={loc}
                    onClick={() => handleLocaleChange(loc)}
                    selected={loc === locale}
                    sx={{ '&.Mui-selected': { fontWeight: 600 } }}
                  >
                    {localeLabels[loc]}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}

          {/* Desktop: Notifications + Auth Button */}
          {!isMobile && <UserNotificationBell />}
          {!isMobile && <AuthButton />}

          {/* Mobile: Hamburger Menu */}
          {isMobile && (
            <IconButton
              edge="end"
              color="inherit"
              aria-label={t('header.openMenu')}
              onClick={toggleMobileMenu}
              sx={{ p: 1.5 }}
            >
              <MenuIcon />
            </IconButton>
          )}
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
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Neram Classes
            </Typography>
            <Chip
              label="Supported by Microsoft"
              size="small"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor: 'primary.50',
                color: 'primary.main',
                border: '1px solid',
                borderColor: 'primary.200',
                '& .MuiChip-label': { px: 1, py: 0 },
                mt: 0.5,
              }}
            />
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
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
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
    <Toolbar disableGutters sx={{ minHeight: { xs: 56, md: 64 }, mt: 'var(--broadcast-banner-height, 0px)' }} />
    </>
  );
}
