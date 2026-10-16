'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Slider,
  Chip,
} from '@mui/material';
import CalculateIcon from '@mui/icons-material/CalculateOutlined';
import { siteTokens as t } from '@neram/ui/site-tokens';
import Callout from '@/design-system/Callout';
import { errorColor } from '@/design-system/brand-colors';

const RADIUS = `${t.radius}px`;
const valueChipSx = { bgcolor: t.navy900, color: t.paper, fontWeight: 700 } as const;
const numberFieldSx = { width: 90, '& .MuiInputBase-root': { minHeight: 44 } } as const;

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export default function NataMeritCalculator() {
  const [nataRaw, setNataRaw] = useState<number>(120);
  const [qualifyingPercent, setQualifyingPercent] = useState<number>(75);

  const result = useMemo(() => {
    const nata = clamp(nataRaw, 0, 200);
    const pct = clamp(qualifyingPercent, 0, 100);
    const qualifyingScaled = (pct / 100) * 200;
    const total = nata + qualifyingScaled;
    return {
      nata: Math.round(nata * 100) / 100,
      qualifyingScaled: Math.round(qualifyingScaled * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [nataRaw, qualifyingPercent]);

  const band =
    result.total >= 320
      ? { label: 'Strong', color: t.success }
      : result.total >= 260
        ? { label: 'Competitive', color: t.navy900 }
        : result.total >= 200
          ? { label: 'Borderline', color: t.gold800 }
          : { label: 'Below average', color: errorColor };

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: RADIUS,
        border: `1px solid ${t.line}`,
        bgcolor: t.surface,
      }}
    >
      <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 1.5 }}>
        <CalculateIcon aria-hidden sx={{ color: t.gold800 }} />
        <Typography variant="subtitle1" fontWeight={800}>
          KEAM B.Arch Merit Calculator
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enter your NATA score (out of 200) and your 10+2 percentage. We add them together using the official 50:50 formula to give you a rank index out of 400.
      </Typography>

      <Stack spacing={2.5}>
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
            <Typography variant="body2" fontWeight={700}>
              NATA score (out of 200)
            </Typography>
            <Chip
              label={`${result.nata} / 200`}
              size="small"
              sx={valueChipSx}
            />
          </Stack>
          <Stack direction="row" gap={2} alignItems="center">
            <Slider
              value={nataRaw}
              onChange={(_, v) => setNataRaw(Array.isArray(v) ? v[0] : v)}
              min={0}
              max={200}
              step={1}
              aria-label="NATA score out of 200"
              sx={{ color: t.navy900, flex: 1 }}
            />
            <TextField
              type="number"
              value={Number.isFinite(nataRaw) ? nataRaw : 0}
              onChange={(e) => setNataRaw(parseFloat(e.target.value))}
              size="small"
              sx={numberFieldSx}
              inputProps={{ min: 0, max: 200, step: 1, inputMode: 'numeric', 'aria-label': 'NATA score' }}
            />
          </Stack>
        </Box>

        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
            <Typography variant="body2" fontWeight={700}>
              10+2 percentage
            </Typography>
            <Chip
              label={`${qualifyingPercent}% → ${result.qualifyingScaled} / 200`}
              size="small"
              sx={valueChipSx}
            />
          </Stack>
          <Stack direction="row" gap={2} alignItems="center">
            <Slider
              value={qualifyingPercent}
              onChange={(_, v) => setQualifyingPercent(Array.isArray(v) ? v[0] : v)}
              min={0}
              max={100}
              step={1}
              aria-label="10+2 percentage"
              sx={{ color: t.navy900, flex: 1 }}
            />
            <TextField
              type="number"
              value={Number.isFinite(qualifyingPercent) ? qualifyingPercent : 0}
              onChange={(e) => setQualifyingPercent(parseFloat(e.target.value))}
              size="small"
              sx={numberFieldSx}
              inputProps={{ min: 0, max: 100, step: 1, inputMode: 'decimal', 'aria-label': '10+2 percentage' }}
            />
          </Stack>
        </Box>
      </Stack>

      <Box
        sx={{
          mt: 2.5,
          p: 2,
          borderRadius: RADIUS,
          bgcolor: t.ground,
          border: `1px solid ${t.lineStrong}`,
          borderLeft: 'none',
          boxShadow: `inset 3px 0 0 ${t.gold500}`,
        }}
        aria-live="polite"
      >
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Your KEAM B.Arch rank index
        </Typography>
        <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
          <Typography variant="h4" fontWeight={800} sx={{ color: t.navy900, fontFamily: t.fontMono }}>
            {result.total}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            / 400
          </Typography>
          <Chip
            label={band.label}
            size="small"
            sx={{ bgcolor: band.color, color: t.surface, fontWeight: 700, ml: 'auto' }}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {result.nata} (NATA) + {result.qualifyingScaled} (12th scaled) = {result.total}
        </Typography>
      </Box>

      <Box sx={{ mt: 2 }}>
        <Callout>
          <Typography variant="body2" sx={{ m: 0 }}>
            This is an indicative score, not your actual rank. CEE publishes the official B.Arch rank list separately at cee.kerala.gov.in. (Clause 9.7.4(c))
          </Typography>
        </Callout>
      </Box>
    </Paper>
  );
}
