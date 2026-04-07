'use client';

/**
 * AuthFunnelChart - Horizontal funnel showing auth step conversion rates
 * Shows: Auth Started → Completed → Registered → Phone Shown → OTP Sent → Verified
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Skeleton,
  ToggleButtonGroup,
  ToggleButton,
  Paper,
} from '@mui/material';

interface FunnelTotals {
  auth_started: number;
  auth_completed: number;
  user_registered: number;
  phone_shown: number;
  phone_entered: number;
  otp_requested: number;
  otp_verified: number;
}

const FUNNEL_STEPS: { key: keyof FunnelTotals; label: string; color: string }[] = [
  { key: 'auth_started', label: 'Auth Started', color: '#64748B' },
  { key: 'auth_completed', label: 'Auth Done', color: '#3B82F6' },
  { key: 'user_registered', label: 'Registered', color: '#6366F1' },
  { key: 'phone_shown', label: 'Phone Screen', color: '#F59E0B' },
  { key: 'otp_requested', label: 'OTP Sent', color: '#F97316' },
  { key: 'otp_verified', label: 'Verified', color: '#22C55E' },
];

export default function AuthFunnelChart() {
  const [totals, setTotals] = useState<FunnelTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');

  useEffect(() => {
    async function fetchSummary() {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/funnel-summary?days=${days}`);
        if (res.ok) {
          const data = await res.json();
          setTotals(data.totals);
        }
      } catch (err) {
        console.error('Failed to fetch funnel summary:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, [days]);

  if (loading) {
    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Skeleton variant="rectangular" height={80} />
      </Paper>
    );
  }

  if (!totals || totals.auth_started === 0) {
    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Auth Funnel: No data yet. Events will appear once users go through the auth flow.
        </Typography>
      </Paper>
    );
  }

  const maxValue = totals.auth_started || 1;

  // Find biggest drop-off
  let biggestDropIdx = -1;
  let biggestDropPct = 0;
  for (let i = 1; i < FUNNEL_STEPS.length; i++) {
    const prev = totals[FUNNEL_STEPS[i - 1].key] || 0;
    const curr = totals[FUNNEL_STEPS[i].key] || 0;
    if (prev > 0) {
      const dropPct = ((prev - curr) / prev) * 100;
      if (dropPct > biggestDropPct) {
        biggestDropPct = dropPct;
        biggestDropIdx = i;
      }
    }
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={600} color="text.primary">
          Auth Funnel
        </Typography>
        <ToggleButtonGroup
          size="small"
          value={days}
          exclusive
          onChange={(_, val) => val && setDays(val)}
        >
          <ToggleButton value="7" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>7d</ToggleButton>
          <ToggleButton value="30" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>30d</ToggleButton>
          <ToggleButton value="90" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>90d</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-end' }}>
        {FUNNEL_STEPS.map((step, idx) => {
          const value = totals[step.key] || 0;
          const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
          const isBiggestDrop = idx === biggestDropIdx;

          return (
            <Box
              key={step.key}
              sx={{
                flex: 1,
                textAlign: 'center',
                position: 'relative',
              }}
            >
              {/* Bar */}
              <Box
                sx={{
                  height: 40,
                  bgcolor: step.color,
                  opacity: 0.15 + (pct / 100) * 0.85,
                  borderRadius: 0.5,
                  mb: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'opacity 0.3s',
                }}
              >
                <Typography
                  variant="body2"
                  fontWeight={700}
                  sx={{ color: step.color, fontSize: '0.875rem' }}
                >
                  {value}
                </Typography>
              </Box>

              {/* Label */}
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.65rem',
                  color: isBiggestDrop ? '#EF4444' : 'text.secondary',
                  fontWeight: isBiggestDrop ? 700 : 400,
                  lineHeight: 1.2,
                  display: 'block',
                }}
              >
                {step.label}
              </Typography>

              {/* Percentage */}
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.6rem',
                  color: isBiggestDrop ? '#EF4444' : 'text.disabled',
                  fontWeight: isBiggestDrop ? 600 : 400,
                }}
              >
                {pct}%
                {isBiggestDrop && biggestDropPct > 10 && (
                  <span> ({Math.round(biggestDropPct)}% drop)</span>
                )}
              </Typography>

              {/* Arrow between steps */}
              {idx < FUNNEL_STEPS.length - 1 && (
                <Box
                  sx={{
                    position: 'absolute',
                    right: -6,
                    top: 14,
                    color: '#CBD5E1',
                    fontSize: '0.75rem',
                    zIndex: 1,
                  }}
                >
                  ›
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
