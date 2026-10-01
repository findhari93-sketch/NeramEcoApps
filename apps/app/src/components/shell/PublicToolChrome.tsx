'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppBar, Toolbar, Box, Button, Typography } from '@neram/ui';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import BrandMark from './BrandMark';
import { TOP_BAR_HEIGHT } from './AppTopBar';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com';

/**
 * The frame around public tool pages for signed-out visitors and crawlers.
 * Same content width and padding as AppShell, so nothing jumps when a student
 * signs in and the app shell takes over.
 *
 * Parts marked `public-only` hide when this device was signed in last time
 * (html[data-auth-hint]), so a returning student does not see "Sign in" flash.
 */
export default function PublicToolChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/tools';
  const signInHref = `/login?redirect=${encodeURIComponent(pathname)}`;

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
          pt: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <Toolbar
          disableGutters
          sx={{
            minHeight: { xs: `${TOP_BAR_HEIGHT}px !important`, md: '64px !important' },
            px: { xs: 2, sm: 3, lg: 4 },
            gap: 1,
            maxWidth: 1280,
            width: '100%',
            mx: 'auto',
          }}
        >
          <Box
            component={Link}
            href="/"
            aria-label="aiArchitek home"
            sx={{ display: 'flex', alignItems: 'center', minHeight: 44, textDecoration: 'none', color: 'inherit', mr: 'auto', borderRadius: 1 }}
          >
            <BrandMark size="sm" />
          </Box>

          <Button
            component={Link}
            href="/tools"
            color="inherit"
            startIcon={<AppsRoundedIcon />}
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, minHeight: 44, px: 1.5, textTransform: 'none', fontWeight: 600 }}
          >
            All tools
          </Button>
          <Button
            component={Link}
            href={signInHref}
            variant="contained"
            className="public-only"
            sx={{ minHeight: 44, px: 2.5, textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Sign in
          </Button>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{ flexGrow: 1, outline: 'none', overflowX: 'hidden' }}
      >
        <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pt: { xs: 2, sm: 3 }, pb: { xs: 4, md: 6 }, maxWidth: 1280, mx: 'auto' }}>
          {children}
        </Box>
      </Box>

      <Box component="footer" sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box
          sx={{
            px: { xs: 2, sm: 3, lg: 4 },
            py: 3,
            maxWidth: 1280,
            mx: 'auto',
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: { xs: 1.5, sm: 3 },
            alignItems: { sm: 'center' },
          }}
        >
          <Typography variant="body2" sx={{ color: 'text.secondary', mr: { sm: 'auto' } }}>
            aiArchitek by Neram Classes. Free tools for NATA and JEE Paper 2.
          </Typography>
          <Box component="nav" aria-label="Footer" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
            {[
              { href: '/tools', label: 'All tools' },
              { href: MARKETING_URL, label: 'Neram Classes' },
              { href: '/privacy-policy', label: 'Privacy' },
              { href: `${MARKETING_URL}/terms`, label: 'Terms' },
            ].map((l) => (
              <Box
                key={l.label}
                component={l.href.startsWith('http') ? 'a' : Link}
                href={l.href}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44,
                  color: 'text.secondary',
                  fontSize: '0.875rem',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  '&:hover': { color: 'text.primary' },
                }}
              >
                {l.label}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
