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
  Drawer,
  List,
  ListItem,
  ListItemText,
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { Link } from '@neram/ui';
import { locales, localeLabels, type Locale } from '@/i18n';

const navigationLinks = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Courses', href: '/courses' },
  { label: 'Contact', href: '/contact' },
  { label: 'Apply', href: '/apply' },
];

export default function Header() {
  const params = useParams();
  const locale = params.locale as Locale;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuAnchor, setLangMenuAnchor] = useState<null | HTMLElement>(null);

  const handleLangMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setLangMenuAnchor(event.currentTarget);
  };

  const handleLangMenuClose = () => {
    setLangMenuAnchor(null);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const getLocalizedPath = (path: string, targetLocale: Locale) => {
    return `/${targetLocale}${path}`;
  };

  return (
    <AppBar position="sticky" elevation={1}>
      <Container maxWidth="lg">
        <Toolbar disableGutters>
          {/* Logo */}
          <Typography
            variant="h6"
            component={Link}
            href={`/${locale}`}
            sx={{
              mr: 4,
              fontWeight: 700,
              color: 'inherit',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            Neram Classes
          </Typography>

          {/* Desktop Navigation */}
          {!isMobile && (
            <Box sx={{ flexGrow: 1, display: 'flex', gap: 1 }}>
              {navigationLinks.map((link) => (
                <Button
                  key={link.href}
                  component={Link}
                  href={getLocalizedPath(link.href, locale)}
                  sx={{ color: 'inherit' }}
                >
                  {link.label}
                </Button>
              ))}
            </Box>
          )}

          {/* Language Switcher */}
          <Box sx={{ ml: 'auto' }}>
            <Button
              onClick={handleLangMenuOpen}
              sx={{ color: 'inherit' }}
              endIcon={<span>▼</span>}
            >
              {localeLabels[locale]}
            </Button>
            <Menu
              anchorEl={langMenuAnchor}
              open={Boolean(langMenuAnchor)}
              onClose={handleLangMenuClose}
            >
              {locales.map((loc) => (
                <MenuItem
                  key={loc}
                  component={Link}
                  href={getLocalizedPath(
                    typeof window !== 'undefined' ? window.location.pathname.replace(`/${locale}`, '') : '/',
                    loc
                  )}
                  onClick={handleLangMenuClose}
                  selected={loc === locale}
                >
                  {localeLabels[loc]}
                </MenuItem>
              ))}
            </Menu>
          </Box>

          {/* Mobile Menu Button */}
          {isMobile && (
            <IconButton
              edge="end"
              color="inherit"
              aria-label="menu"
              onClick={toggleMobileMenu}
              sx={{ ml: 2 }}
            >
              ☰
            </IconButton>
          )}
        </Toolbar>
      </Container>

      {/* Mobile Navigation Drawer */}
      <Drawer
        anchor="right"
        open={mobileMenuOpen}
        onClose={toggleMobileMenu}
      >
        <Box
          sx={{ width: 250 }}
          role="presentation"
          onClick={toggleMobileMenu}
        >
          <List>
            {navigationLinks.map((link) => (
              <ListItem
                key={link.href}
                component={Link}
                href={getLocalizedPath(link.href, locale)}
              >
                <ListItemText primary={link.label} />
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
    </AppBar>
  );
}
