'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { setAuthRedirectUrl } from '@neram/auth';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AuthButtons from '@/components/AuthButtons';
import { savePendingInput, type PendingInput } from '@/lib/tools/pending-input';
import type { ToolId } from '@/lib/tools/tool-ids';

interface DemoGateProps {
  toolId: ToolId;
  /** Short headline, e.g. "+11 more colleges match your score". */
  headline: string;
  /** What signing in adds, 2 to 4 short lines. */
  benefits: string[];
  /** The demo's current inputs, so the full tool opens with them after sign-in. */
  input?: PendingInput;
  /** Button label, defaults to "Sign in free to see all". */
  cta?: string;
}

/**
 * The card under a demo result. It never covers the result or the page; the
 * visitor chooses to sign in. Sign-in opens in place (a full-screen sheet on a
 * phone) and the page turns into the full tool when it succeeds. Without
 * JavaScript the button is a plain link to /login that returns here.
 */
export default function DemoGate({ toolId, headline, benefits, input, cta = 'Sign in free to see all' }: DemoGateProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || '/tools';
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const loginHref = `/login?redirect=${encodeURIComponent(pathname)}`;

  const start = (e: React.MouseEvent) => {
    e.preventDefault();
    if (input) savePendingInput(toolId, input);
    // After sign-in, AuthButtons returns to this same page (no token).
    setAuthRedirectUrl(`${pathname}${window.location.search}`);
    setOpen(true);
  };

  return (
    <Box
      component="section"
      aria-label="Sign in to use the full tool"
      sx={{
        mt: 2,
        p: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: (t) => alpha(t.palette.primary.main, 0.35),
        bgcolor: (t) => alpha(t.palette.primary.main, 0.05),
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: 'primary.main',
            bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
          }}
        >
          <LockOpenOutlinedIcon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="p" sx={{ fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.35 }}>
            {headline}
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'grid', gap: 0.75 }}>
            {benefits.map((b) => (
              <Box component="li" key={b} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <CheckCircleOutlineRoundedIcon aria-hidden="true" sx={{ fontSize: 20, color: 'success.main', mt: '1px' }} />
                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                  {b}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Button
        component={Link}
        href={loginHref}
        onClick={start}
        variant="contained"
        size="large"
        fullWidth
        sx={{ mt: 2, minHeight: 48, textTransform: 'none', fontWeight: 700, maxWidth: { sm: 360 } }}
      >
        {cta}
      </Button>
      <Typography variant="caption" component="p" sx={{ mt: 1, color: 'text.secondary' }}>
        Free. Sign in with Google or email. What you entered stays filled in.
      </Typography>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen={fullScreen}
        maxWidth="xs"
        fullWidth
        aria-labelledby="demo-gate-title"
      >
        <DialogTitle id="demo-gate-title" sx={{ pr: 7 }}>
          Sign in to continue
          <IconButton
            aria-label="Close"
            onClick={() => setOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8, width: 44, height: 44 }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Your free account opens the full tool on this page, with what you entered already filled in.
          </Typography>
          <AuthButtons />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
