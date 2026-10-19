'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Button,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Typography,
  Divider,
  LoginModal,
  Dialog,
  DialogTitle,
  DialogContent,
  LanguageIcon,
  ListItemIcon,
} from '@neram/ui';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { useTranslations } from 'next-intl';
import { useFirebaseAuth, firebaseSignOut, signInWithCustomToken } from '@neram/auth';
import { useGoToApp } from '@/hooks/useGoToApp';
import { usePathname, useRouter } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { locales, localeLabels, type Locale } from '@/i18n';
import { tokens as t } from '@/design-system';
import type { HeaderTone } from './header/header-tone';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

/** The drawer's "Log in" asks the one AuthButton in the header bar to open its modal. */
export const OPEN_LOGIN_EVENT = 'neram:open-login';
export function requestLogin() {
  window.dispatchEvent(new Event(OPEN_LOGIN_EVENT));
}

/** Sign out here and in the tools app (hidden iframe), then reload. */
export function useSiteSignOut() {
  const [signingOut, setSigningOut] = useState(false);
  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await firebaseSignOut();
      // Clear SSO flag so next visit to tools app retries SSO
      try { sessionStorage.removeItem('neram_sso_attempted'); } catch {}
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = `${APP_URL}/auth/signout`;
      document.body.appendChild(iframe);
      // Give iframe time to sign out, then reload
      setTimeout(() => {
        iframe.remove();
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Sign out error:', error);
      window.location.reload();
    } finally {
      setSigningOut(false);
    }
  }, []);
  return { signOut, signingOut };
}

/** 40px ring (gold for enrolled students) around a 32px navy700 avatar. */
export function AvatarRing({
  name,
  avatar,
  goldRing,
  tone,
}: {
  name: string;
  avatar?: string | null;
  goldRing: boolean;
  tone: HeaderTone;
}) {
  return (
    <Box
      component="span"
      sx={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: goldRing ? t.gold500 : tone === 'light' ? t.line : 'rgba(255,255,255,0.16)',
      }}
    >
      <Avatar
        src={avatar || undefined}
        alt=""
        imgProps={{ referrerPolicy: 'no-referrer' }}
        sx={{ width: 32, height: 32, bgcolor: t.navy700, color: t.paper, fontSize: 14, fontWeight: 700 }}
      >
        {name[0]?.toUpperCase() || 'U'}
      </Avatar>
    </Box>
  );
}

interface AuthButtonProps {
  tone?: HeaderTone;
  /** Enrolled students get the solid gold ring. */
  goldRing?: boolean;
}

/** Reserved while auth loads, so the bar never jumps (bell 44 + gap 4 + avatar 40 + margin). */
const SLOT_WIDTH = 92;

function AuthButtonInner({ tone = 'dark', goldRing = false }: AuthButtonProps) {
  const tr = useTranslations('header');
  const { user, loading } = useFirebaseAuth();
  const { goToApp } = useGoToApp();
  const { signOut, signingOut } = useSiteSignOut();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [langDialogOpen, setLangDialogOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as Locale;
  const ink = tone === 'light' ? t.ink : t.paper;

  // Handle custom token from cross-domain auth (backward compatibility)
  useEffect(() => {
    const authToken = searchParams.get('authToken');
    if (authToken && !user && !loading && !signingIn) {
      setSigningIn(true);
      signInWithCustomToken(authToken)
        .then(() => {
          // Remove authToken from URL without refresh
          const url = new URL(window.location.href);
          url.searchParams.delete('authToken');
          window.history.replaceState({}, '', url.toString());
        })
        .catch((error: Error) => {
          console.error('Error signing in with custom token:', error);
          // Remove authToken from URL to prevent retry loop
          const url = new URL(window.location.href);
          url.searchParams.delete('authToken');
          window.history.replaceState({}, '', url.toString());
        })
        .finally(() => {
          setSigningIn(false);
        });
    }
  }, [searchParams, user, loading, signingIn]);

  useEffect(() => {
    const open = () => setLoginModalOpen(true);
    window.addEventListener(OPEN_LOGIN_EVENT, open);
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, open);
  }, []);

  const handleMenuClose = () => setAnchorEl(null);

  const handleLocaleChange = (newLocale: Locale) => {
    router.replace(pathname, { locale: newLocale });
    setLangDialogOpen(false);
  };

  if (loading || signingIn) {
    return <Box aria-hidden sx={{ width: SLOT_WIDTH, height: 44, flexShrink: 0 }} />;
  }

  const loginModal = (
    <LoginModal
      open={loginModalOpen}
      onClose={() => setLoginModalOpen(false)}
      allowClose={true}
      onAuthenticated={() => setLoginModalOpen(false)}
      apiBaseUrl={APP_URL}
    />
  );

  if (!user) {
    return (
      <>
        <Box
          component="button"
          type="button"
          onClick={() => setLoginModalOpen(true)}
          sx={{
            height: 44,
            px: 1.5,
            ml: 0.5,
            flexShrink: 0,
            border: 0,
            borderRadius: `${t.radius}px`,
            bgcolor: 'transparent',
            color: ink,
            font: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            '&:hover': { bgcolor: tone === 'light' ? t.surfaceHover : 'rgba(255,255,255,0.08)' },
            '&:focus-visible': { outline: t.focusOutline, outlineOffset: 2 },
          }}
        >
          {tr('logIn')}
        </Box>
        {loginModal}
      </>
    );
  }

  const name = user.name || user.email || 'User';

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label={tr('account')}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchorEl)}
        onClick={(e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
        sx={{
          width: 44,
          height: 44,
          p: 0,
          ml: 0.25,
          flexShrink: 0,
          border: 0,
          borderRadius: '50%',
          bgcolor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          '&:focus-visible': { outline: t.focusOutline, outlineOffset: 1 },
        }}
      >
        <AvatarRing name={name} avatar={user.avatar} goldRing={goldRing} tone={tone} />
      </Box>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        disableScrollLock
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        // A white panel like the mega menu, whatever the header tone. Inside a dark
        // band the dark theme would paint the paper navy800 under ink text, and its
        // white hover tint would vanish, so every state sets its own colours.
        PaperProps={{
          sx: {
            minWidth: 240,
            mt: 1,
            borderRadius: `${t.radius}px`,
            border: `1px solid ${t.line}`,
            bgcolor: t.surface,
            color: t.ink,
            backgroundImage: 'none',
            boxShadow: t.shadowMegaMenu,
          },
        }}
        MenuListProps={{
          sx: {
            py: 0.5,
            '& .MuiMenuItem-root': {
              minHeight: 48,
              fontSize: 15,
              color: t.ink,
              '&:hover': { bgcolor: t.surfaceHover },
              '&.Mui-focusVisible': { bgcolor: t.surfaceHover, outline: t.focusOutline, outlineOffset: -2 },
              '&.Mui-disabled': { opacity: 1, color: t.inkMuted },
            },
            '& .MuiListItemIcon-root': { color: t.inkMuted },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: t.ink }} noWrap>
            {user.name || 'User'}
          </Typography>
          <Typography sx={{ fontSize: 13, color: t.inkMuted }} noWrap>
            {user.email}
          </Typography>
        </Box>
        <Divider sx={{ borderColor: t.line }} />
        <MenuItem onClick={() => { handleMenuClose(); goToApp(); }}>
          <ListItemIcon sx={{ minWidth: 32, color: t.inkMuted }}>
            <NorthEastIcon fontSize="small" />
          </ListItemIcon>
          {tr('goToApp')}
        </MenuItem>
        <MenuItem onClick={() => { handleMenuClose(); setLangDialogOpen(true); }}>
          <ListItemIcon sx={{ minWidth: 32, color: t.inkMuted }}>
            <LanguageIcon fontSize="small" />
          </ListItemIcon>
          {tr('changeLanguage')}
        </MenuItem>
        <MenuItem onClick={() => { void signOut(); }} disabled={signingOut}>
          <ListItemIcon sx={{ minWidth: 32, color: t.inkMuted }}>
            <LogoutOutlinedIcon fontSize="small" />
          </ListItemIcon>
          {tr('signOut')}
        </MenuItem>
      </Menu>

      <Dialog
        open={langDialogOpen}
        onClose={() => setLangDialogOpen(false)}
        PaperProps={{ sx: { minWidth: 280, borderRadius: `${t.radius}px` } }}
      >
        <DialogTitle sx={{ pb: 1 }}>{tr('changeLanguage')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: '8px !important' }}>
          {locales.map((loc) => (
            <Button
              key={loc}
              variant={loc === locale ? 'contained' : 'outlined'}
              fullWidth
              onClick={() => handleLocaleChange(loc)}
              sx={{ textTransform: 'none', justifyContent: 'flex-start', px: 2, minHeight: 48, borderRadius: `${t.radius}px` }}
            >
              {localeLabels[loc]}
            </Button>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Wrapper component with Suspense boundary for useSearchParams
export default function AuthButton(props: AuthButtonProps) {
  return (
    <Suspense fallback={<Box aria-hidden sx={{ width: SLOT_WIDTH, height: 44, flexShrink: 0 }} />}>
      <AuthButtonInner {...props} />
    </Suspense>
  );
}
