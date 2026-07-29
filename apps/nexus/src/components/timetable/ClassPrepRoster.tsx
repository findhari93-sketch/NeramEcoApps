'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Collapse,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import { stageKeyOf } from '@/lib/student-stage';
import type { PrepRosterRow, PrepRosterSummary } from '@/lib/class-prep-roster';
import { preworkReasonShortLabel } from '@/lib/prework-reasons';

type Filter = 'all' | 'pending' | 'unprepared';

interface ClassPrepRosterProps {
  classId: string;
  getToken: () => Promise<string | null>;
  /** Bump to refetch, e.g. after the prep test changes. */
  refreshKey?: number;
}

/**
 * Who is ready for this class.
 *
 * Mobile-first, and deliberately not a table. At 375px this is a headline, three
 * tappable count chips, and one flat list of 48px rows. Teachers open this on a
 * phone ten minutes before the class starts and need one glance, not a grid that
 * scrolls sideways.
 */
export default function ClassPrepRoster({ classId, getToken, refreshKey }: ClassPrepRosterProps) {
  const theme = useTheme();
  const [rows, setRows] = useState<PrepRosterRow[]>([]);
  const [summary, setSummary] = useState<PrepRosterSummary | null>(null);
  const [headline, setHeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>('pending');

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/prep-roster`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setRows(d.rows || []);
        setSummary(d.summary || null);
        setHeadline(d.headline || '');
      }
    } catch {
      /* the collapsed state is a fine failure mode */
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Nothing was asked of anybody, so there is nothing to report. Rendering an
  // empty "0 ready" box on every class would be noise on the overwhelming
  // majority of them.
  if (!loading && (!summary || summary.total === 0)) return null;

  const visible = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'unprepared') return r.status === 'attended_unprepared';
    return r.status !== 'ready' && r.status !== 'attended_unprepared';
  });

  const statusLine = (r: PrepRosterRow): string => {
    switch (r.status) {
      case 'ready':
        return 'Ready';
      case 'reason_given':
        return `Told us why: ${preworkReasonShortLabel(r.reason_code)}`;
      case 'attended_unprepared':
        return 'Joined without finishing';
      case 'test_pending':
        return r.test_attempts === 0
          ? 'Has not opened the test'
          : `Best ${Math.round(r.test_best_pct ?? 0)}% over ${r.test_attempts} ${r.test_attempts === 1 ? 'try' : 'tries'}`;
      case 'prework_pending':
        return `${r.assignments_submitted} of ${r.assignments_required} handed in`;
      default:
        return 'Not started';
    }
  };

  const statusColor = (r: PrepRosterRow) => {
    if (r.status === 'ready') return theme.palette.success.main;
    if (r.status === 'attended_unprepared') return theme.palette.error.main;
    if (r.status === 'reason_given') return theme.palette.info.main;
    return theme.palette.warning.main;
  };

  const chip = (label: string, value: Filter, count: number, color: 'default' | 'warning' | 'error') => (
    <Chip
      size="small"
      label={`${count} ${label}`}
      color={filter === value ? color : 'default'}
      variant={filter === value ? 'filled' : 'outlined'}
      onClick={() => {
        setFilter(value);
        setExpanded(true);
      }}
      // 32px is the Chip floor, but the tap area is padded to 44 so it is not a
      // precision target on a phone.
      sx={{ minHeight: 32, py: 1.5, cursor: 'pointer' }}
    />
  );

  return (
    <Box>
      <Box
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minHeight: 48,
          cursor: 'pointer',
          borderRadius: 1.5,
          px: 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        <Typography sx={{ fontWeight: 700, fontSize: '0.8438rem', flex: 1 }}>
          {loading ? 'Checking who is ready' : headline}
        </Typography>
        {loading && <CircularProgress size={16} />}
      </Box>

      <Collapse in={expanded}>
        {summary && (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', px: 1, pb: 1.25, pt: 0.5 }}>
            {chip('to go', 'pending', summary.pending + summary.reasonGiven, 'warning')}
            {summary.unprepared > 0 && chip('unprepared', 'unprepared', summary.unprepared, 'error')}
            {chip('all', 'all', summary.total, 'default')}
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {visible.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 1.5 }}>
              {filter === 'pending' ? 'Everyone is ready.' : 'Nobody in this group.'}
            </Typography>
          ) : (
            visible.map((r) => (
              <Box
                key={r.student_id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  minHeight: 48,
                  px: 1,
                  py: 0.75,
                  borderTop: `1px solid ${theme.palette.divider}`,
                }}
              >
                {/* The ring carries the study stage, so a teacher scanning who
                    is ready ten minutes before class can also see at a glance
                    that the two unprepared names are break-year students. */}
                <StudentStageAvatar
                  stage={stageKeyOf(r.study_stage)}
                  name={r.name}
                  src={r.avatar_url}
                  size={32}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem' }} noWrap>
                    {r.name || 'Unnamed student'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: statusColor(r) }}>
                    {statusLine(r)}
                  </Typography>
                </Box>
                {/* The best score, right aligned, so a column of them scans
                    vertically without a table. */}
                {r.test_best_pct != null && (
                  <Typography
                    sx={{
                      fontWeight: 800,
                      fontSize: '0.8125rem',
                      color: statusColor(r),
                      bgcolor: alpha(statusColor(r), 0.1),
                      borderRadius: 1,
                      px: 0.875,
                      py: 0.25,
                    }}
                  >
                    {Math.round(r.test_best_pct)}%
                  </Typography>
                )}
              </Box>
            ))
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
