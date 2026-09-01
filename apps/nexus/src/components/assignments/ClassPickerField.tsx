'use client';

/**
 * Pick the timetable class an assignment belongs to, from inside the assignment
 * form.
 *
 * Before this the relationship could only be written from the other end: save
 * the assignment, leave for the timetable, find the class, open its panel, tap
 * "Link existing", then scan an unsearchable list. Every one of those steps is
 * a place to lose the thread, and none of them are where the teacher already
 * is when they are thinking about the work.
 *
 * The suggestion is a suggestion, never an application. Guessing the class from
 * the assignment's date is right often enough to save a search and wrong often
 * enough that applying it silently would attach work to the wrong session, and
 * a wrong link moves a student's deadline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@neram/ui';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';

export interface ClassOption {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  scheduled_date: string;
  start_time: string | null;
  topic_title?: string;
}

interface ClassPickerFieldProps {
  classroomId: string;
  value: ClassOption | null;
  onChange: (cls: ClassOption | null) => void;
  getToken: () => Promise<string | null>;
  /**
   * The draft's class date. Used only to rank the suggestion, so the class a
   * teacher is most likely reaching for is the one offered first.
   */
  nearDate?: string;
  label?: string;
  helperText?: string;
  disabled?: boolean;
}

/** "Thu 28 Aug" */
export function formatClassDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "7:00 PM", or '' when the class has no start time. */
export function formatClassTime(startTime: string | null): string {
  if (!startTime) return '';
  const [h, m] = startTime.split(':');
  const hour = Number(h);
  if (!Number.isFinite(hour)) return '';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m ?? '00'} ${suffix}`;
}

/** "Thu 28 Aug, 7:00 PM" — the one way a class is named across this feature. */
export function formatClassLabel(cls: Pick<ClassOption, 'scheduled_date' | 'start_time'>): string {
  const day = formatClassDay(cls.scheduled_date);
  const time = formatClassTime(cls.start_time);
  return time ? `${day}, ${time}` : day;
}

export default function ClassPickerField({
  classroomId,
  value,
  onChange,
  getToken,
  nearDate,
  label = 'Class (optional)',
  helperText,
  disabled = false,
}: ClassPickerFieldProps) {
  const [options, setOptions] = useState<ClassOption[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // A suggestion is only worth offering once. Dismissing or picking retires it,
  // so it cannot reappear over a choice the teacher has already made.
  const [suggestionUsed, setSuggestionUsed] = useState(false);

  // Guards a slow response for an old query overwriting a fast one for the
  // current query, which on a picker reads as the list ignoring what you typed.
  const requestSeq = useRef(0);

  const load = useCallback(
    async (q: string) => {
      if (!classroomId) return;
      const seq = ++requestSeq.current;
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const url = `/api/timetable/class-options?classroom=${encodeURIComponent(classroomId)}${
          q ? `&q=${encodeURIComponent(q)}` : ''
        }`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (seq === requestSeq.current) setOptions(data.classes || []);
      } catch {
        /* the empty state covers this */
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [classroomId, getToken],
  );

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(query), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, query, load]);

  /**
   * The class nearest the assignment's own date, offered rather than applied.
   * Only surfaced when nothing is linked yet: once there is a class, replacing
   * it is a decision, not a shortcut.
   */
  const suggestion = useMemo(() => {
    if (value || suggestionUsed || !nearDate || options.length === 0) return null;
    const target = new Date(`${nearDate}T00:00:00`).getTime();
    if (Number.isNaN(target)) return null;
    let best: ClassOption | null = null;
    let bestGap = Infinity;
    for (const c of options) {
      const gap = Math.abs(new Date(`${c.scheduled_date}T00:00:00`).getTime() - target);
      if (gap < bestGap) {
        bestGap = gap;
        best = c;
      }
    }
    // Beyond a fortnight it stops being a good guess and starts being noise.
    return bestGap <= 14 * 86_400_000 ? best : null;
  }, [value, suggestionUsed, nearDate, options]);

  // The suggestion needs a list to pick from, so prime one on mount even before
  // the field is opened. One request, and only when there is nothing linked.
  useEffect(() => {
    if (!value && options.length === 0) void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId]);

  const pick = (cls: ClassOption | null) => {
    setSuggestionUsed(true);
    onChange(cls);
  };

  return (
    <Box>
      <Autocomplete
        options={options}
        value={value}
        disabled={disabled}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        loading={loading}
        onChange={(_, next) => pick(next)}
        onInputChange={(_, next, reason) => {
          if (reason === 'input') setQuery(next);
        }}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        getOptionLabel={(o) => o.title || 'Untitled class'}
        // The server already searched and ordered; filtering again client-side
        // would hide rows that matched on topic rather than title.
        filterOptions={(x) => x}
        noOptionsText={query ? 'No class matches that' : 'No classes in this classroom yet'}
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.id} sx={{ minHeight: 56, alignItems: 'flex-start', gap: 1 }}>
            <EventOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', mt: 0.5 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {option.title || 'Untitled class'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {[option.topic_title, formatClassLabel(option)].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder="Search classes"
            helperText={helperText}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
            sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
          />
        )}
      />

      {suggestion && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
          <Typography variant="caption" color="text.secondary">
            Suggested:
          </Typography>
          <Chip
            icon={<EventOutlinedIcon sx={{ fontSize: 16 }} />}
            label={`${suggestion.title || 'Untitled class'}, ${formatClassDay(suggestion.scheduled_date)}`}
            onClick={() => pick(suggestion)}
            clickable
            size="small"
            color="primary"
            variant="outlined"
            sx={{ minHeight: 40, fontWeight: 600, cursor: 'pointer' }}
          />
          <Chip
            label="Not this one"
            onClick={() => setSuggestionUsed(true)}
            clickable
            size="small"
            variant="outlined"
            sx={{ minHeight: 40, cursor: 'pointer' }}
          />
        </Stack>
      )}
    </Box>
  );
}
