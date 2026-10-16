'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  SwipeableDrawer,
  IconButton,
  CircularProgress,
  Alert,
} from '@neram/ui';
import { CloseIcon, CheckCircleIcon } from '@neram/ui';
import { useIsMobile } from '@neram/ui/hooks';
import YouTubeIcon from '@mui/icons-material/YouTube';
import { tokens as t } from '@/design-system/tokens';
import { brandColors } from '@/design-system/brand-colors';

/** 44px close target with the site focus ring. */
const closeButtonSx = {
  width: 44,
  height: 44,
  color: t.inkMuted,
  '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
} as const;

interface YouTubeSubscribeModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (result: { couponCode: string; discount: number }) => void;
}

type ModalState = 'idle' | 'loading' | 'waiting' | 'success' | 'error';

export default function YouTubeSubscribeModal({
  open,
  onClose,
  onSuccess,
}: YouTubeSubscribeModalProps) {
  const isMobile = useIsMobile();
  const [state, setState] = useState<ModalState>('idle');
  const [error, setError] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const popupRef = useRef<Window | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setState('idle');
      setError('');
      setCouponCode('');
    }
  }, [open]);

  // Listen for postMessage from popup
  useEffect(() => {
    if (!open) return;

    const handleMessage = (event: MessageEvent) => {
      // Validate origin
      if (event.origin !== window.location.origin) return;

      const { type, couponCode: code, discount, error: errMsg } = event.data || {};

      if (type === 'youtube_subscribe_success' && code) {
        setCouponCode(code);
        setState('success');
        onSuccess({ couponCode: code, discount: discount || 50 });
        // Close popup if still open
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        cleanupPolling();
      } else if (type === 'youtube_subscribe_error') {
        setError(errMsg || 'Subscription failed. Please try again.');
        setState('error');
        cleanupPolling();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [open, onSuccess]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupPolling();
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    };
  }, []);

  const cleanupPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const handleSubscribe = useCallback(async () => {
    setState('loading');
    setError('');

    try {
      // Get OAuth URL from our API
      const res = await fetch('/api/youtube/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ popupMode: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start subscription flow');
      }

      const { oauthUrl } = await res.json();

      // Open popup window centered on screen
      const width = 500;
      const height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        oauthUrl,
        'youtube_subscribe',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );

      if (!popup) {
        setError('Popup was blocked. Please allow popups for this site and try again.');
        setState('error');
        return;
      }

      popupRef.current = popup;
      setState('waiting');

      // Poll to detect if popup was closed without completing
      pollTimerRef.current = setInterval(() => {
        if (popup.closed) {
          cleanupPolling();
          // Only update state if we haven't received a success/error message
          setState((current) => {
            if (current === 'waiting') {
              return 'idle';
            }
            return current;
          });
        }
      }, 500);
    } catch (err) {
      console.error('Subscribe error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setState('error');
    }
  }, []);

  const content = (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header with YouTube icon */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: `${t.radius}px`,
            bgcolor: t.navy900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}
        >
          <YouTubeIcon aria-hidden sx={{ fontSize: 36, color: brandColors.youtube }} />
        </Box>

        {state === 'success' ? (
          <>
            <CheckCircleIcon aria-hidden sx={{ fontSize: 48, color: t.success, mb: 1 }} />
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Subscription Verified!
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Your Rs. 50 discount has been applied.
            </Typography>
            {couponCode && (
              <Box
                sx={{
                  fontFamily: t.fontMono,
                  fontSize: 18,
                  fontWeight: 700,
                  color: t.ink,
                  bgcolor: t.ground,
                  border: `1px dashed ${t.lineStrong}`,
                  p: 1.5,
                  borderRadius: `${t.radius}px`,
                  display: 'inline-block',
                  letterSpacing: 1,
                }}
              >
                {couponCode}
              </Box>
            )}
            <Box sx={{ mt: 3 }}>
              <Button variant="contained" onClick={onClose} fullWidth sx={{ minHeight: 48, borderRadius: `${t.radius}px`, textTransform: 'none', fontWeight: 700 }}>
                Continue
              </Button>
            </Box>
          </>
        ) : (
          <>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Subscribe & Save Rs. 50
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Subscribe to Neram Classes on YouTube and get an instant Rs. 50 discount on your course fee!
            </Typography>
          </>
        )}
      </Box>

      {state !== 'success' && (
        <>
          {/* How it works */}
          <Box
            sx={{
              bgcolor: t.ground,
              border: `1px solid ${t.line}`,
              borderRadius: `${t.radius}px`,
              p: 2,
              mb: 3,
            }}
          >
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, fontSize: { xs: '1rem', sm: '0.875rem' }, color: t.ink }}>
              How it works:
            </Typography>
            <Box
              component="ol"
              sx={{ pl: 2.5, m: 0, '& li': { fontSize: { xs: '1rem', sm: '0.875rem' }, lineHeight: 1.5, color: t.inkMuted, mb: 0.5 } }}
            >
              <li>Click the button below to sign in with Google</li>
              <li>Authorize YouTube subscription access</li>
              <li>We&apos;ll subscribe you to our channel automatically</li>
              <li>Rs. 50 discount is applied instantly!</li>
            </Box>
          </Box>

          {/* Error message */}
          {state === 'error' && error && (
            <Alert severity="error" sx={{ mb: 2, fontSize: '0.875rem' }}>
              {error}
            </Alert>
          )}

          {/* Subscribe button */}
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleSubscribe}
            disabled={state === 'loading' || state === 'waiting'}
            startIcon={
              state === 'loading' || state === 'waiting' ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <YouTubeIcon />
              )
            }
            sx={{
              py: 1.5,
              minHeight: 48,
              borderRadius: `${t.radius}px`,
              fontWeight: 700,
              fontSize: '1rem',
              textTransform: 'none',
              '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
            }}
          >
            {state === 'loading'
              ? 'Starting...'
              : state === 'waiting'
                ? 'Waiting for subscription...'
                : 'Subscribe with Google'}
          </Button>

          {state === 'waiting' && (
            <Typography
              variant="caption"
              role="status"
              sx={{ display: 'block', textAlign: 'center', mt: 1.5, fontSize: '0.875rem', color: t.inkMuted }}
            >
              Complete the subscription in the popup window.
              <br />
              The discount will be applied automatically.
            </Typography>
          )}

          {/* Privacy note */}
          <Typography
            variant="caption"
            sx={{ display: 'block', textAlign: 'center', mt: 2, fontSize: '0.8125rem', color: t.inkMuted }}
          >
            We only request permission to subscribe you to our channel.
            No other data is collected.
          </Typography>
        </>
      )}
    </Box>
  );

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        onOpen={() => {}}
        disableSwipeToOpen
        PaperProps={{
          sx: {
            borderTopLeftRadius: t.radius,
            borderTopRightRadius: t.radius,
            maxHeight: '85vh',
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1, pb: 0 }}>
          <IconButton onClick={onClose} aria-label="Close" sx={closeButtonSx}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        {content}
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: `${t.radius}px` } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 0 }}>
        <span />
        <IconButton onClick={onClose} aria-label="Close" sx={closeButtonSx}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>{content}</DialogContent>
    </Dialog>
  );
}
