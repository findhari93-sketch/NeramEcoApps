'use client';

/**
 * Assignments (student): everything the student needs to do, with a personal
 * clock. Late joiners see "Day N since you joined" and a class recording to
 * catch up on; on-time students see the due date. Tap a card to open, submit,
 * and (for reviewed work) see marks and feedback.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Stack, Chip, Skeleton, ToggleButton, ToggleButtonGroup, IconButton, alpha,
} from '@neram/ui';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { computeAssignmentClock } from '@/lib/assignment-clock';

interface Submission {
  status: 'submitted' | 'reviewed' | 'redo';
  marks: number | null;
}
interface StudentAssignment {
  id: string;
  title: string;
  class_date: string;
  due_at: string | null;
  max_marks: number;
  catchup_window_days: number;
  enrolled_at: string | null;
  assignment_type: 'drawing' | 'document';
  drawing_rating: number | null;
  submission: Submission | null;
  resolved_recording_url: string | null;
  classroom_name: string | null;
}

const STATUS_COLOR = { redo: '#B54700', reviewed: '#2E7D32', submitted: '#1565C0' } as const;

function formatDay(ymd: string): string {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: undefined });
}

export default function StudentAssignmentsPage() {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const { loading: authLoading } = useNexusAuthContext();

  const [items, setItems] = useState<StudentAssignment[] | null>(null);
  const [tab, setTab] = useState<'todo' | 'done'>('todo');

  const load = useCallback(async () => {
    setItems(null);
    try {
      const res = await authFetch('/api/student/assignments');
      setItems(res.assignments as StudentAssignment[]);
    } catch {
      setItems([]);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const isTodo = (a: StudentAssignment) => !a.submission || a.submission.status === 'redo';
  const visible = useMemo(
    () => (items || []).filter((a) => (tab === 'todo' ? isTodo(a) : !isTodo(a))),
    [items, tab],
  );
  const todoCount = useMemo(() => (items || []).filter(isTodo).length, [items]);

  const clockChip = (a: StudentAssignment) => {
    const clock = computeAssignmentClock({
      class_date: a.class_date,
      enrolled_at: a.enrolled_at,
      due_at: a.due_at,
      catchup_window_days: a.catchup_window_days,
    });
    // Reviewed work: show the mark (or drawing rating) instead of a deadline.
    if (a.submission?.status === 'reviewed') {
      const label =
        a.assignment_type === 'drawing'
          ? a.drawing_rating != null
            ? `★ ${a.drawing_rating}/5`
            : 'Reviewed'
          : `${a.submission.marks ?? 0} / ${a.max_marks}`;
      return <Chip size="small" label={label} sx={{ height: 22, fontWeight: 700, bgcolor: alpha('#2E7D32', 0.12), color: '#1B5E20' }} />;
    }
    if (a.submission && a.submission.status !== 'redo') return null;
    // Not submitted (or redo): show the personal clock.
    if (clock.is_late_joiner) {
      const overdue = clock.status === 'overdue';
      return (
        <Chip
          size="small"
          label={overdue ? `${Math.abs(clock.days_remaining ?? 0)}d overdue` : `Day ${clock.days_elapsed}`}
          sx={{ height: 22, fontWeight: 700, bgcolor: alpha(overdue ? '#C62828' : '#B8860B', 0.14), color: overdue ? '#C62828' : '#8a6100' }}
        />
      );
    }
    if (clock.personal_due) {
      const overdue = clock.status === 'overdue';
      return (
        <Chip
          size="small"
          label={overdue ? 'Overdue' : clock.days_remaining === 0 ? 'Due today' : `${clock.days_remaining}d left`}
          sx={{ height: 22, fontWeight: 700, bgcolor: alpha(overdue ? '#C62828' : '#1565C0', 0.12), color: overdue ? '#C62828' : '#1565C0' }}
        />
      );
    }
    return null;
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 640, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, flex: 1, fontSize: { xs: '1.3rem', sm: '1.5rem' } }}>
          Assignments
        </Typography>
        <IconButton onClick={load} aria-label="Refresh" sx={{ width: 44, height: 44 }}>
          <RefreshIcon />
        </IconButton>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Submit your work to keep your streak and climb the leaderboard.
      </Typography>

      <ToggleButtonGroup value={tab} exclusive fullWidth size="small" onChange={(_, v) => v && setTab(v)} sx={{ mb: 2 }}>
        <ToggleButton value="todo" sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
          To do ({todoCount})
        </ToggleButton>
        <ToggleButton value="done" sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
          Done
        </ToggleButton>
      </ToggleButtonGroup>

      {items === null ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      ) : visible.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <Typography variant="body2" color="text.disabled">
            {tab === 'todo' ? 'You are all caught up. Nice work!' : 'Nothing submitted yet.'}
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {visible.map((a) => (
            <Box
              key={a.id}
              role="button"
              onClick={() => router.push(`/student/assignments/${a.id}`)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                p: 1.5,
                minHeight: 72,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                  {a.title}
                </Typography>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                  <Typography variant="caption" color="text.secondary">
                    Class {formatDay(a.class_date)} · /{a.max_marks}
                  </Typography>
                  {a.submission?.status === 'redo' && (
                    <Chip label="Redo" size="small" sx={{ height: 20, fontWeight: 700, bgcolor: alpha(STATUS_COLOR.redo, 0.14), color: STATUS_COLOR.redo }} />
                  )}
                  {a.resolved_recording_url && (
                    <Chip icon={<PlayCircleOutlineIcon sx={{ fontSize: 15 }} />} label="Recording" size="small" variant="outlined" sx={{ height: 20 }} />
                  )}
                </Stack>
              </Box>
              {clockChip(a)}
              <ChevronRightIcon sx={{ color: 'text.disabled' }} />
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
