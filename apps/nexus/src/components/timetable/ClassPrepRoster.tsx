'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import { stageKeyOf } from '@/lib/student-stage';
import type { PrepRosterRow, PrepRosterSummary } from '@/lib/class-prep-roster';
import { preworkReasonShortLabel } from '@/lib/prework-reasons';
import { useNexusSWR, useRefreshKey } from '@/lib/nexus-swr';

interface PrepRosterResponse {
  rows?: PrepRosterRow[];
  summary?: PrepRosterSummary | null;
  headline?: string;
}

type Filter = 'all' | 'pending' | 'unprepared' | 'class_test';

interface ClassPrepRosterProps {
  classId: string;
  getToken: () => Promise<string | null>;
  /** Bump to refetch, e.g. after the prep test changes. */
  refreshKey?: number;
  /** Toast for the Remind action. Silent when the host does not want one. */
  onNotify?: (message: string, severity?: 'success' | 'error') => void;
}

/**
 * Who is ready for this class.
 *
 * Mobile-first, and deliberately not a table. At 375px this is a headline, three
 * tappable count chips, and one flat list of 48px rows. Teachers open this on a
 * phone ten minutes before the class starts and need one glance, not a grid that
 * scrolls sideways.
 */
export default function ClassPrepRoster({
  classId,
  getToken,
  refreshKey,
  onNotify,
}: ClassPrepRosterProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>('pending');
  const [reminding, setReminding] = useState(false);

  const { data, isLoading, mutate } = useNexusSWR<PrepRosterResponse>(
    classId ? `/api/timetable/${classId}/prep-roster` : null,
    getToken,
  );
  useRefreshKey(refreshKey, mutate);

  const rows = data?.rows ?? [];
  const summary = data?.summary ?? null;
  const headline = data?.headline ?? '';

  // Nothing was asked of anybody, so there is nothing to report. Rendering an
  // empty "0 ready" box on every class would be noise on the overwhelming
  // majority of them.
  //
  // `isLoading` is false on a revisit, because the cached roster is already
  // there: the second time a teacher opens this class the section renders
  // populated on the first frame instead of flashing a spinner.
  if (!isLoading && (!summary || summary.total === 0)) return null;
  const loading = isLoading;

  const visible = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'unprepared') return r.status === 'attended_unprepared';
    if (filter === 'class_test') return r.status === 'class_test_pending';
    // 'pending' is the PRE-class question, so the after-class test is not in it.
    // Folding the two together would make "28 to go" mean two different things
    // depending on the class, which is how a number stops being trusted.
    return (
      r.status !== 'ready' &&
      r.status !== 'attended_unprepared' &&
      r.status !== 'class_test_pending'
    );
  });

  const remindClassTest = async () => {
    setReminding(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/class-test/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // No ids: the server chases everyone on the roster who still owes it,
        // which is the same set this filter is showing. Sending the ids would
        // make a stale tab able to chase someone who has since passed.
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify?.(d.error || 'Could not send the reminder', 'error');
        return;
      }
      const sent = d?.counts?.total ?? 0;
      onNotify?.(sent === 1 ? 'Reminded 1 student' : `Reminded ${sent} students`);
    } catch {
      onNotify?.('Could not send the reminder', 'error');
    } finally {
      setReminding(false);
    }
  };

  const statusLine = (r: PrepRosterRow): string => {
    switch (r.status) {
      case 'ready':
        return 'Ready';
      case 'class_test_pending':
        return r.class_test_attempts === 0
          ? 'Has not started the class test'
          : `Class test: best ${Math.round(r.class_test_best_pct ?? 0)}% over ${r.class_test_attempts} ${r.class_test_attempts === 1 ? 'try' : 'tries'}`;
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
    // Follow-up work outstanding, not a student about to walk in unprepared, so
    // it reads as information rather than as an alarm.
    if (r.status === 'class_test_pending') return theme.palette.info.main;
    return theme.palette.warning.main;
  };

  /** The score worth showing on this row, given what it is about. */
  const rowScore = (r: PrepRosterRow): number | null =>
    r.status === 'class_test_pending' ? r.class_test_best_pct : r.test_best_pct;

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
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', px: 1, pb: 1.25, pt: 0.5, alignItems: 'center' }}>
            {chip('to go', 'pending', summary.pending + summary.reasonGiven, 'warning')}
            {summary.unprepared > 0 && chip('unprepared', 'unprepared', summary.unprepared, 'error')}
            {(summary.classTestPending ?? 0) > 0 &&
              chip('owe the test', 'class_test', summary.classTestPending, 'default')}
            {chip('all', 'all', summary.total, 'default')}
            {/* Only while that filter is showing, so a teacher cannot chase a
                list they are not looking at. */}
            {filter === 'class_test' && visible.length > 0 && (
              <Button
                size="small"
                startIcon={<NotificationsActiveOutlinedIcon />}
                onClick={remindClassTest}
                disabled={reminding}
                sx={{ textTransform: 'none', minHeight: 36 }}
              >
                Remind {visible.length}
              </Button>
            )}
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {visible.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 1.5 }}>
              {filter === 'pending'
                ? 'Everyone is ready.'
                : filter === 'class_test'
                  ? 'Everyone has passed the class test.'
                  : 'Nobody in this group.'}
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
                {rowScore(r) != null && (
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
                    {Math.round(rowScore(r) as number)}%
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
