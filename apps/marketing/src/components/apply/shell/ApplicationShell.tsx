'use client';

import { useCallback, useMemo, useState } from 'react';
import { Link } from '@/i18n/routing';
import { Box, Button, Container, Menu, MenuItem, Typography, neramTokens, neramaiArchitekLightTheme } from '@neram/ui';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import HelpOutline from '@mui/icons-material/HelpOutline';
import PhoneOutlined from '@mui/icons-material/PhoneOutlined';
import MailOutline from '@mui/icons-material/MailOutline';
import LockOutlined from '@mui/icons-material/LockOutlined';
import BrandWordmark from '@/components/brand/BrandWordmark';
import { useTranslations } from 'next-intl';
import { SHELL_HEADER_HEIGHT } from './constants';
import { ShellActionsProvider, type LoginHandler } from './ShellActionsContext';

const OFFICE_PHONE = '+91 91761 37043';
const OFFICE_TEL = 'tel:+919176137043';

/** Inline text links, but still a 44 px target on a phone. */
const legalLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44, padding: '0 8px' };

/**
 * The 2026 brand theme (navy, gold, serif headings) that the homepage already
 * uses, with two local fixes: ink text on the gold button (the theme's white
 * on gold fails contrast) and the `primary.50` tint the step cards reference.
 */
const shellTheme = createTheme(neramaiArchitekLightTheme, {
  palette: { primary: { 50: '#fff8e8', 100: '#fdebc4' }, success: { 50: '#edf9f0' } },
  components: {
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
          color: neramTokens.navy[900],
          '&:hover': { background: neramTokens.gold[600], color: neramTokens.navy[900] },
        },
      },
    },
  },
});

interface ApplicationShellProps {
  children: React.ReactNode;
  /** Reserved for the Nera sheet (sub-project D-B). When set, Help opens it instead of the menu. */
  onHelp?: () => void;
}

/**
 * The focused shell for /apply, /pay and /enroll, built like a checkout: the
 * same brand wordmark, bar height and container width as the site Header (so
 * the logo does not jump when a student taps Join Now), a quiet "Secure
 * application" cue from tablet up, one Help button, a Log in button whenever
 * the page registers one (see useShellLogin), the page, and a one-line legal
 * strip. No navigation, no footer, nothing floating. Step titles and progress
 * live inside the form (StepShell), so this component holds no form state.
 * The logo can safely leave the flow: FormContext keeps the draft.
 */
export default function ApplicationShell({ children, onHelp }: ApplicationShellProps) {
  const t = useTranslations('apply');
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [login, setLogin] = useState<LoginHandler | null>(null);
  const registerLogin = useCallback((handler: LoginHandler | null) => setLogin(() => handler), []);
  const shellActions = useMemo(() => ({ login, registerLogin }), [login, registerLogin]);

  return (
    <ThemeProvider theme={shellTheme}>
      <ShellActionsProvider value={shellActions}>
        <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', color: 'text.primary' }}>
          <Box
            component="header"
            role="banner"
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 20,
              bgcolor: 'background.paper',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Container maxWidth="lg">
              <Box sx={{ height: SHELL_HEADER_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Link
                  href="/"
                  aria-label={t('shell.home')}
                  style={{ display: 'inline-flex', alignItems: 'center', minHeight: 48, textDecoration: 'none', color: 'inherit' }}
                >
                  <BrandWordmark />
                </Link>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
                  <Box
                    sx={{
                      display: { xs: 'none', sm: 'flex' },
                      alignItems: 'center',
                      gap: 0.75,
                      pr: 1.5,
                      mr: 0.5,
                      borderRight: 1,
                      borderColor: 'divider',
                      color: 'text.secondary',
                    }}
                  >
                    <LockOutlined sx={{ fontSize: 18 }} aria-hidden />
                    <Typography variant="body2" component="span" color="inherit">
                      {t('shell.secure')}
                    </Typography>
                  </Box>
                  <Button
                    variant="text"
                    color="inherit"
                    startIcon={<HelpOutline />}
                    onClick={(e) => (onHelp ? onHelp() : setAnchor(e.currentTarget))}
                    aria-haspopup={onHelp ? undefined : 'menu'}
                    sx={{ minHeight: 48, px: 1.5, fontWeight: 600 }}
                  >
                    {t('shell.help')}
                  </Button>
                  <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                    <MenuItem component="a" href={OFFICE_TEL} onClick={() => setAnchor(null)} sx={{ minHeight: 48 }}>
                      <PhoneOutlined fontSize="small" sx={{ mr: 1.5 }} />
                      {t('shell.callUs')} {OFFICE_PHONE}
                    </MenuItem>
                    <MenuItem component={Link} href="/contact" onClick={() => setAnchor(null)} sx={{ minHeight: 48 }}>
                      <MailOutline fontSize="small" sx={{ mr: 1.5 }} />
                      {t('shell.contactPage')}
                    </MenuItem>
                  </Menu>
                  {login && (
                    <>
                      <Typography
                        variant="body2"
                        component="span"
                        color="text.secondary"
                        sx={{ display: { xs: 'none', md: 'inline' }, ml: 1 }}
                      >
                        {t('shell.haveAccount')}
                      </Typography>
                      <Button
                        variant="outlined"
                        color="inherit"
                        onClick={login}
                        sx={{
                          minHeight: 44,
                          px: 2,
                          ml: { xs: 0.5, md: 0 },
                          borderWidth: 2,
                          borderColor: 'text.primary',
                          fontWeight: 700,
                          '&:hover': { borderWidth: 2, borderColor: 'text.primary', bgcolor: 'text.primary', color: 'background.paper' },
                        }}
                      >
                        {t('shell.logIn')}
                      </Button>
                    </>
                  )}
                </Box>
              </Box>
            </Container>
          </Box>

          <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {children}
          </Box>

          <Box component="footer" sx={{ py: 2, px: 2, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
            <Container maxWidth="sm" sx={{ px: 0 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                component="div"
                sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}
              >
                <Link href="/terms" style={legalLinkStyle}>{t('shell.terms')}</Link>
                <Link href="/privacy" style={legalLinkStyle}>{t('shell.privacy')}</Link>
                <Link href="/refund-policy" style={legalLinkStyle}>{t('shell.refund')}</Link>
              </Typography>
            </Container>
          </Box>
        </Box>
      </ShellActionsProvider>
    </ThemeProvider>
  );
}
