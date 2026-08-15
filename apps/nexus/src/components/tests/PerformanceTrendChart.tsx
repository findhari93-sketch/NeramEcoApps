'use client';

/**
 * Average score by month, as a single-series line: the "trend over time"
 * form (dataviz skill, choosing-a-form.md). One series needs no legend box,
 * the subtitle already says what is plotted.
 *
 * A month with zero attempts is a GAP, not a zero score, so the continuous
 * month range is built explicitly (filling silent months with a null value)
 * and the line breaks rather than dipping to the floor across one. The
 * accessible "table view" this feature needs is PerformanceMonthlyList,
 * rendered alongside this chart, not a duplicate hidden table in here.
 *
 * Colors: the series line/marker uses the dataviz skill's validated
 * sequential-blue hex (light `#2a78d6` / dark `#3987e5`, CVD- and
 * contrast-checked). Chrome (gridlines, axis text) uses this app's own MUI
 * theme tokens, since only the data-carrying hue needs the skill's palette.
 */

import { useMemo, useState } from 'react';
import { Box, Typography, alpha, useTheme } from '@neram/ui';

export interface PerformanceTrendMonth {
  month: string;
  label: string;
  attempts: number;
  average_pct: number | null;
}

const VIEW_W = 600;
const VIEW_H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 30 };
/** Widest window worth plotting on one small screen before it turns to noise. */
const MAX_MONTHS = 12;

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Fill every calendar month between the first and last with a gap entry. */
export function buildContinuousMonths(monthly: PerformanceTrendMonth[]): PerformanceTrendMonth[] {
  if (monthly.length === 0) return [];
  const sorted = [...monthly].sort((a, b) => a.month.localeCompare(b.month));
  const byMonth = new Map(sorted.map((m) => [m.month, m]));
  const out: PerformanceTrendMonth[] = [];
  let cursor = sorted[0].month;
  const last = sorted[sorted.length - 1].month;
  while (cursor <= last) {
    out.push(byMonth.get(cursor) ?? { month: cursor, label: cursor, attempts: 0, average_pct: null });
    cursor = nextMonth(cursor);
  }
  return out.slice(-MAX_MONTHS);
}

export default function PerformanceTrendChart({ monthly }: { monthly: PerformanceTrendMonth[] }) {
  const theme = useTheme();
  const seriesColor = theme.palette.mode === 'dark' ? '#3987e5' : '#2a78d6';
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const points = useMemo(() => buildContinuousMonths(monthly), [monthly]);

  if (points.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        Attempt a few tests and your score trend appears here.
      </Typography>
    );
  }

  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;
  const xFor = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
  const yFor = (pct: number) => PAD.top + plotH * (1 - pct / 100);

  // Break the line and area into separate runs at every gap month, rather
  // than one path that would silently connect across a month with no data.
  const segments: Array<Array<{ i: number; pct: number }>> = [];
  let current: Array<{ i: number; pct: number }> = [];
  points.forEach((p, i) => {
    if (p.average_pct == null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ i, pct: p.average_pct });
  });
  if (current.length) segments.push(current);

  const linePath = (seg: Array<{ i: number; pct: number }>) =>
    seg.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xFor(p.i)} ${yFor(p.pct)}`).join(' ');
  const areaPath = (seg: Array<{ i: number; pct: number }>) => {
    const top = seg.map((p) => `${xFor(p.i)} ${yFor(p.pct)}`).join(' L ');
    const baseline = yFor(0);
    return `M ${xFor(seg[0].i)} ${baseline} L ${top} L ${xFor(seg[seg.length - 1].i)} ${baseline} Z`;
  };

  // Thin x-axis labels so 12 short-month labels don't collide at 375px.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const active = activeIndex != null ? points[activeIndex] : null;

  return (
    <Box sx={{ position: 'relative' }}>
      <Box sx={{ width: '100%', aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width="100%"
          height="100%"
          role="img"
          aria-label={`Average score by month, ${points.length} months shown`}
          onMouseLeave={() => setActiveIndex(null)}
        >
          {/* Gridlines: recessive hairlines at 0 / 50 / 100. */}
          {[0, 50, 100].map((pct) => (
            <line
              key={pct}
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={yFor(pct)}
              y2={yFor(pct)}
              stroke={theme.palette.divider}
              strokeWidth={1}
            />
          ))}
          {[0, 50, 100].map((pct) => (
            <text
              key={pct}
              x={PAD.left - 8}
              y={yFor(pct)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill={theme.palette.text.disabled}
            >
              {pct}
            </text>
          ))}

          {segments.map((seg, si) => (
            <g key={si}>
              <path d={areaPath(seg)} fill={alpha(seriesColor, 0.1)} stroke="none" />
              <path d={linePath(seg)} fill="none" stroke={seriesColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}

          {/* Crosshair for the focused/hovered month. */}
          {active && active.average_pct != null && activeIndex != null && (
            <line
              x1={xFor(activeIndex)}
              x2={xFor(activeIndex)}
              y1={PAD.top}
              y2={VIEW_H - PAD.bottom}
              stroke={theme.palette.divider}
              strokeWidth={1}
            />
          )}

          {points.map((p, i) => {
            if (p.average_pct == null) return null;
            const cx = xFor(i);
            const cy = yFor(p.average_pct);
            return (
              <g key={p.month}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={seriesColor}
                  stroke={theme.palette.background.paper}
                  strokeWidth={2}
                />
                {/* Hit target well past the painted dot: 28px, per the skill's
                    24px-minimum rule for scatter/point marks. */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={14}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.label}: ${Math.round(p.average_pct)} percent average, ${p.attempts} test${p.attempts === 1 ? '' : 's'}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onFocus={() => setActiveIndex(i)}
                  onBlur={() => setActiveIndex(null)}
                  style={{ cursor: 'pointer', outline: 'none' }}
                />
              </g>
            );
          })}

          {points.map((p, i) =>
            i % labelStep === 0 ? (
              <text
                key={p.month}
                x={xFor(i)}
                y={VIEW_H - PAD.bottom + 16}
                textAnchor="middle"
                fontSize={10}
                fill={theme.palette.text.disabled}
              >
                {p.label.replace(' 20', " '")}
              </text>
            ) : null,
          )}
        </svg>
      </Box>

      {active && (
        <Box
          sx={{
            position: 'absolute',
            left: `${(xFor(activeIndex!) / VIEW_W) * 100}%`,
            top: `${(yFor(active.average_pct ?? 0) / VIEW_H) * 100}%`,
            transform: 'translate(-50%, -130%)',
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1.5,
            px: 1.25,
            py: 0.75,
            boxShadow: 2,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 1,
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
            {active.average_pct == null ? 'No attempts' : `${Math.round(active.average_pct)}%`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {active.label} · {active.attempts} test{active.attempts === 1 ? '' : 's'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
