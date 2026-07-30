'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Stack,
  Skeleton,
  Alert,
  Button,
  alpha,
  useTheme,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import EnrollmentNotice from '@/components/parent/EnrollmentNotice';
import ParentMetricGrid from '@/components/parent/ParentMetricGrid';
import StatusPill from '@/components/parent/StatusPill';
import { RADIUS, SECTION_LABEL_SX } from '@/components/timetable/timetable-theme';
import { describeAggregate } from '@/lib/parent-aggregate';
import type { ParentAssignmentsResponse } from '@/app/api/parent/assignments/route';
import type { ParentAssignmentListItem } from '@/lib/parent-work';

/**
 * The parent's Work tab.
 *
 * Grouped by who has to act next, not by date. "Still to do" first because it is
 * the only section a parent can do anything about tonight; "marked" last because
 * it is history, however good it is.
 *
 * Every card carries the anonymous class total. That is the difference between a
 * parent panicking about an unsubmitted assignment nobody has started and one
 * where their child is the last to hand in.
 */

function friendlyDate(ymd: string | null): string | null {
  if (!ymd) return null;
  const ms = Date.parse(`${ymd}T00:00:00+05:30`);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(ms);
}

function AssignmentCard({ item }: { item: ParentAssignmentListItem }) {
  const theme = useTheme();

  const status =
    item.bucket === 'marked'
      ? { label: 'Marked', tone: 'success' as const }
      : item.bucket === 'waiting_on_teacher'
        ? { label: 'Handed in', tone: 'primary' as const }
        : item.isOverdue
          ? { label: 'Overdue', tone: 'error' as const }
          : { label: 'Still to do', tone: 'warning' as const };

  const due = friendlyDate(item.dueOn);

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: RADIUS.card,
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0 }}>
          {item.title}
        </Typography>
        <StatusPill status={status} />
      </Box>

      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        {item.classTitle || 'Class'}
        {friendlyDate(item.classDate) ? ` · ${friendlyDate(item.classDate)}` : ''}
        {due ? ` · due ${due}` : ''}
      </Typography>

      {item.score !== null && (
        <Typography sx={{ fontSize: 16, fontWeight: 700, mt: 1 }}>
          {item.evaluationType === 'stars'
            ? `${item.score} out of ${item.maxScore ?? 5} stars`
            : `${item.score} out of ${item.maxScore ?? 10}`}
        </Typography>
      )}

      {item.attempt > 1 && (
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
          Submitted {item.attempt} times
        </Typography>
      )}

      {/* The teacher's own words, verbatim. */}
      {item.feedback && (
        <Box
          sx={{
            mt: 1,
            p: 1.25,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.primary.main, 0.05),
          }}
        >
          <Typography sx={{ fontSize: 14, lineHeight: 1.55 }}>{item.feedback}</Typography>
        </Box>
      )}

      <Typography sx={{ fontSize: 13, color: 'text.disabled', mt: 1 }}>
        {describeAggregate(item.aggregate)}
      </Typography>
    </Box>
  );
}

function Bucket({
  label,
  items,
  emptyText,
}: {
  label: string;
  items: ParentAssignmentListItem[];
  emptyText: string;
}) {
  return (
    <Box>
      <Typography sx={SECTION_LABEL_SX}>
        {label} {items.length > 0 ? `(${items.length})` : ''}
      </Typography>
      {items.length === 0 ? (
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{emptyText}</Typography>
      ) : (
        <Stack spacing={1.25}>
          {items.map((i) => (
            <AssignmentCard key={i.id} item={i} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function ParentAssignmentsPage() {
  const { getToken } = useNexusAuthContext();
  const [data, setData] = useState<ParentAssignmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/parent/assignments', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the assignments.');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the assignments.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Fetch once on mount. No polling, per the Vercel cost rules.
  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={28} width={140} />
        <Skeleton variant="rounded" height={88} />
        <Skeleton variant="rounded" height={140} />
        <Skeleton variant="rounded" height={140} />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={load}>
            Try again
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  if (!data) return null;

  const { summary, buckets } = data;

  return (
    <Stack spacing={2.5}>
      <Typography sx={{ fontWeight: 700, fontSize: 20 }}>Assignments</Typography>

      <EnrollmentNotice notice={data.notice} />

      <ParentMetricGrid
        metrics={[
          {
            label: 'Still to do',
            value: summary.needsDoing,
            emptyLabel: 'Nothing pending',
            tone: summary.needsDoing > 0 ? 'warning' : 'success',
          },
          {
            label: 'Overdue',
            value: summary.overdue,
            emptyLabel: 'None',
            tone: summary.overdue > 0 ? 'error' : 'success',
          },
          {
            label: 'With teacher',
            value: summary.waitingOnTeacher,
            emptyLabel: 'None',
          },
          {
            // null, never 0, when nothing has been marked. An average of no
            // marks is not zero, and showing 0% would read as a failing child.
            label: 'Average',
            value: summary.averagePercent === null ? null : `${summary.averagePercent}%`,
            emptyLabel: 'Nothing marked yet',
            tone:
              summary.averagePercent === null
                ? 'neutral'
                : summary.averagePercent >= 60
                  ? 'success'
                  : 'warning',
          },
        ]}
      />

      <Bucket
        label="Still to do"
        items={buckets.needsDoing}
        emptyText="Nothing is outstanding right now."
      />
      <Bucket
        label="Waiting on the teacher"
        items={buckets.waitingOnTeacher}
        emptyText="Nothing is waiting to be marked."
      />
      <Bucket
        label="Marked"
        items={buckets.marked}
        emptyText="No work has been marked yet."
      />

      <Typography sx={{ fontSize: 13, color: 'text.disabled', lineHeight: 1.5 }}>
        Class totals never name other students. Only your child can open and
        submit work, from their own account.
      </Typography>
    </Stack>
  );
}
