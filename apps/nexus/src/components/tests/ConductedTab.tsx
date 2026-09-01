'use client';

/**
 * What this class has actually sat, newest first.
 *
 * The Tests hub could tell a teacher every paper that exists and where each one
 * is filed, but never which of them a class had sat, when, or how it went. The
 * one class test in production was a nexus_exams row reachable only by knowing
 * which lecture it hung off, in a different sidebar panel from this page.
 *
 * The counts are three independent facts, never a ratio. "16 of 36" would read
 * as a target and would then contradict the results page, whose DONE tile
 * counts only the students the eligibility engine says the run was set for.
 * Three plain numbers cannot disagree with a fourth.
 */

import { useCallback, useEffect, useState } from 'react';
import { Box, Typography, Paper, Chip, Skeleton, Alert } from '@neram/ui';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import type { ConductedKind } from '@/lib/conducted-runs';
import { KIND_LABELS } from '@/lib/conducted-runs';

export interface ConductedRunRow {
  placement_id: string;
  test_id: string;
  kind: ConductedKind;
  title: string;
  class_title: string | null;
  classroom_name: string | null;
  at: string | null;
  students_sat: number;
  attempts: number;
  passed: number;
  enrolled: number;
  passing_pct: number | null;
  results_unpublished: boolean;
  href: string;
}

/**
 * The filters, as a teacher would name them.
 *
 * "Conducted" leads and is the default because it is the question this tab
 * exists for. Catch-up sits behind its own chip rather than in the main list:
 * those papers are per student make-goods, they are auto-generated one per
 * class, and on production they outnumber real class tests twenty to one.
 */
const FILTERS: Array<{ key: string; label: string; include: ConductedKind[] }> = [
  { key: 'conducted', label: 'Conducted', include: ['exam', 'class_test', 'assigned'] },
  { key: 'exam', label: 'Exams', include: ['exam'] },
  { key: 'class', label: 'Class tests', include: ['class_test', 'assigned'] },
  { key: 'catchup', label: 'Catch-up', include: ['catchup'] },
  { key: 'prep', label: 'Before class', include: ['prep'] },
];

const KIND_COLOR: Record<ConductedKind, string> = {
  exam: '#DC2626',
  class_test: '#EA580C',
  assigned: '#6366F1',
  catchup: '#0891B2',
  prep: '#D97706',
};

function formatDay(iso: string | null): string {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No date';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/** Three counts, middot separated, never an "N of M". */
function countLine(run: ConductedRunRow): string {
  const parts = [`${run.students_sat} sat`];
  if (run.passing_pct != null) parts.push(`${run.passed} passed`);
  parts.push(`${run.enrolled} enrolled`);
  return parts.join(' · ');
}

function RunRow({ run, onOpen }: { run: ConductedRunRow; onOpen: (href: string) => void }) {
  // The lecture name is worth a line only when it says something the paper
  // title does not. Catch-up papers are auto-titled "{class}: class test", so
  // echoing the class under the title would print the same words twice.
  const showsClass =
    run.class_title && run.class_title !== run.title && !run.title.startsWith(run.class_title);

  return (
    <Paper
      variant="outlined"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(run.href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(run.href);
        }
      }}
      sx={{
        p: 1.5,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 48,
        cursor: 'pointer',
        transition: 'background-color 150ms, border-color 150ms',
        '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.light' },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {formatDay(run.at)}
          </Typography>
          {run.classroom_name && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {'·'} {run.classroom_name}
            </Typography>
          )}
          <Chip
            size="small"
            label={KIND_LABELS[run.kind]}
            sx={{
              height: 20,
              fontSize: '0.68rem',
              fontWeight: 700,
              bgcolor: `${KIND_COLOR[run.kind]}1A`,
              color: KIND_COLOR[run.kind],
            }}
          />
        </Box>

        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35 }}>
          {run.title}
        </Typography>

        {showsClass && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            Follows {run.class_title}
          </Typography>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {countLine(run)}
        </Typography>

        {/* The one thing on this row a teacher can act on immediately: their
            students still cannot see their own answers. */}
        {run.results_unpublished && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            <VisibilityOffOutlinedIcon sx={{ fontSize: 14, color: 'warning.main' }} />
            <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 700 }}>
              Results not published
            </Typography>
          </Box>
        )}
      </Box>
      <ChevronRightOutlinedIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
    </Paper>
  );
}

export default function ConductedTab({
  classroomId,
  authFetch,
  onOpen,
}: {
  /** Null when the teacher has not picked a class in the top bar yet. */
  classroomId: string | null;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  onOpen: (href: string) => void;
}) {
  const [filter, setFilter] = useState('conducted');
  const [runs, setRuns] = useState<ConductedRunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classroomId) return;
    setRuns(null);
    setError(null);
    try {
      const include = (FILTERS.find((f) => f.key === filter) || FILTERS[0]).include.join(',');
      const json = await authFetch(
        `/api/tests/conducted?classroom_id=${encodeURIComponent(classroomId)}&include=${include}`,
      );
      setRuns((json.data?.runs || []) as ConductedRunRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load what this class has sat');
      setRuns([]);
    }
  }, [classroomId, filter, authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (!classroomId) {
    return (
      <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
        <FactCheckOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          Pick your class at the top of the screen to see the tests it has sat.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Every test this class has sat, newest first. Tap one to see who did it, who did not, and what each
        of them answered.
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            size="small"
            color={filter === f.key ? 'primary' : 'default'}
            variant={filter === f.key ? 'filled' : 'outlined'}
            onClick={() => setFilter(f.key)}
            sx={{ height: 36, px: 0.5, cursor: 'pointer' }}
          />
        ))}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {runs === null ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={92} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : runs.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
          <FactCheckOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {filter === 'conducted'
              ? 'This class has not sat a test yet. Set one from a class in the timetable, and it appears here.'
              : 'Nothing here with that filter.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {runs.map((r) => (
            <RunRow key={r.placement_id} run={r} onOpen={onOpen} />
          ))}
        </Box>
      )}
    </Box>
  );
}
