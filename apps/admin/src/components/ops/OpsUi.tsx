'use client';

/**
 * Small shared pieces for the ops screens (Duplicates, Follow-ups, Lifecycle,
 * Settings): page header, empty state, reduced-motion skeleton, status chip and
 * sign-in chips. Colours come from the @neram/ui theme palette only.
 */
import { type ReactNode, type ElementType } from 'react';
import { Box, Typography, Skeleton, Chip, Paper, useMediaQuery } from '@neram/ui';
import GoogleIcon from '@mui/icons-material/Google';
import MicrosoftIcon from '@mui/icons-material/Window';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import NoAccountsIcon from '@mui/icons-material/NoAccounts';
import { signInMethods, SIGN_IN_LABELS, type SignInMethod } from '@/lib/ops-format';

/** Visible keyboard focus for custom clickable things (buttons get it from the theme ripple). */
export const FOCUS_RING = {
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary.main',
    outlineOffset: '2px',
  },
} as const;

/** 44px minimum touch target for buttons and links. */
export const TARGET_44 = { minHeight: 44 } as const;

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** Skeleton that stops pulsing when the viewer asked for reduced motion. */
export function OpsSkeleton(props: { variant?: 'text' | 'rectangular' | 'rounded' | 'circular'; width?: number | string; height?: number | string; sx?: object }) {
  const reduce = usePrefersReducedMotion();
  return <Skeleton animation={reduce ? false : 'pulse'} {...props} />;
}

export function OpsPageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: ElementType;
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: { xs: 'stretch', md: 'center' },
        justifyContent: 'space-between',
        gap: 1.5,
        mb: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}>
        <Box
          aria-hidden
          sx={{
            width: 42,
            height: 42,
            flexShrink: 0,
            borderRadius: 1,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h1" fontWeight={700} sx={{ lineHeight: 1.25 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, maxWidth: 720 }}>
            {subtitle}
          </Typography>
        </Box>
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>{actions}</Box>
      )}
    </Box>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: ElementType;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ py: { xs: 4, md: 6 }, px: 2, textAlign: 'center', borderRadius: 2, borderStyle: 'dashed' }}
    >
      <Icon aria-hidden sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
      <Typography variant="subtitle1" component="p" fontWeight={700}>
        {title}
      </Typography>
      {body && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 480, mx: 'auto' }}>
          {body}
        </Typography>
      )}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Paper>
  );
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const TONE_COLOR: Record<Tone, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  neutral: 'default',
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

/** A status is always icon plus text, never colour alone. */
export function StatusChip({ icon: Icon, label, tone = 'neutral' }: { icon: ElementType; label: string; tone?: Tone }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={TONE_COLOR[tone]}
      icon={<Icon aria-hidden sx={{ fontSize: '16px !important' }} />}
      label={label}
      sx={{ fontWeight: 600, height: 26, maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
    />
  );
}

const METHOD_ICON: Record<SignInMethod, ElementType> = {
  google: GoogleIcon,
  microsoft: MicrosoftIcon,
  phone: PhoneIphoneIcon,
};

/** Google / Microsoft / Phone chips for a person, or "No sign-in" when none. */
export function SignInChips({
  person,
}: {
  person: { firebase_uid?: string | null; ms_oid?: string | null; phone?: string | null } | null | undefined;
}) {
  const methods = signInMethods(person);
  if (methods.length === 0) return <StatusChip icon={NoAccountsIcon} label="No sign-in" tone="warning" />;
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }} aria-label="Sign-in methods">
      {methods.map((m) => (
        <StatusChip key={m} icon={METHOD_ICON[m]} label={SIGN_IN_LABELS[m]} />
      ))}
    </Box>
  );
}
