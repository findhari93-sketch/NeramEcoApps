'use client';

/**
 * Weekday by part-of-day grid of spend and sign-ups. Every cell prints its
 * numbers; the shading only repeats them (darker means more spent per
 * sign-up), and a cell that spent with no sign-up says so in words. It is a
 * real <table>, so screen readers get row and column headers.
 */
import { alpha, Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography, useTheme } from '@neram/ui';
import { inr, num } from './format';

const DAYS: Array<[string, string]> = [
  ['MONDAY', 'Mon'],
  ['TUESDAY', 'Tue'],
  ['WEDNESDAY', 'Wed'],
  ['THURSDAY', 'Thu'],
  ['FRIDAY', 'Fri'],
  ['SATURDAY', 'Sat'],
  ['SUNDAY', 'Sun'],
];
const PARTS: Array<{ label: string; from: number; to: number }> = [
  { label: 'Night (12am to 6am)', from: 0, to: 5 },
  { label: 'Morning (6am to 12pm)', from: 6, to: 11 },
  { label: 'Afternoon (12pm to 6pm)', from: 12, to: 17 },
  { label: 'Evening (6pm to 12am)', from: 18, to: 23 },
];

interface HourItem {
  attributes: { day_of_week?: string; hour?: number } | null;
  cost: number;
  conversions: number;
  clicks: number;
}

export function bucketHours(items: HourItem[]) {
  const grid = DAYS.map(() => PARTS.map(() => ({ cost: 0, conversions: 0, clicks: 0 })));
  for (const it of items) {
    const d = DAYS.findIndex(([k]) => k === it.attributes?.day_of_week);
    const h = Number(it.attributes?.hour);
    const p = PARTS.findIndex((x) => h >= x.from && h <= x.to);
    if (d < 0 || p < 0) continue;
    grid[d][p].cost += it.cost;
    grid[d][p].conversions += it.conversions;
    grid[d][p].clicks += it.clicks;
  }
  return grid;
}

export default function HoursGrid({ items }: { items: HourItem[] }) {
  const theme = useTheme();
  const grid = bucketHours(items);
  const cells = grid.flat();
  const total = cells.reduce((s, c) => ({ cost: s.cost + c.cost, conversions: s.conversions + c.conversions }), { cost: 0, conversions: 0 });
  const avgCpa = total.conversions ? total.cost / total.conversions : null;
  // Shade by cost per sign-up against the average: 1x is light, 3x or no sign-ups is darkest.
  const shade = (c: { cost: number; conversions: number }) => {
    if (c.cost <= 0 || avgCpa === null) return 0;
    const ratio = c.conversions ? c.cost / c.conversions / avgCpa : 3;
    return Math.max(0, Math.min(1, (ratio - 0.8) / 2.2));
  };

  return (
    <Box>
      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label="Spend and sign-ups by day and time of day">
          <TableHead>
            <TableRow>
              <TableCell>Day</TableCell>
              {PARTS.map((p) => (
                <TableCell key={p.label} align="center">
                  {p.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {DAYS.map(([key, short], d) => (
              <TableRow key={key}>
                <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                  {short}
                </TableCell>
                {grid[d].map((c, p) => {
                  const wasted = c.cost > 0 && c.conversions === 0;
                  return (
                    <TableCell
                      key={p}
                      align="center"
                      sx={{
                        bgcolor: alpha(theme.palette.error.main, 0.08 + shade(c) * 0.35),
                        outline: wasted ? `2px solid ${theme.palette.error.main}` : 'none',
                        outlineOffset: -2,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {inr(c.cost)}
                      </Typography>
                      <Typography variant="caption" color={wasted ? 'error.main' : 'text.secondary'}>
                        {wasted ? 'no sign-ups' : `${num(c.conversions, 1)} sign-ups`}
                      </Typography>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        India time. Darker cells cost more per sign-up than the average of {avgCpa === null ? 'n/a' : inr(avgCpa)}; outlined cells spent with no sign-ups. At a small budget one or two sign-ups can move a cell, so read whole rows and columns, not single cells.
      </Typography>
    </Box>
  );
}
