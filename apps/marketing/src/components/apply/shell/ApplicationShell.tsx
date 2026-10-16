'use client';

import { useCallback, useMemo, useState } from 'react';
import { Link } from '@/i18n/routing';
import { Box, Button, Menu, MenuItem, Typography, siteDarkTheme } from '@neram/ui';
import { ThemeProvider } from '@mui/material/styles';
import { useFirebaseAuth } from '@neram/auth';
import HelpOutline from '@mui/icons-material/HelpOutline';
import PhoneOutlined from '@mui/icons-material/PhoneOutlined';
import MailOutline from '@mui/icons-material/MailOutline';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import BrandWordmark from '@/components/brand/BrandWordmark';
import { tokens as t } from '@/design-system';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';
import { useTranslations } from 'next-intl';
import { SHELL_HEADER_HEIGHT } from './constants';
import { ShellActionsProvider, type LoginHandler } from './ShellActionsContext';
import { applyTheme } from './applyTheme';

const OFFICE_PHONE = '+91 91761 37043';
const OFFICE_TEL = 'tel:+919176137043';

const menuItemSx = {
  minHeight: 52,
  gap: 1.5,
  px: 2,
  fontSize: 15,
  color: t.ink,
  '&:not(:last-of-type)': { borderBottom: `1px solid ${t.line}` },
  '&:hover': { bgcolor: t.ground },
  '& svg': { fontSize: 20, color: t.inkMuted },
} as const;

const legalLinkSx = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  px: 1,
  color: t.inkMuted,
  '&:hover': { color: t.ink },
  '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
} as const;

/**
 * The focused shell for /apply, /pay and /enroll, built like a checkout on the
 * site's navy header: the same wordmark, 64px bar and 1680px width as the Site
 * Header (so the logo does not jump when a student taps Join Now), a quiet
 * "Secure application" cue from tablet up, one "Need help?" menu, a Log in
 * button whenever the page registers one (see useShellLogin) or the signed-in
 * initial, the page, and a one-line legal strip. No navigation, nothing
 * floating. The logo can safely leave the flow: FormContext keeps the draft.
 */
export default function ApplicationShell({ children, onHelp }: { children: React.ReactNode; onHelp?: () => void }) {
  const tr = useTranslations('apply');
  const { user } = useFirebaseAuth();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [login, setLogin] = useState<LoginHandler | null>(null);
  const registerLogin = useCallback((handler: LoginHandler | null) => setLogin(() => handler), []);
  const shellActions = useMemo(() => ({ login, registerLogin }), [login, registerLogin]);
  const initial = (user?.name || user?.email || '').trim().charAt(0).toUpperCase();

  return (
    <ThemeProvider theme={applyTheme}>
      <ShellActionsProvider value={shellActions}>
        <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: t.ground, color: t.ink }}>
          <ThemeProvider theme={siteDarkTheme}>
            <Box
              component="header"
              role="banner"
              sx={{ position: 'sticky', top: 0, zIndex: 40, bgcolor: t.navy900, color: t.paper, borderBottom: `1px solid ${t.lineDark}` }}
            >
              <Box
                sx={{
                  maxWidth: 1680,
                  mx: 'auto',
                  px: { xs: 2, md: 3 },
                  boxSizing: 'border-box',
                  height: SHELL_HEADER_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box
                  component={Link}
                  href="/"
                  aria-label={tr('shell.home')}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 48,
                    flexShrink: 0,
                    textDecoration: 'none',
                    color: 'inherit',
                    '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
                  }}
                >
                  <BrandWordmark />
                </Box>
                <Box sx={{ flex: 1 }} />
                <Box
                  sx={{
                    display: { xs: 'none', sm: 'flex' },
                    alignItems: 'center',
                    gap: 0.75,
                    pr: 1.75,
                    mr: 0.5,
                    borderRight: '1px solid rgba(255,255,255,0.12)',
                    color: t.paperMuted,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <LockOutlined sx={{ fontSize: 18 }} aria-hidden />
                  <Typography component="span" sx={{ fontSize: 14, color: 'inherit' }}>
                    {tr('shell.secure')}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<HelpOutline />}
                  onClick={(e) => (onHelp ? onHelp() : setAnchor(e.currentTarget))}
                  aria-haspopup={onHelp ? undefined : 'menu'}
                  aria-expanded={onHelp ? undefined : !!anchor}
                  aria-label={tr('shell.help')}
                  sx={{
                    minHeight: 44,
                    minWidth: 44,
                    px: { xs: 1.25, sm: 1.75 },
                    borderRadius: `${t.radius}px`,
                    border: '1px solid rgba(245,240,232,0.24)',
                    color: t.paper,
                    bgcolor: 'transparent',
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    '&:hover': { borderColor: t.gold500, bgcolor: 'transparent', color: t.paper },
                    '&.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: '2px' },
                    // A phone shows the icon only, so Log in still fits in Tamil and Malayalam.
                    '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 }, ml: { xs: 0, sm: -0.5 }, '& svg': { fontSize: 20 } },
                  }}
                >
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    {tr('shell.help')}
                  </Box>
                </Button>
                {login ? (
                  <Button
                    variant="text"
                    onClick={login}
                    sx={{
                      minHeight: 44,
                      px: 1.5,
                      ml: 0.5,
                      borderRadius: `${t.radius}px`,
                      color: t.paper,
                      fontSize: 14,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      '&:hover': { bgcolor: t.lineDark, color: t.paper },
                      '&.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: '2px' },
                    }}
                  >
                    {tr('shell.logIn')}
                  </Button>
                ) : (
                  user &&
                  initial && (
                    <Box
                      aria-hidden
                      sx={{
                        width: 40,
                        height: 40,
                        ml: 0.5,
                        flexShrink: 0,
                        borderRadius: '50%',
                        bgcolor: 'rgba(255,255,255,0.16)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          bgcolor: t.navy700,
                          color: t.paper,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontWeight: 700,
                        }}
                      >
                        {initial}
                      </Box>
                    </Box>
                  )
                )}
              </Box>
            </Box>
          </ThemeProvider>

          <Menu
            anchorEl={anchor}
            open={!!anchor}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1,
                  width: 280,
                  maxWidth: 'calc(100vw - 32px)',
                  borderRadius: `${t.radius}px`,
                  border: `1px solid ${t.line}`,
                  boxShadow: t.shadowMegaMenu,
                },
              },
            }}
            MenuListProps={{ sx: { py: 0 } }}
          >
            <MenuItem component="a" href={OFFICE_TEL} onClick={() => setAnchor(null)} sx={menuItemSx}>
              <PhoneOutlined aria-hidden />
              {tr('shell.callUs')} {OFFICE_PHONE}
            </MenuItem>
            <MenuItem
              component={Link}
              href="/demo-class?from=apply_help"
              onClick={() => {
                setAnchor(null);
                trackTaxonomyEvent('demo_entry_clicked', { from: 'apply_help' });
              }}
              sx={menuItemSx}
            >
              <VideocamOutlined aria-hidden />
              {tr('shell.bookDemo')}
            </MenuItem>
            <MenuItem component={Link} href="/contact" onClick={() => setAnchor(null)} sx={menuItemSx}>
              <MailOutline aria-hidden />
              {tr('shell.contactPage')}
            </MenuItem>
          </Menu>

          <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {children}
          </Box>

          <Box component="footer" sx={{ bgcolor: t.surface, borderTop: `1px solid ${t.line}` }}>
            <Box
              sx={{
                maxWidth: 1680,
                mx: 'auto',
                px: { xs: 2, md: 3 },
                py: 1,
                boxSizing: 'border-box',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                columnGap: 2,
                fontSize: 14,
                color: t.inkMuted,
              }}
            >
              <Box component="nav" aria-label={tr('shell.legalNav')} sx={{ display: 'flex', flexWrap: 'wrap', ml: -1 }}>
                <Box component={Link} href="/terms" sx={legalLinkSx}>{tr('shell.terms')}</Box>
                <Box component={Link} href="/privacy" sx={legalLinkSx}>{tr('shell.privacy')}</Box>
                <Box component={Link} href="/refund-policy" sx={legalLinkSx}>{tr('shell.refund')}</Box>
              </Box>
              <Box component="span">{tr('shell.copyright')}</Box>
            </Box>
          </Box>
        </Box>
      </ShellActionsProvider>
    </ThemeProvider>
  );
}
