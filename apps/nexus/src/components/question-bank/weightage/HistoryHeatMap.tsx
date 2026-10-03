'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import {
  formatPerPaper,
  gapLabel,
  heatCuts,
  heatLegend,
  heatStep,
  type ChapterStat,
  type SectionWeightage,
} from '@/lib/qb-weightage';
import { hatch, heatColors } from './weightage-colors';

interface Props {
  section: SectionWeightage;
  onOpen: (c: ChapterStat) => void;
}

const ROWS_FIRST = 12;
const PHONE_COLUMNS = 9;

/**
 * Chapters down, exam years across: the whole history at a glance.
 *
 * Every cell carries its number, so colour is never the only cue. A gap column
 * stands for years with no paper in the bank (hatched), which must never read as
 * "not asked". Partly-imported years are hatched too.
 *
 * A phone shows the latest 9 columns and scrolls the rest inside the card; the
 * chapter column stays put. The page itself never scrolls sideways.
 */
export default function HistoryHeatMap({ section, onOpen }: Props) {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const [allYears, setAllYears] = useState<boolean | null>(null);
  const [allRows, setAllRows] = useState(false);
  const showAllYears = allYears ?? isMdUp;

  const cols = showAllYears ? section.columns : section.columns.slice(-PHONE_COLUMNS);
  const rows = allRows ? section.chapters : section.chapters.slice(0, ROWS_FIRST);
  const cuts = heatCuts(section.paperSize);
  const legend = heatLegend(section.paperSize);
  const { bg, fg } = heatColors(theme);
  const canToggleYears = section.columns.length > PHONE_COLUMNS;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Box>
        <Typography variant="subtitle1" component="h2" fontWeight={700}>
          Year by year
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Questions from each chapter in each year&apos;s paper. Tap a chapter for details.
        </Typography>
      </Box>

      {canToggleYears && (
        <ToggleButtonGroup
          value={showAllYears ? 'all' : 'recent'}
          exclusive
          size="small"
          onChange={(_e, v: string | null) => v && setAllYears(v === 'all')}
          aria-label="Years shown"
          sx={{ '& .MuiToggleButton-root': { minHeight: 44, px: 2, textTransform: 'none', fontWeight: 600 } }}
        >
          <ToggleButton value="recent">Recent</ToggleButton>
          <ToggleButton value="all">Full history</ToggleButton>
        </ToggleButtonGroup>
      )}

      <Box sx={{ overflowX: 'auto', overscrollBehaviorX: 'contain', mx: -0.5, px: 0.5 }}>
        <Box
          component="table"
          sx={{
            borderCollapse: 'separate',
            borderSpacing: '2px',
            fontVariantNumeric: 'tabular-nums',
            '& th, & td': { p: 0 },
          }}
        >
          <Box component="thead">
            <Box component="tr">
              <Box
                component="th"
                scope="col"
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  bgcolor: 'background.paper',
                  textAlign: 'left',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'text.secondary',
                  minWidth: { xs: 112, sm: 180 },
                }}
              >
                Chapter
              </Box>
              {cols.map((c) => (
                <Box
                  key={c.kind === 'gap' ? `g${c.from}` : c.year}
                  component="th"
                  scope="col"
                  title={c.kind === 'gap' ? `${c.from} to ${c.to}: not in the bank yet` : undefined}
                  sx={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'text.secondary',
                    minWidth: c.kind === 'gap' ? 34 : 28,
                    height: 24,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.kind === 'gap' ? gapLabel(c) : `'${String(c.year).slice(2)}${c.partial ? '*' : ''}`}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {rows.map((ch) => (
              <Box component="tr" key={ch.slug}>
                <Box
                  component="th"
                  scope="row"
                  sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', textAlign: 'left' }}
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={() => onOpen(ch)}
                    sx={{
                      all: 'unset',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: 44,
                      width: '100%',
                      pr: 1,
                      fontSize: 12.5,
                      fontWeight: 600,
                      lineHeight: 1.25,
                      color: 'text.primary',
                      borderRadius: 1,
                      '&:hover': { color: 'primary.main' },
                      '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
                    }}
                  >
                    {ch.label}
                  </Box>
                </Box>
                {cols.map((c) => {
                  if (c.kind === 'gap') {
                    return (
                      <Box key={`g${c.from}`} component="td" sx={{ background: hatch(theme), borderRadius: 1 }} title={`${c.from} to ${c.to}: not in the bank yet`} />
                    );
                  }
                  const count = ch.counts[c.year] ?? 0;
                  if (c.partial) {
                    const t = `${ch.label}, ${c.year}: only part of this paper is in the bank (${count} here)`;
                    return <Box key={c.year} component="td" title={t} aria-label={t} sx={{ background: hatch(theme), borderRadius: 1 }} />;
                  }
                  const v = count / c.papers;
                  const step = heatStep(v, cuts);
                  const t = `${ch.label}, ${c.year}: ${count} ${count === 1 ? 'question' : 'questions'}${c.papers > 1 ? ` across ${c.papers} papers (${formatPerPaper(v)} a paper)` : ''}`;
                  return (
                    <Box
                      key={c.year}
                      component="td"
                      title={t}
                      aria-label={t}
                      sx={{
                        bgcolor: step ? bg[step] : alpha(theme.palette.text.primary, 0.04),
                        color: step ? fg[step] : 'text.secondary',
                        borderRadius: 1,
                        textAlign: 'center',
                        fontSize: 11.5,
                        fontWeight: 700,
                        minWidth: 28,
                      }}
                    >
                      {count ? formatPerPaper(v) : ''}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, fontSize: 12, color: 'text.secondary' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Questions a paper:
        </Typography>
        {legend.map((l, i) => (
          <Box key={l} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 18,
                height: 14,
                borderRadius: 0.5,
                bgcolor: i ? bg[i] : alpha(theme.palette.text.primary, 0.04),
                border: i ? 0 : 1,
                borderColor: 'divider',
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {l}
            </Typography>
          </Box>
        ))}
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 18, height: 14, borderRadius: 0.5, background: hatch(theme) }} />
          <Typography variant="caption" color="text.secondary">
            Not in the bank
          </Typography>
        </Box>
      </Box>
      {section.columns.some((c) => c.kind === 'year' && c.partial) && (
        <Typography variant="caption" color="text.secondary">
          * Only part of that year&apos;s paper is in the bank, so it is left out of the averages.
        </Typography>
      )}

      {section.chapters.length > ROWS_FIRST && (
        <Button
          onClick={() => setAllRows((v) => !v)}
          sx={{ justifySelf: 'start', minHeight: 44, textTransform: 'none', fontWeight: 700 }}
        >
          {allRows ? `Show top ${ROWS_FIRST}` : `Show all ${section.chapters.length} chapters`}
        </Button>
      )}
    </Paper>
  );
}
