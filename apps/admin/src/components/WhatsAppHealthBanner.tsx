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
  windowHours: number;
}

const ERROR_HINTS: Record<string, { hint: string; actionUrl?: string; actionLabel?: string }> = {
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
  const pct = Math.round(stats.failureRate * 100);

  return (
    <Box
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
        {stats.primaryErrorPrefix && (
          <Typography sx={{ fontSize: 12, color: '#92400E', mt: 0.5, fontFamily: 'monospace' }}>
            Top error: {stats.primaryErrorPrefix} ({stats.primaryErrorCount} occurrences)
          </Typography>
        )}
        {hint?.actionUrl && (
          <Box sx={{ mt: 1 }}>
            <Typography
              component="a"
              href={hint.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: '#B45309',
                textDecoration: 'underline',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              {hint.actionLabel ?? 'Open'}
              <OpenInNewIcon sx={{ fontSize: 14 }} />
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
