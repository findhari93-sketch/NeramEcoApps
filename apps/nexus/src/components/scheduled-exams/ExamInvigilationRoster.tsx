'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  SwipeableDrawer,
  Typography,
  useTheme,
  alpha,
} from '@neram/ui';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StudentAvatar from '@/components/students/StudentAvatar';
import type { ExamRosterRow, ExamRosterStatus, ExamRosterSummary } from '@/lib/scheduled-exam-roster';

/**
 * Who is sitting the exam right now.
 *
 * Mobile first: a sticky row of counters, a bottom-sheet filter rather than a
 * toolbar, and 48px rows. A teacher invigilating is holding a phone and walking
 * between desks.
 *
 * Status is NEVER carried by colour alone. Each state has an icon and a word,
 * because "who has not started" is the single most consequential thing on this
 * screen and it has to survive a bright room and a colour-blind reader.
 */

const STATUS_META: Record<
  ExamRosterStatus,
  { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error'; Icon: typeof PlayCircleOutlineIcon }
> = {
  in_progress: { label: 'Sitting', color: 'primary', Icon: PlayCircleOutlineIcon },
  not_started: { label: 'Not started', color: 'warning', Icon: RadioButtonUncheckedIcon },
  submitted: { label: 'Submitted', color: 'success', Icon: CheckCircleOutlineIcon },
  absent: { label: 'Absent', color: 'error', Icon: EventBusyOutlinedIcon },
  makeup_open: { label: 'Makeup open', color: 'primary', Icon: LockOpenOutlinedIcon },
  excused: { label: 'Excused', color: 'default', Icon: RadioButtonUncheckedIcon },
};

type Filter = 'all' | ExamRosterStatus;

function formatRemaining(seconds: number | null): string {
  if (seconds == null) return '';
  if (seconds <= 0) return 'time up';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : m > 0 ? `${m}m left` : `${s}s left`;
}

export default function ExamInvigilationRoster({
  examId,
  onGrantMakeup,
}: {
  examId: string;
  onGrantMakeup?: (studentId: string, studentName: string) => void;
}) {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();

  const [rows, setRows] = useState<ExamRosterRow[]>([]);
  const [summary, setSummary] = useState<ExamRosterSummary | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [filterOpen, setFilterOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/exams/${examId}/roster`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not load the roster');
        return;
      }
      setRows(json.data.rows || []);
      setSummary(json.data.summary || null);
      setIsLive(Boolean(json.data.is_live));
      setError(null);
    } catch {
      setError('Could not load the roster');
    } finally {
      setLoading(false);
    }
  }, [examId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll only while the window is actually open. An exam that finished three
  // days ago must not have a browser tab asking about it every 20 seconds.
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [isLive, load]);

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const counters: Array<{ key: Filter; label: string; value: number }> = summary
    ? [
        { key: 'in_progress', label: 'Sitting', value: summary.in_progress },
        { key: 'not_started', label: 'Not started', value: summary.not_started },
        { key: 'submitted', label: 'Submitted', value: summary.submitted },
        { key: 'absent', label: 'Absent', value: summary.absent },
        ...(summary.makeup_open > 0
          ? [{ key: 'makeup_open' as Filter, label: 'Makeup', value: summary.makeup_open }]
          : []),
      ]
    : [];

  return (
    <Box>
      {error && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Counters, sticky so they survive a scroll through 40 students. */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          bgcolor: 'background.paper',
          py: 1,
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          borderBottom: `1px solid ${theme.palette.divider}`,
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {counters.map((c) => (
          <Chip
            key={c.key}
            label={`${c.label} ${c.value}`}
            onClick={() => setFilter(filter === c.key ? 'all' : c.key)}
            variant={filter === c.key ? 'filled' : 'outlined'}
            color={filter === c.key ? 'primary' : 'default'}
            sx={{ minHeight: 36, flexShrink: 0, cursor: 'pointer' }}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          startIcon={<FilterListIcon />}
          onClick={() => setFilterOpen(true)}
          sx={{ display: { xs: 'inline-flex', md: 'none' }, minHeight: 36, flexShrink: 0 }}
        >
          Filter
        </Button>
      </Box>

      {isLive && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 1 }}>
          Updating every 20 seconds while the exam is open.
        </Typography>
      )}

      {filtered.length === 0 ? (
        <Box sx={{ py: 5, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {filter === 'all' ? 'Nobody is enrolled in this classroom yet.' : 'Nobody in that state.'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
          {filtered.map((row) => {
            const meta = STATUS_META[row.status];
            const Icon = meta.Icon;
            return (
              <Paper
                key={row.student_id}
                variant="outlined"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 1.5,
                  py: 1,
                  minHeight: 56,
                  borderRadius: 1.5,
                  borderColor:
                    row.status === 'not_started'
                      ? alpha(theme.palette.warning.main, 0.4)
                      : 'divider',
                }}
              >
                {/* StudentAvatar, not a bare Avatar: it carries the cohort ring,
                    the shared initials fallback and the long-press photo viewer
                    that hand-written initials do not. */}
                <StudentAvatar
                  userId={row.student_id}
                  name={row.name}
                  src={row.avatar_url}
                  size={36}
                  tapToView
                />

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {row.name}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Icon sx={{ fontSize: 14, color: `${meta.color}.main` }} aria-hidden />
                    <Typography variant="caption" color="text.secondary">
                      {meta.label}
                      {row.status === 'in_progress' && row.seconds_remaining != null
                        ? ` · ${formatRemaining(row.seconds_remaining)}`
                        : ''}
                      {row.status === 'submitted' && row.percentage != null
                        ? ` · ${Math.round(row.percentage)}%${row.provisional ? ' provisional' : ''}`
                        : ''}
                      {row.is_makeup ? ' · makeup' : ''}
                    </Typography>
                  </Box>
                </Box>

                {row.status === 'absent' && onGrantMakeup && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => onGrantMakeup(row.student_id, row.name)}
                    sx={{ minHeight: 40, flexShrink: 0 }}
                  >
                    Second window
                  </Button>
                )}
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Filters as a bottom sheet, thumb-reachable, rather than a toolbar. */}
      <SwipeableDrawer
        anchor="bottom"
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        onOpen={() => setFilterOpen(true)}
        disableSwipeToOpen
      >
        <Box sx={{ p: 2, pb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            Show
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(['all', 'in_progress', 'not_started', 'submitted', 'absent', 'makeup_open'] as Filter[]).map(
              (key) => (
                <Button
                  key={key}
                  fullWidth
                  variant={filter === key ? 'contained' : 'text'}
                  onClick={() => {
                    setFilter(key);
                    setFilterOpen(false);
                  }}
                  sx={{ justifyContent: 'flex-start', minHeight: 48, textTransform: 'none' }}
                >
                  {key === 'all' ? 'Everyone' : STATUS_META[key as ExamRosterStatus].label}
                </Button>
              ),
            )}
          </Box>
        </Box>
      </SwipeableDrawer>
    </Box>
  );
}
