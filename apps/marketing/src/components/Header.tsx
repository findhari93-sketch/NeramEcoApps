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
import { Link as MuiLink } from '@neram/ui';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { locales, localeLabels, type Locale } from '@/i18n';
import AuthButton from './AuthButton';

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
  const pathname = usePathname();
  const router = useRouter();

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
    <AppBar position="sticky" elevation={1}>
      <Container maxWidth="lg">
        <Toolbar disableGutters>
          {/* Logo */}
          <Typography
            variant="h6"
            sx={{
              mr: 4,
              fontWeight: 700,
              color: 'inherit',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              Neram Classes
            </Link>
          </Typography>

          {/* Desktop Navigation */}
          {!isMobile && (
            <Box sx={{ flexGrow: 1, display: 'flex', gap: 1 }}>
              {navigationLinks.map((link) => (
                <Button
                  key={link.href}
                  sx={{ color: 'inherit' }}
                >
                  <Link href={link.href} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {link.label}
                  </Link>
                </Button>
              ))}
            </Box>
          )}

          {/* Language Switcher & Auth */}
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
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
                  onClick={() => handleLocaleChange(loc)}
                  selected={loc === locale}
                >
                  {localeLabels[loc]}
                </MenuItem>
              ))}
            </Menu>

            {/* Auth Button */}
            <AuthButton />
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
        >
          <List>
            {navigationLinks.map((link) => (
              <ListItem key={link.href} onClick={toggleMobileMenu}>
                <Link href={link.href} style={{ color: 'inherit', textDecoration: 'none', width: '100%' }}>
                  <ListItemText primary={link.label} />
                </Link>
              </ListItem>
            ))}
          </List>
          <Box sx={{ px: 2, py: 1 }}>
            <AuthButton />
          </Box>
        </Box>
      </Drawer>
    </AppBar>
  );
}
