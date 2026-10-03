'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import {
  formatPerPaper,
  trendGroups,
  trendRatio,
  type ChapterStat,
  type SectionWeightage,
} from '@/lib/qb-weightage';

interface Props {
  section: SectionWeightage;
  colorFor: (unit: string | null) => string;
  onOpen: (c: ChapterStat) => void;
}

type View = 'chart' | 'list';

/**
 * What is coming up more, and what is fading.
 *
 * From md up students choose between the bubble chart and the list. A phone gets
 * the list only: at 375px the chart's labels collide and a scatter needs more
 * explaining than a list of four plain groups.
 */
export default function TrendsCard({ section, colorFor, onOpen }: Props) {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const [view, setView] = useState<View>('chart');
  const showChart = isMdUp && view === 'chart';

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="h2" fontWeight={700}>
            Trends
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {section.hasTrends
              ? `Last ${section.recentYears.length} years compared with the years before`
              : 'Needs more years of papers'}
          </Typography>
        </Box>
        {isMdUp && section.hasTrends && (
          <ToggleButtonGroup
            value={view}
            exclusive
            size="small"
            onChange={(_e, v: View | null) => v && setView(v)}
            aria-label="Trend view"
            sx={{ '& .MuiToggleButton-root': { minHeight: 40, px: 2, textTransform: 'none', fontWeight: 600 } }}
          >
            <ToggleButton value="chart">Chart</ToggleButton>
            <ToggleButton value="list">List</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>

      {!section.hasTrends ? (
        <Typography variant="body2" color="text.secondary">
          Trends compare the latest {section.recentYears.length} years with earlier ones. This section has{' '}
          {section.countedYears.length} years in the bank so far, so there is nothing earlier to compare with yet.
        </Typography>
      ) : showChart ? (
        <TrendChart section={section} colorFor={colorFor} onOpen={onOpen} />
      ) : (
        <TrendList section={section} onOpen={onOpen} />
      )}

      {section.units.length > 0 && showChart && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
          {section.units.map((u) => (
            <Box key={u.slug} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: colorFor(u.slug) }} />
              <Typography variant="caption" color="text.secondary">
                {u.label}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}

export function TrendChip({ c }: { c: ChapterStat }) {
  const theme = useTheme();
  if (c.trend === 'steady') return null;
  const up = c.trend === 'rising' || c.trend === 'new';
  const label =
    c.trend === 'rising' ? 'Rising' : c.trend === 'new' ? 'New' : c.trend === 'falling' ? 'Less lately' : `Not since ${c.lastYear}`;
  const tone = up ? theme.palette.success.main : theme.palette.warning.main;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        px: 0.75,
        py: 0.125,
        borderRadius: 99,
        fontSize: 11.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        bgcolor: alpha(tone, 0.12),
        color: up ? theme.palette.success.dark : theme.palette.mode === 'dark' ? theme.palette.warning.light : '#7a4a00',
      }}
    >
      {up ? <TrendingUpRoundedIcon sx={{ fontSize: 14 }} /> : <TrendingDownRoundedIcon sx={{ fontSize: 14 }} />}
      {label}
    </Box>
  );
}

function TrendList({ section, onOpen }: { section: SectionWeightage; onOpen: (c: ChapterStat) => void }) {
  const theme = useTheme();
  const groups = useMemo(() => trendGroups(section), [section]);
  // Five a group, so a phone gets the picture in one screen or two rather than
  // a 38-row list. The rest are a tap away.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {groups.map((g) => (
        <Box key={g.key} component="section" aria-label={g.label}>
          <Typography variant="body2" fontWeight={700}>
            {g.label}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {g.hint}
          </Typography>
          {(open[g.key] ? g.chapters : g.chapters.slice(0, LIST_FIRST)).map((c) => (
            <Box
              key={c.slug}
              component="button"
              type="button"
              onClick={() => onOpen(c)}
              sx={{
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minHeight: 48,
                px: 0.5,
                borderBottom: 1,
                borderColor: 'divider',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
              }}
            >
              <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }}>
                {c.label}
              </Typography>
              <TrendChip c={c} />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right' }}
              >
                {formatPerPaper(c.perPaper)} a paper
              </Typography>
              <ChevronRightRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            </Box>
          ))}
          {g.chapters.length > LIST_FIRST && (
            <Button
              size="small"
              onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
              aria-expanded={!!open[g.key]}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700, mt: 0.5 }}
            >
              {open[g.key] ? 'Show fewer' : `Show ${g.chapters.length - LIST_FIRST} more`}
            </Button>
          )}
        </Box>
      ))}
    </Box>
  );
}

const LIST_FIRST = 5;

const W = 640;
const H = 500;
const PAD = { l: 44, r: 16, t: 16, b: 46 };
// Bubbles at 0%, 100% or the 4x and quarter lines sit this far inside the frame,
// so none is cut in half by the edge.
const INSET = 18;

function TrendChart({
  section,
  colorFor,
  onOpen,
}: {
  section: SectionWeightage;
  colorFor: (unit: string | null) => string;
  onOpen: (c: ChapterStat) => void;
}) {
  const theme = useTheme();
  const pw = W - PAD.l - PAD.r;
  const ph = H - PAD.t - PAD.b;
  const X = (v: number) => PAD.l + INSET + v * (pw - 2 * INSET);
  const Y = (v: number) => PAD.t + INSET + ((2 - v) / 4) * (ph - 2 * INSET);
  const maxPer = Math.max(0.01, ...section.chapters.map((c) => c.perPaper));
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const line = theme.palette.divider;

  // Biggest first so small bubbles are drawn on top and stay clickable.
  const points = [...section.chapters]
    .sort((a, b) => b.perPaper - a.perPaper)
    .map((c) => ({
      c,
      x: X(c.askedAll / Math.max(1, c.ofAll)),
      y: Y(trendRatio(c)),
      r: 4 + 12 * Math.sqrt(c.perPaper / maxPer),
    }));

  // Label the biggest chapters, skipping any label that would overlap one
  // already placed. A rough 6.4px per character is enough at 11px.
  // The four corner captions are placed first, so no chapter label lands on one.
  const cornerBox = (x: number, y: number, t: string, anchor: 'start' | 'end') => {
    const w = t.length * 6.8;
    const x1 = anchor === 'start' ? x : x - w;
    return { x1, x2: x1 + w, y1: y - 11, y2: y + 3 };
  };
  const placed: { x1: number; x2: number; y1: number; y2: number }[] = [
    cornerBox(PAD.l + pw - 8, PAD.t + 16, 'Regular and rising', 'end'),
    cornerBox(PAD.l + 8, PAD.t + 16, 'Rare but rising', 'start'),
    cornerBox(PAD.l + pw - 8, PAD.t + ph - 8, 'Regular, cooling', 'end'),
    cornerBox(PAD.l + 8, PAD.t + ph - 8, 'Rare and cooling', 'start'),
  ];
  const labels = points.slice(0, 14).flatMap((p) => {
    const w = p.c.label.length * 6.4;
    const right = p.x + p.r + 4 + w < W - PAD.r;
    const x1 = right ? p.x + p.r + 4 : p.x - p.r - 4 - w;
    const box = { x1, x2: x1 + w, y1: p.y - 7, y2: p.y + 7 };
    if (placed.some((b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2))) return [];
    placed.push(box);
    return [{ p, x: right ? x1 : x1 + w, anchor: right ? 'start' : 'end' }];
  });

  const corner = (x: number, y: number, t: string, anchor: 'start' | 'end') => (
    <text x={x} y={y} fontSize={11} fontWeight={700} fill={muted} textAnchor={anchor}>
      {t}
    </text>
  );

  return (
    <Box
      sx={{
        width: '100%',
        '& circle:focus-visible': { stroke: theme.palette.primary.main, strokeWidth: 4 },
        '& circle:hover': { fillOpacity: 1 },
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Chapters by how often they are asked and how that has changed recently">
        <rect x={PAD.l} y={PAD.t} width={pw} height={ph} fill={alpha(ink, 0.02)} stroke={line} />
        <line x1={X(0.5)} y1={PAD.t} x2={X(0.5)} y2={PAD.t + ph} stroke={line} strokeDasharray="4 4" />
        <line x1={PAD.l} y1={Y(0)} x2={PAD.l + pw} y2={Y(0)} stroke={line} strokeDasharray="4 4" />
        {corner(PAD.l + pw - 8, PAD.t + 16, 'Regular and rising', 'end')}
        {corner(PAD.l + 8, PAD.t + 16, 'Rare but rising', 'start')}
        {corner(PAD.l + pw - 8, PAD.t + ph - 8, 'Regular, cooling', 'end')}
        {corner(PAD.l + 8, PAD.t + ph - 8, 'Rare and cooling', 'start')}

        {points.map((p) => {
          const tip = `${p.c.label}: asked in ${p.c.askedAll} of ${p.c.ofAll} years, ${formatPerPaper(p.c.perPaper)} a paper`;
          return (
            <Tooltip key={p.c.slug} title={tip} arrow>
              <circle
                cx={p.x}
                cy={p.y}
                r={p.r}
                fill={colorFor(p.c.unit)}
                fillOpacity={0.85}
                stroke={theme.palette.background.paper}
                strokeWidth={2}
                tabIndex={0}
                role="button"
                aria-label={tip}
                style={{ cursor: 'pointer', outline: 'none' }}
                onClick={() => onOpen(p.c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(p.c);
                  }
                }}
              />
            </Tooltip>
          );
        })}
        {labels.map(({ p, x, anchor }) => (
          <text key={`l${p.c.slug}`} x={x} y={p.y + 4} fontSize={11} fill={ink} textAnchor={anchor as 'start' | 'end'} pointerEvents="none">
            {p.c.label}
          </text>
        ))}

        <text x={PAD.l} y={H - 26} fontSize={11} fill={muted}>0%</text>
        <text x={X(0.5)} y={H - 26} fontSize={11} fill={muted} textAnchor="middle">50%</text>
        <text x={PAD.l + pw} y={H - 26} fontSize={11} fill={muted} textAnchor="end">100%</text>
        <text x={PAD.l + pw / 2} y={H - 6} fontSize={12} fill={ink} textAnchor="middle">
          Asked in this share of years
        </text>
        <text x={PAD.l - 6} y={Y(2) + 4} fontSize={11} fill={muted} textAnchor="end">4×</text>
        <text x={PAD.l - 6} y={Y(1) + 4} fontSize={11} fill={muted} textAnchor="end">2×</text>
        <text x={PAD.l - 6} y={Y(0) + 4} fontSize={11} fill={muted} textAnchor="end">same</text>
        <text x={PAD.l - 6} y={Y(-1) + 4} fontSize={11} fill={muted} textAnchor="end">½</text>
        <text x={PAD.l - 6} y={Y(-2) + 4} fontSize={11} fill={muted} textAnchor="end">¼</text>
      </svg>
      <Typography variant="caption" color="text.secondary">
        Up means more questions lately than before. Bigger bubbles get more questions a paper. Click a bubble for
        details.
      </Typography>
    </Box>
  );
}
