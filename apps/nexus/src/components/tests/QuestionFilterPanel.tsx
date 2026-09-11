'use client';

/**
 * Every question filter in one place: correct rate, answers, AI check, sort.
 *
 * A bottom sheet on a phone and an inline panel above 900px, around ONE body,
 * so the two can never offer different filters.
 *
 * The correct rate is a histogram over a two-thumb slider, the pattern a price
 * filter uses. The bars show how the questions are spread before a range is
 * picked, so a teacher sees "8 at 0%, nothing between 1 and 10%" at a glance
 * instead of trying ranges one at a time. A bar is also a shortcut: tap it to
 * pick that band. The slider and the preset chips are the full-size controls.
 */

import { useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import {
  AI_FILTERS,
  AI_FILTER_LABELS,
  DEFAULT_QUESTION_FILTERS,
  MIN_ANSWER_CHOICES,
  PCT_BANDS,
  QUESTION_SORTS,
  SORT_LABELS,
  UNDER_20_RANGE,
  ZERO_RANGE,
  bandCounts,
  isFullRange,
  sameRange,
  type FilterableQuestion,
  type QuestionFilters,
} from '@/lib/question-filters';

interface Props {
  open: boolean;
  onClose: () => void;
  filters: QuestionFilters;
  onChange: (next: QuestionFilters) => void;
  questions: FilterableQuestion[];
  /** How many questions the current filters and search leave. */
  matchCount: number;
  /** False while nobody in this run has answered, when there is no rate to filter on. */
  hasRates: boolean;
}

const RANGE_PRESETS: Array<{ label: string; range: [number, number] }> = [
  { label: '0% right', range: ZERO_RANGE },
  { label: 'Under 20%', range: UNDER_20_RANGE },
  { label: 'Under 50%', range: [0, 49] },
  { label: 'Any rate', range: [0, 100] },
];

const SLIDER_MARKS = [0, 20, 40, 60, 80, 100].map((v) => ({ value: v, label: `${v}%` }));

const toggleSx = { textTransform: 'none', minHeight: 44, px: 1.5 } as const;

function rangeText(pct: [number, number]): string {
  if (isFullRange(pct)) return 'Any';
  if (pct[0] === pct[1]) return `${pct[0]}%`;
  return `${pct[0]}% to ${pct[1]}%`;
}

function SectionTitle({ id, children, aside }: { id: string; children: string; aside?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1 }}>
      <Typography id={id} variant="subtitle2" sx={{ fontWeight: 700 }}>
        {children}
      </Typography>
      {aside}
    </Box>
  );
}

function FilterBody({
  filters,
  onChange,
  questions,
  hasRates,
  wide,
}: Pick<Props, 'filters' | 'onChange' | 'questions' | 'hasRates'> & { wide: boolean }) {
  const counts = useMemo(() => bandCounts(questions, filters), [questions, filters]);
  const tallest = Math.max(1, ...counts);
  const full = isFullRange(filters.pct);
  const set = (patch: Partial<QuestionFilters>) => onChange({ ...filters, ...patch });

  const rate = hasRates ? (
    <Box component="section" aria-labelledby="qf-rate">
      <SectionTitle
        id="qf-rate"
        aside={
          <Typography variant="body2" sx={{ fontWeight: 700, color: full ? 'text.secondary' : 'primary.main' }}>
            {rangeText(filters.pct)}
          </Typography>
        }
      >
        Correct rate
      </SectionTitle>

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: 56, px: 1.5 }}>
        {PCT_BANDS.map((band, i) => {
          const inRange = !full && band.range[1] >= filters.pct[0] && band.range[0] <= filters.pct[1];
          const height = counts[i] === 0 ? 2 : Math.max(6, Math.round((counts[i] / tallest) * 52));
          return (
            <Box
              component="button"
              type="button"
              key={band.label}
              onClick={() => set({ pct: sameRange(filters.pct, band.range) ? [0, 100] : band.range })}
              aria-label={`${band.label}: ${counts[i]} question${counts[i] === 1 ? '' : 's'}`}
              aria-pressed={sameRange(filters.pct, band.range)}
              sx={{
                appearance: 'none',
                border: 0,
                bgcolor: 'transparent',
                p: 0,
                cursor: 'pointer',
                flex: 1,
                height: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                borderRadius: 0.5,
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
              }}
            >
              <Box
                component="span"
                sx={{
                  display: 'block',
                  width: '100%',
                  height,
                  borderRadius: '3px 3px 0 0',
                  bgcolor: full ? 'primary.light' : inRange ? 'primary.main' : 'action.disabledBackground',
                  transition: 'height 200ms ease, background-color 150ms ease',
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
              />
            </Box>
          );
        })}
      </Box>

      <Box sx={{ px: 1.5 }}>
        <Slider
          value={filters.pct}
          onChange={(_, v) => {
            if (Array.isArray(v)) set({ pct: [v[0], v[1]] });
          }}
          min={0}
          max={100}
          step={1}
          disableSwap
          marks={SLIDER_MARKS}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
          getAriaLabel={(i) => (i === 0 ? 'Lowest correct rate' : 'Highest correct rate')}
          getAriaValueText={(v) => `${v}%`}
          sx={{
            '& .MuiSlider-thumb': { width: 24, height: 24 },
            '& .MuiSlider-markLabel': { fontSize: 12 },
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
        {RANGE_PRESETS.map((p) => {
          const on = sameRange(filters.pct, p.range);
          return (
            <Chip
              key={p.label}
              label={p.label}
              clickable
              onClick={() => set({ pct: p.range })}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              aria-pressed={on}
              sx={{ height: 36, fontWeight: 600 }}
            />
          );
        })}
      </Box>
    </Box>
  ) : (
    <Typography variant="body2" color="text.secondary">
      Nobody in this run has answered yet, so there is no correct rate to filter by.
    </Typography>
  );

  const groups = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {hasRates && (
        <Box component="section" aria-labelledby="qf-answers">
          <SectionTitle id="qf-answers">Answers</SectionTitle>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={filters.minAnswers}
            onChange={(_, v) => v != null && set({ minAnswers: v })}
            aria-labelledby="qf-answers"
            sx={{ flexWrap: 'wrap' }}
          >
            {MIN_ANSWER_CHOICES.map((n) => (
              <ToggleButton key={n} value={n} sx={toggleSx}>
                {n === 0 ? 'Any' : `${n} or more`}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            One wrong answer is 0%. Set a floor to hide questions too few students saw to judge.
          </Typography>
        </Box>
      )}

      <Box component="section" aria-labelledby="qf-ai">
        <SectionTitle id="qf-ai">AI check</SectionTitle>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={filters.ai}
          onChange={(_, v) => v && set({ ai: v })}
          aria-labelledby="qf-ai"
          sx={{ flexWrap: 'wrap' }}
        >
          {AI_FILTERS.map((a) => (
            <ToggleButton key={a} value={a} sx={toggleSx}>
              {AI_FILTER_LABELS[a]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box component="section" aria-labelledby="qf-sort">
        <SectionTitle id="qf-sort">Sort</SectionTitle>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={filters.sort}
          onChange={(_, v) => v && set({ sort: v })}
          aria-labelledby="qf-sort"
          sx={{ flexWrap: 'wrap' }}
        >
          {QUESTION_SORTS.map((s) => (
            <ToggleButton key={s} value={s} disabled={!hasRates && s !== 'paper'} sx={toggleSx}>
              {SORT_LABELS[s]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: wide ? 'minmax(0, 1.15fr) minmax(0, 1fr)' : '1fr',
        gap: wide ? 3 : 2.5,
      }}
    >
      {rate}
      {groups}
    </Box>
  );
}

export default function QuestionFilterPanel({
  open,
  onClose,
  filters,
  onChange,
  questions,
  matchCount,
  hasRates,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Sort is how a teacher is reading the list, not something they are narrowing
  // it by, so clearing the filters leaves it alone.
  const reset = () => onChange({ ...DEFAULT_QUESTION_FILTERS, pct: [0, 100], sort: filters.sort });
  const showLabel = `Show ${matchCount} question${matchCount === 1 ? '' : 's'}`;

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
        Filters
      </Typography>
      <Button onClick={reset} sx={{ textTransform: 'none', minHeight: 44 }}>
        Reset
      </Button>
      <IconButton onClick={onClose} aria-label="Close filters" sx={{ width: 44, height: 44 }}>
        <CloseIcon />
      </IconButton>
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88vh' },
        }}
      >
        <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1 }} />
        <Box sx={{ px: 2, pt: 0.5 }}>{header}</Box>
        <Divider />
        <Box sx={{ px: 2, py: 2, overflowY: 'auto' }}>
          <FilterBody
            filters={filters}
            onChange={onChange}
            questions={questions}
            hasRates={hasRates}
            wide={false}
          />
        </Box>
        <Box
          sx={{
            px: 2,
            pt: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom))',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Button fullWidth variant="contained" onClick={onClose} sx={{ minHeight: 48, textTransform: 'none' }}>
            {showLabel}
          </Button>
        </Box>
      </Drawer>
    );
  }

  return (
    <Collapse in={open} unmountOnExit>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 1.5 }}>
        <Box sx={{ mb: 1.5 }}>{header}</Box>
        <FilterBody filters={filters} onChange={onChange} questions={questions} hasRates={hasRates} wide />
      </Paper>
    </Collapse>
  );
}
