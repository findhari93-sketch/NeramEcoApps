'use client';

/**
 * The hours and days this course plan is taught in.
 *
 * This is what makes a plan a season. Neram runs evenings only for most of the
 * year, because school students are not free before then; once the board exams
 * finish, the same students are free all day and a different plan runs mornings
 * AND evenings. The changeover date moves every year, so it cannot be a
 * constant, and it belongs on the plan rather than in a separate setting: the
 * plan already carries the dates that bound the season.
 *
 * Two bands rather than one wide one is the point. A single 9 AM to 8 PM band
 * would draw eleven hours of mostly empty grid; two bands let the calendar
 * collapse the dead afternoon between them.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  DEFAULT_CRASH_BANDS,
  DEFAULT_REGULAR_BANDS,
  describeBands,
  normaliseBands,
  normaliseDays,
  validatePlanShape,
  type TimeBand,
} from '@/lib/plan-shape';
import type { IsoWeekday } from '@/lib/timetable-window';

const DAY_LABELS: { value: IsoWeekday; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

interface ClassHoursEditorProps {
  bands: unknown;
  days: unknown;
  saving?: boolean;
  onSave: (bands: TimeBand[], days: IsoWeekday[]) => void;
}

export default function ClassHoursEditor({ bands, days, saving, onSave }: ClassHoursEditorProps) {
  const theme = useTheme();
  const [draftBands, setDraftBands] = useState<TimeBand[]>(() => normaliseBands(bands));
  const [draftDays, setDraftDays] = useState<IsoWeekday[]>(() => normaliseDays(days));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftBands(normaliseBands(bands));
    setDraftDays(normaliseDays(days));
    setError(null);
  }, [bands, days]);

  const shape = draftBands.length > 1 ? 'split' : 'evening';

  const setShape = (next: 'evening' | 'split') => {
    setDraftBands(
      next === 'split'
        ? DEFAULT_CRASH_BANDS.map((b) => ({ ...b }))
        : DEFAULT_REGULAR_BANDS.map((b) => ({ ...b })),
    );
    setError(null);
  };

  const patchBand = (index: number, patch: Partial<TimeBand>) => {
    setDraftBands((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
    setError(null);
  };

  const save = () => {
    const check = validatePlanShape({ bands: draftBands, days: draftDays });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    onSave(check.value!.bands, check.value!.days);
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', mb: 0.75 }}>Class hours</Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={shape}
          onChange={(_, v) => v && setShape(v)}
          aria-label="Class hours shape"
          sx={{ flexWrap: 'wrap' }}
        >
          <ToggleButton value="evening" sx={{ textTransform: 'none', minHeight: 44, px: 2 }}>
            Evening only
          </ToggleButton>
          <ToggleButton value="split" sx={{ textTransform: 'none', minHeight: 44, px: 2 }}>
            Morning and evening
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Stack spacing={1.25}>
        {draftBands.map((band, i) => (
          <Stack key={i} direction="row" spacing={1} alignItems="center">
            <TextField
              label="Label"
              size="small"
              value={band.label ?? ''}
              onChange={(e) => patchBand(i, { label: e.target.value })}
              placeholder={i === 0 && draftBands.length > 1 ? 'Morning' : 'Evening'}
              sx={{ width: 118, flexShrink: 0 }}
            />
            <TextField
              label="From"
              type="time"
              size="small"
              value={band.start}
              onChange={(e) => patchBand(i, { start: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="To"
              type="time"
              size="small"
              value={band.end}
              onChange={(e) => patchBand(i, { end: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            {draftBands.length > 1 && (
              <Button
                onClick={() => setDraftBands((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove the ${band.label || 'unnamed'} band`}
                sx={{ minWidth: 44, minHeight: 44, color: 'text.disabled', flexShrink: 0 }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </Button>
            )}
          </Stack>
        ))}
        {draftBands.length < 4 && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setDraftBands((prev) => [...prev, { start: '14:00', end: '16:00' }])}
            sx={{ alignSelf: 'flex-start', textTransform: 'none', minHeight: 44 }}
          >
            Add another band
          </Button>
        )}
      </Stack>

      {draftBands.length > 1 && (
        <Typography variant="caption" color="text.secondary">
          Two bands keep the calendar compact: the gap between them is collapsed rather than drawn.
        </Typography>
      )}

      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', mb: 0.75 }}>Days</Typography>
        <ToggleButtonGroup
          size="small"
          value={draftDays}
          onChange={(_, v: IsoWeekday[]) => {
            setDraftDays([...v].sort((a, b) => a - b));
            setError(null);
          }}
          aria-label="Days of the week"
          sx={{ flexWrap: 'wrap' }}
        >
          {DAY_LABELS.map((d) => (
            <ToggleButton
              key={d.value}
              value={d.value}
              sx={{ textTransform: 'none', minWidth: 48, minHeight: 44 }}
            >
              {d.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {draftDays.includes(7) && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            Sunday gets a column on the calendar. The plan itself still skips Sundays when it lays
            out dates, so add a Sunday class as a makeup day.
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          px: 1.5,
          py: 1.25,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.07),
        }}
      >
        <Typography variant="body2" sx={{ color: 'primary.dark', fontWeight: 600 }}>
          {describeBands(draftBands)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {draftDays.length === 7
            ? 'Every day'
            : DAY_LABELS.filter((d) => draftDays.includes(d.value))
                .map((d) => d.label)
                .join(', ')}
        </Typography>
      </Box>

      {error && (
        <Typography variant="caption" color="error.main">
          {error}
        </Typography>
      )}

      <Button
        variant="contained"
        onClick={save}
        disabled={saving}
        sx={{ alignSelf: 'flex-start', textTransform: 'none', minHeight: 44, fontWeight: 700 }}
      >
        {saving ? 'Saving...' : 'Save class hours'}
      </Button>
    </Stack>
  );
}
