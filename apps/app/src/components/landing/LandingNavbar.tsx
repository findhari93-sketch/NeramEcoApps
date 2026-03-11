'use client';

import { useState } from 'react';
import { AppBar, Toolbar, Box, Typography, Button, IconButton, SwipeableDrawer, List, ListItem, ListItemButton, ListItemText } from '@neram/ui';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import { neramTokens } from '@neram/ui';
import Link from 'next/link';
import { NAV_LINKS } from '@/lib/landing-data';

export default function LandingNavbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        className="ai-glass-nav"
        sx={{
          backgroundColor: 'transparent',
          zIndex: 1100,
        }}
      >
        <Toolbar
          sx={{
            maxWidth: 1200,
            width: '100%',
            mx: 'auto',
            px: { xs: 2, md: 3 },
            minHeight: { xs: 64, md: 72 },
          }}
        >
          {/* Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
            <Box
              component={Link}
              href="/"
              sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none' }}
            >
              <Box
                component="img"
                src="/aiArchitect_logo_nata_coaching.png"
                alt="aiArchitek logo"
                sx={{ width: { xs: 32, md: 36 }, height: { xs: 32, md: 36 }, borderRadius: '50%' }}
              />
              <Typography
                variant="h6"
                sx={{
                  fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
                  fontWeight: 700,
                  fontSize: { xs: '1.25rem', md: '1.5rem' },
                  color: neramTokens.cream[100],
                  letterSpacing: '-0.02em',
                }}
              >
                ai
                <Box component="span" sx={{ color: neramTokens.gold[500] }}>
                  Architek
                </Box>
              </Typography>
            </Box>
          </Box>

          {/* Desktop nav links */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 3 }}>
            {NAV_LINKS.map((link) => (
              <Typography
                key={link.href}
                component="a"
                href={link.href}
                sx={{
                  fontFamily: 'var(--font-space-mono), "Space Mono", monospace',
                  fontSize: '0.8rem',
                  color: neramTokens.cream[200],
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                  '&:hover': { color: neramTokens.gold[500] },
                }}
              >
                {link.label}
              </Typography>
            ))}
          </Box>

          {/* Sign In CTA */}
          <Button
            component={Link}
            href="/login"
            variant="contained"
            size="small"
            sx={{
              ml: { xs: 1, md: 3 },
              bgcolor: neramTokens.gold[500],
              color: neramTokens.navy[950],
              fontWeight: 700,
              fontSize: '0.85rem',
              px: 3,
              py: 1,
              borderRadius: '8px',
              textTransform: 'none',
              display: { xs: 'none', sm: 'inline-flex' },
              '&:hover': {
                bgcolor: neramTokens.gold[400],
              },
            }}
          >
            Sign In
          </Button>

          {/* Mobile hamburger */}
          <IconButton
            onClick={() => setDrawerOpen(true)}
            sx={{
              display: { sm: 'none' },
              color: neramTokens.cream[100],
              ml: 1,
            }}
            aria-label="Open menu"
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Mobile drawer */}
      <SwipeableDrawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpen={() => setDrawerOpen(true)}
        PaperProps={{
          sx: {
            bgcolor: neramTokens.navy[900],
            width: 280,
            pt: 2,
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, mb: 2 }}>
          <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: neramTokens.cream[100] }}>
            <CloseIcon />
          </IconButton>
        </Box>
        <List>
          {NAV_LINKS.map((link) => (
            <ListItem key={link.href} disablePadding>
              <ListItemButton
                component="a"
                href={link.href}
                onClick={() => setDrawerOpen(false)}
                sx={{ py: 1.5, px: 3 }}
              >
                <ListItemText
                  primary={link.label}
                  primaryTypographyProps={{
                    fontFamily: 'var(--font-space-mono), "Space Mono", monospace',
                    fontSize: '0.9rem',
                    color: neramTokens.cream[100],
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
          <ListItem sx={{ px: 3, mt: 2 }}>
            <Button
              component={Link}
              href="/login"
              variant="contained"
              fullWidth
              sx={{
                bgcolor: neramTokens.gold[500],
                color: neramTokens.navy[950],
                fontWeight: 700,
                py: 1.5,
                borderRadius: '8px',
                textTransform: 'none',
                '&:hover': { bgcolor: neramTokens.gold[400] },
              }}
            >
              Sign In
            </Button>
          </ListItem>
        </List>
      </SwipeableDrawer>
    </>
  );
}
