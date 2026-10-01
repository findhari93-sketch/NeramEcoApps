'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  LinearProgress,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import {
  TIERS,
  chapterReason,
  topChapters,
  type ChapterStat,
  type SectionWeightage,
  type WeightageWindow,
} from '@/lib/qb-weightage';

interface Props {
  section: SectionWeightage;
  storageKey: string;
  onWindowChange: (w: WeightageWindow) => void;
  onOpen: (c: ChapterStat) => void;
}

/**
 * "Start with these 10": the direct answer to "what should I study first".
 *
 * The list comes from a visible formula (see lib/qb-weightage.ts) and the copy
 * says "start with", never "only study": in maths nearly every chapter turns up,
 * so a list that read as a guarantee would mislead.
 *
 * Ticks are a per-device convenience kept in localStorage. Losing them costs a
 * student nothing.
 */
export default function TopTenCard({ section, storageKey, onWindowChange, onOpen }: Props) {
  const theme = useTheme();
  const top = useMemo(() => topChapters(section, 10), [section]);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setDone(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setDone(new Set());
    }
  }, [storageKey]);

  const toggle = (slug: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* private window: ticks just do not persist */
      }
      return next;
    });
  };

  const doneCount = top.filter((c) => done.has(c.slug)).length;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle1" component="h2" fontWeight={700}>
          Start with these {top.length}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {doneCount} of {top.length} done
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={top.length ? (doneCount / top.length) * 100 : 0}
        aria-label={`${doneCount} of ${top.length} chapters done`}
        sx={{ height: 6, borderRadius: 3 }}
      />

      {section.hasTrends && (
        <ToggleButtonGroup
          value={section.window}
          exclusive
          fullWidth
          size="small"
          onChange={(_e, v: WeightageWindow | null) => v && onWindowChange(v)}
          aria-label="Years used for the list"
          sx={{ '& .MuiToggleButton-root': { minHeight: 44, textTransform: 'none', fontWeight: 600 } }}
        >
          <ToggleButton value="all">All years</ToggleButton>
          <ToggleButton value="recent">Recent {section.recentYears.length} years</ToggleButton>
        </ToggleButtonGroup>
      )}

      <Box>
        {TIERS.map((tier) => {
          const part = top.slice(tier.from, tier.to);
          if (!part.length) return null;
          return (
            <Box key={tier.label} component="section" aria-label={tier.label}>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.8, lineHeight: 2.4 }}
              >
                {tier.label}
              </Typography>
              {part.map((c, j) => {
                const rank = tier.from + j + 1;
                const isDone = done.has(c.slug);
                return (
                  <Box
                    key={c.slug}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '44px 20px minmax(0, 1fr) 40px',
                      alignItems: 'center',
                      gap: 0.5,
                      borderBottom: 1,
                      borderColor: 'divider',
                      minHeight: 56,
                    }}
                  >
                    <Checkbox
                      checked={isDone}
                      onChange={() => toggle(c.slug)}
                      inputProps={{ 'aria-label': `Mark ${c.label} as studied` }}
                      sx={{ width: 44, height: 44 }}
                    />
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {rank}
                    </Typography>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => onOpen(c)}
                      sx={{
                        all: 'unset',
                        cursor: 'pointer',
                        minWidth: 0,
                        minHeight: 48,
                        py: 1,
                        pl: 0.5,
                        borderRadius: 1,
                        gridColumn: 'span 2',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                        '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          sx={{
                            textDecoration: isDone ? 'line-through' : 'none',
                            color: isDone ? 'text.secondary' : 'text.primary',
                          }}
                        >
                          {c.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                          {chapterReason(c, section.window)}
                        </Typography>
                      </Box>
                      <ChevronRightRoundedIcon fontSize="small" sx={{ color: 'text.secondary', flex: 'none' }} />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
        Picked by how many questions each chapter gets and how regularly it is asked. Any chapter can appear, so
        start here, then cover the rest.
      </Typography>
    </Paper>
  );
}
