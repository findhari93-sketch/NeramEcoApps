'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Paper, Stack, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import EditIcon from '@mui/icons-material/Edit';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StudentAvatar from '@/components/students/StudentAvatar';
import type { EligibilityBucket, EligibilityRosterRow } from '@/lib/exam-eligibility-roster';

/**
 * Who a scheduled test is actually mandatory for.
 *
 * Two modes, one component:
 *   PREVIEW  no examId yet -- called from ExamScheduleDialog before the
 *            teacher presses "Schedule exam", against the classes they have
 *            ticked so far. No overrides exist yet because there is nothing
 *            to key them on.
 *   LIVE     examId set -- the exam already exists, overrides are shown and
 *            editable (unless readOnly), and this is what the invigilation
 *            roster's eligibility view reuses.
 *
 * Mobile first: a sticky summary row, one card per student rather than a
 * horizontally scrolled table, and a bulk selection + floating action bar
 * instead of a repeated button on every row.
 */

const BUCKET_META: Record<
  EligibilityBucket,
  {
    label: string;
    caption: string;
    color: 'success' | 'warning' | 'info' | 'default';
    Icon: typeof CheckCircleOutlineIcon;
  }
> = {
  mandatory_attended: { label: 'Mandatory', caption: 'Attended', color: 'success', Icon: CheckCircleOutlineIcon },
  mandatory_caught_up: { label: 'Mandatory', caption: 'Caught up', color: 'success', Icon: CheckCircleOutlineIcon },
  excused_pending_catchup: {
    label: 'Excused',
    caption: 'Catch-up pending',
    color: 'warning',
    Icon: EventBusyOutlinedIcon,
  },
  excused_new_joiner: { label: 'Excused', caption: 'New joiner', color: 'info', Icon: PersonAddAltIcon },
  teacher_override_mandatory: { label: 'Mandatory', caption: 'Teacher override', color: 'success', Icon: EditIcon },
  teacher_override_excused: { label: 'Excused', caption: 'Teacher override', color: 'default', Icon: EditIcon },
};

export interface EligibilityRosterSummaryCounts {
  mandatory: number;
  excusedPendingCatchup: number;
  excusedNewJoiner: number;
  overridden: number;
  total: number;
}

export interface EligibilityRosterPanelProps {
  classroomId: string;
  /** Omit for the pre-creation preview; pass the real id once the exam exists. */
  examId?: string;
  /** Preview mode only -- ignored once examId is set (the exam's own links win). */
  coveredClassIds?: string[];
  /** True for the preview: no override controls, read-only bucket list. */
  readOnly?: boolean;
}

export default function EligibilityRosterPanel({
  classroomId,
  examId,
  coveredClassIds,
  readOnly = false,
}: EligibilityRosterPanelProps) {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();

  const [rows, setRows] = useState<EligibilityRosterRow[]>([]);
  const [summary, setSummary] = useState<EligibilityRosterSummaryCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = examId
        ? await authFetch(`/api/exams/${examId}/eligibility`)
        : await authFetch('/api/exams/eligibility-preview', {
            method: 'POST',
            body: JSON.stringify({ classroom_id: classroomId, scheduled_class_ids: coveredClassIds || [] }),
          });
      setRows(json?.data?.rows || []);
      setSummary(json?.data?.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load who this is mandatory for');
    } finally {
      setLoading(false);
    }
  }, [authFetch, examId, classroomId, coveredClassIds]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSelect = (studentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const applyBulkOverride = async (override: 'mandatory' | 'excused') => {
    if (!examId || selected.size === 0) return;
    setBusy(true);
    try {
      await authFetch(`/api/exams/${examId}/eligibility-override/bulk`, {
        method: 'POST',
        body: JSON.stringify({ student_ids: [...selected], override }),
      });
      setSelected(new Set());
      setSelecting(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update those students');
    } finally {
      setBusy(false);
    }
  };

  const clearOverride = async (studentId: string) => {
    if (!examId) return;
    setBusy(true);
    try {
      await authFetch(`/api/exams/${examId}/eligibility-override?student_id=${studentId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear that override');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Stack spacing={1.5} sx={{ p: 2 }}>
        {[0, 1, 2, 3].map((i) => (
          <Box key={i} sx={{ height: 56, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.06) }} />
        ))}
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      {summary && (
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            display: 'flex',
            gap: 1,
            px: 2,
            py: 1.5,
            overflowX: 'auto',
            bgcolor: 'background.paper',
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Chip size="small" color="success" label={`Mandatory ${summary.mandatory}`} />
          <Chip size="small" color="warning" label={`Catch-up pending ${summary.excusedPendingCatchup}`} />
          <Chip size="small" color="info" label={`New joiner ${summary.excusedNewJoiner}`} />
          {summary.overridden > 0 && <Chip size="small" label={`Overridden ${summary.overridden}`} />}
        </Box>
      )}

      {!readOnly && Boolean(examId) && rows.length > 0 && (
        <Box sx={{ px: 2, pt: 1.5 }}>
          <Button size="small" onClick={() => setSelecting((v) => !v)} sx={{ minHeight: 44 }}>
            {selecting ? 'Cancel selecting' : 'Select students'}
          </Button>
        </Box>
      )}

      <Stack spacing={1} sx={{ p: 2, pb: selecting ? 10 : 2 }}>
        {rows.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Nobody is enrolled in this classroom yet.
          </Typography>
        )}
        {rows.map((row) => {
          const meta = BUCKET_META[row.bucket];
          const autoMeta = BUCKET_META[row.auto_bucket];
          return (
            <Paper
              key={row.student_id}
              variant="outlined"
              sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 56 }}
            >
              {selecting && (
                <Checkbox
                  checked={selected.has(row.student_id)}
                  onChange={() => toggleSelect(row.student_id)}
                  sx={{ p: 0.5 }}
                />
              )}
              <StudentAvatar name={row.name || 'Student'} src={row.avatar_url} size={36} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {row.name || 'Student'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {meta.caption}
                  {row.override && `  ·  auto-decided: ${autoMeta.label.toLowerCase()} (${autoMeta.caption.toLowerCase()})`}
                </Typography>
              </Box>
              <Chip size="small" color={meta.color} icon={<meta.Icon sx={{ fontSize: 16 }} />} label={meta.label} />
              {!readOnly && Boolean(examId) && row.override && (
                <Button size="small" onClick={() => clearOverride(row.student_id)} disabled={busy} sx={{ minHeight: 44 }}>
                  Clear
                </Button>
              )}
            </Paper>
          );
        })}
      </Stack>

      {!readOnly && Boolean(examId) && selecting && selected.size > 0 && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            gap: 1,
            justifyContent: 'center',
            flexWrap: 'wrap',
            p: 1.5,
            bgcolor: 'background.paper',
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Button
            variant="contained"
            color="success"
            onClick={() => applyBulkOverride('mandatory')}
            disabled={busy}
            sx={{ minHeight: 48 }}
          >
            Force mandatory ({selected.size})
          </Button>
          <Button
            variant="outlined"
            onClick={() => applyBulkOverride('excused')}
            disabled={busy}
            sx={{ minHeight: 48 }}
          >
            Excuse ({selected.size})
          </Button>
        </Box>
      )}
    </Box>
  );
}
