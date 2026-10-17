'use client';

/**
 * Shown in place of the chat input when a guest comes back on a later day:
 * Aintra is free on the first day, after that it asks them to sign in. One
 * tap opens the same Google and phone OTP sign-in the Apply page uses, and the
 * question they typed is sent as soon as they are in.
 */
import { Box, Typography } from '@neram/ui';
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded';
import { CtaButton, tokens as t } from '@/design-system';

export default function SignInGateCard({
  pendingQuestion,
  onSignIn,
}: {
  /** What they asked; it goes out by itself after sign-in. */
  pendingQuestion: string | null;
  onSignIn: () => void;
}) {
  return (
    <Box
      role="region"
      aria-label="Sign in to keep chatting"
      data-testid="aintra-signin-gate"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        px: 2,
        pt: 1.75,
        pb: 'calc(14px + env(safe-area-inset-bottom))',
        borderTop: `1px solid ${t.line}`,
        bgcolor: t.surface,
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
        <Box
          aria-hidden
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            bgcolor: t.goldTintBg,
            color: t.gold800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <LockOpenRoundedIcon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="p" sx={{ fontSize: '1rem', fontWeight: 600, color: t.ink, lineHeight: 1.4 }}>
            Welcome back! Sign in to keep chatting
          </Typography>
          <Typography component="p" sx={{ fontSize: '0.875rem', color: t.inkMuted, lineHeight: 1.5, mt: 0.25 }}>
            It is free and takes under a minute. We keep your chat, and our team can help you personally.
          </Typography>
        </Box>
      </Box>

      {pendingQuestion && (
        <Typography
          component="p"
          sx={{
            fontSize: '0.875rem',
            color: t.inkMuted,
            lineHeight: 1.5,
            px: 1.5,
            py: 1,
            borderRadius: `${t.radius}px`,
            bgcolor: t.ground,
            border: `1px solid ${t.line}`,
            overflowWrap: 'anywhere',
          }}
        >
          Your question is saved: <Box component="span" sx={{ color: t.ink, fontWeight: 500 }}>&ldquo;{pendingQuestion}&rdquo;</Box>
        </Typography>
      )}

      <CtaButton variant="primary" fullWidth onClick={onSignIn} sx={{ minHeight: 48 }}>
        Sign in to continue
      </CtaButton>
    </Box>
  );
}
