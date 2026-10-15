'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@neram/ui';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface HealthStats {
  total: number;
  failed: number;
  sent: number;
  failureRate: number;
  primaryErrorPrefix: string | null;
  primaryErrorCount: number;
  /** Meta's own reason, live, when the top error is WA_ACCOUNT_BLOCKED. */
  liveBlock?: string | null;
  /** WhatsApp Manager overview for our account, when WHATSAPP_BUSINESS_ACCOUNT_ID is set. */
  managerUrl?: string | null;
  windowHours: number;
}

const ERROR_HINTS: Record<string, { hint: string; actionUrl?: string; actionLabel?: string }> = {
  WA_ACCOUNT_BLOCKED: {
    hint: 'Meta is refusing every send from our WhatsApp Business Account. The phone number showing Connected is not enough. In WhatsApp Manager, check for a "Missing valid payment method" alert and that the display name is approved. If Meta still reports the account as not active, it needs WhatsApp support to activate it. Messages are held, not lost, and go out automatically once Meta allows sending.',
    actionUrl: 'https://business.facebook.com/latest/whatsapp_manager/overview/',
    actionLabel: 'Open WhatsApp Manager',
  },
  WA_DEV_MODE: {
    hint: 'WhatsApp Business App is not in Live mode. Verify business in Meta Business Suite and switch the app to Live.',
    actionUrl: 'https://business.facebook.com/settings/security',
    actionLabel: 'Open Meta Business',
  },
  WA_TEMPLATE_PARAM_MISMATCH: {
    hint: 'A WhatsApp template send failed because the parameters do not match the approved template definition.',
  },
  WA_RATE_LIMIT: {
    hint: 'Many sends are being throttled by Meta rate limits.',
  },
  WA_24H_WINDOW: {
    hint: 'Sends are failing because the 24h customer service window expired and no template was used.',
  },
  WA_UNDELIVERABLE: {
    hint: 'Many recipients are not registered on WhatsApp.',
  },
};

export default function WhatsAppHealthBanner() {
  const [stats, setStats] = useState<HealthStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/whatsapp-health')
      .then(r => r.ok ? r.json() : null)
      .then((data: HealthStats | null) => {
        if (!cancelled && data) setStats(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!stats) return null;

  const shouldShow = stats.total >= 3 && stats.failureRate > 0.5;
  if (!shouldShow) return null;

  const hint = stats.primaryErrorPrefix ? ERROR_HINTS[stats.primaryErrorPrefix] : undefined;
  const actionUrl =
    stats.primaryErrorPrefix === 'WA_ACCOUNT_BLOCKED' && stats.managerUrl ? stats.managerUrl : hint?.actionUrl;
  const pct = Math.round(stats.failureRate * 100);

  return (
    <Box
      role="alert"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        p: 1.5,
        mb: 2,
        bgcolor: '#FEF3C7',
        border: '1px solid #F59E0B',
        borderRadius: 2,
      }}
    >
      <WarningAmberIcon sx={{ color: '#B45309', mt: 0.25 }} fontSize="small" />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#78350F' }}>
          WhatsApp delivery is failing for {pct}% of sends in the last {stats.windowHours}h
          ({stats.failed} of {stats.total}).
        </Typography>
        {hint && (
          <Typography sx={{ fontSize: 13, color: '#78350F', mt: 0.5 }}>
            Likely cause: {hint.hint}
          </Typography>
        )}
        {stats.liveBlock && (
          <Typography sx={{ fontSize: 13, color: '#78350F', mt: 0.5 }}>
            Meta says right now: <Box component="span" sx={{ fontWeight: 600 }}>{stats.liveBlock}</Box>
          </Typography>
        )}
        {stats.primaryErrorPrefix && (
          <Typography sx={{ fontSize: 12, color: '#92400E', mt: 0.5, fontFamily: 'monospace' }}>
            Top error: {stats.primaryErrorPrefix} ({stats.primaryErrorCount} occurrences)
          </Typography>
        )}
        {actionUrl && (
          <Box sx={{ mt: 0.5 }}>
            <Typography
              component="a"
              href={actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: '#92400E',
                textDecoration: 'underline',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                minHeight: 44,
                px: 0.5,
                ml: -0.5,
                borderRadius: 1,
                '&:hover': { color: '#78350F' },
                '&:focus-visible': { outline: '2px solid #92400E', outlineOffset: 2 },
              }}
            >
              {hint?.actionLabel ?? 'Open'}
              <OpenInNewIcon sx={{ fontSize: 14 }} />
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
