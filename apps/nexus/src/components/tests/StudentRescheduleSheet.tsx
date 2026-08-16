'use client';

/**
 * A new joiner picks their own make-up date for a test they were auto-excused
 * from -- no teacher approval needed, since nobody expected them to be ready
 * for it in the first place. Every other excused reason routes through a
 * teacher, and does not use this sheet.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, SwipeableDrawer, TextField, Typography } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { StudentTest } from './StudentTestCard';

interface RescheduleOptions {
  min_date: string;
  max_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
}

export interface StudentRescheduleSheetProps {
  /** null closes the sheet. */
  test: StudentTest | null;
  onClose: () => void;
  onRescheduled: () => void;
}

export default function StudentRescheduleSheet({ test, onClose, onRescheduled }: StudentRescheduleSheetProps) {
  const { getToken } = useNexusAuthContext();
  const [options, setOptions] = useState<RescheduleOptions | null>(null);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Request failed');
      return json;
    },
    [getToken],
  );

  useEffect(() => {
    if (!test?.exam_id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOptions(null);
    (async () => {
      try {
        const json = await authFetch(`/api/student/exams/${test.exam_id}/reschedule-options`);
        if (cancelled) return;
        setOptions(json.data);
        setDate(json.data.min_date);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load reschedule options');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [test?.exam_id, authFetch]);

  const handleConfirm = async () => {
    if (!test?.exam_id || !date) return;
    setSaving(true);
    setError(null);
    try {
      await authFetch(`/api/student/exams/${test.exam_id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ date }),
      });
      onRescheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that date');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={Boolean(test)}
      onOpen={() => {}}
      onClose={onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 2.5, pb: 3 } }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
        Pick your make-up date
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {test?.title ? `${test.title}. ` : ''}
        You joined after this test&apos;s covered class(es), so today&apos;s window is not yours to sit.
        Pick a date once you have caught up.
      </Typography>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!loading && options && (
        <>
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: options.min_date, max: options.max_date }}
            helperText={`Opens ${options.start_time}, closes ${options.end_time}, on whatever date you pick.`}
            sx={{ mb: 2.5 }}
          />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={onClose} sx={{ minHeight: 48 }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleConfirm} disabled={saving || !date} sx={{ minHeight: 48 }}>
              {saving ? 'Saving...' : 'Confirm date'}
            </Button>
          </Box>
        </>
      )}
    </SwipeableDrawer>
  );
}
