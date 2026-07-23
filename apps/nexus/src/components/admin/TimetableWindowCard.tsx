'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import {
  DAY_NAMES,
  DEFAULT_WINDOW,
  TIMETABLE_WINDOW_KEY,
  describeDays,
  describeWindow,
  parseWindow,
  type IsoWeekday,
} from '@/lib/timetable-window';
import { formatHourLabel, resolveBand } from '@/components/timetable/date-utils';

const ALL_DAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

interface TimetableWindowCardProps {
  getToken: () => Promise<string | null>;
}

/**
 * Admin control for the evening class window the timetable draws.
 *
 * Classes run 7 to 8 PM, so a full-day calendar is mostly empty. This narrows
 * the default view. It is presentation only: a class scheduled outside the
 * window still appears, the grid just expands to fit it. The preview strip
 * shows exactly what students will see.
 */
export default function TimetableWindowCard({ getToken }: TimetableWindowCardProps) {
  const theme = useTheme();

  const [start, setStart] = useState(DEFAULT_WINDOW.start);
  const [end, setEnd] = useState(DEFAULT_WINDOW.end);
  const [days, setDays] = useState<IsoWeekday[]>([...DEFAULT_WINDOW.days]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/settings?key=${TIMETABLE_WINDOW_KEY}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          const w = parseWindow(data.value);
          setStart(w.start);
          setEnd(w.end);
          setDays(w.days);
        }
      } catch {
        // Keep the defaults already in state.
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Run the same parser the app uses, so the preview cannot disagree with what
  // students get. An invalid entry shows its repaired value rather than a lie.
  const resolved = useMemo(() => parseWindow({ start, end, days }), [start, end, days]);
  const band = useMemo(() => resolveBand(resolved, []), [resolved]);
  const isRepaired = resolved.start !== start || resolved.end !== end;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: TIMETABLE_WINDOW_KEY, value: resolved }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      setStart(resolved.start);
      setEnd(resolved.end);
      setDays(resolved.days);
      setMessage({ type: 'success', text: 'Timetable window saved. Users see it on their next sign-in.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save the timetable window.',
      });
    } finally {
      setSaving(false);
    }
  }, [resolved, getToken]);

  return (
    <Paper
      elevation={0}
      sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <ScheduleOutlinedIcon color="primary" />
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Timetable window
          </Typography>
          <Typography variant="caption" color="text.secondary">
            The hours and days the calendar draws. A class outside this window is never hidden, the
            grid expands to fit it.
          </Typography>
        </Box>
      </Box>

      {fetching ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
            <TextField
              label="Opens at"
              type="time"
              size="small"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setMessage(null);
              }}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 900 }}
              sx={{ minWidth: 140 }}
            />
            <TextField
              label="Closes at"
              type="time"
              size="small"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setMessage(null);
              }}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 900 }}
              sx={{ minWidth: 140 }}
            />
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
            Days shown
          </Typography>
          <ToggleButtonGroup
            value={days}
            onChange={(_, next: IsoWeekday[]) => {
              // Never let the grid end up with zero columns.
              if (next.length === 0) return;
              setDays([...next].sort((a, b) => a - b));
              setMessage(null);
            }}
            size="small"
            sx={{ flexWrap: 'wrap', mb: 2.5 }}
          >
            {ALL_DAYS.map((d) => (
              <ToggleButton key={d} value={d} sx={{ minWidth: 48, minHeight: 40, textTransform: 'none' }}>
                {DAY_NAMES[d]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {/* Preview: the same band maths the student calendar runs. */}
          <Box
            sx={{
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              overflow: 'hidden',
              mb: 2,
            }}
          >
            <Box
              sx={{
                px: 1.5,
                py: 1,
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                Students see {describeWindow(resolved)}, {describeDays(resolved.days)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'stretch', px: 1.5, py: 1.5, gap: 0.5 }}>
              {band.hours.map((h, i) => (
                <Box key={h} sx={{ flex: i === band.hours.length - 1 ? '0 0 auto' : 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    {formatHourLabel(h)}
                  </Typography>
                  {i < band.hours.length - 1 && (
                    <Box
                      sx={{
                        height: 8,
                        mt: 0.5,
                        mr: 0.5,
                        borderRadius: 1,
                        bgcolor: alpha(theme.palette.primary.main, 0.18),
                      }}
                    />
                  )}
                </Box>
              ))}
            </Box>
          </Box>

          {isRepaired && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
              That entry is not a usable window, so it will save as{' '}
              <strong>{describeWindow(resolved)}</strong>.
            </Alert>
          )}

          {message && (
            <Alert severity={message.type} sx={{ mb: 2, borderRadius: 2 }}>
              {message.text}
            </Alert>
          )}

          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveOutlinedIcon />}
            disabled={saving}
            onClick={handleSave}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, minHeight: 44 }}
          >
            {saving ? 'Saving...' : 'Save window'}
          </Button>
        </>
      )}
    </Paper>
  );
}
