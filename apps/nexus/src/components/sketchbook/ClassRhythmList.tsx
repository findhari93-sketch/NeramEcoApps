'use client';

import { useMemo, useState } from 'react';
import { Box, Button, Skeleton, Typography, EmptyState } from '@neram/ui';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { useAuthSWR } from '@/lib/nexus-swr';
import StudentStatFilters, { type StatFilterTile, type StatTone } from '@/components/tests/StudentStatFilters';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import type { ExtraSort, ListAccessors } from '@/lib/student-list-view';
import { RHYTHM_STATUS_LABEL, RHYTHM_STATUS_ORDER, compareByNeed, type RhythmStatus } from '@/lib/sketchbook-status';
import RhythmRow, { type RhythmStudent } from './RhythmRow';
import WeeklyGoalSheet from './WeeklyGoalSheet';
import NudgeSheet from './NudgeSheet';
import TeamsSenderCard from './TeamsSenderCard';
import AutoRemindersNotice from './AutoRemindersNotice';

interface RhythmPayload {
  goal: number;
  startedOn: string;
  today: string;
  pausedCount: number;
  students: RhythmStudent[];
}

type RhythmSort = 'need' | 'week_lowest';
type StatusFilter = RhythmStatus | 'all';

const ACCESSORS: ListAccessors<RhythmStudent> = {
  id: (s) => s.userId,
  name: (s) => s.name,
  email: (s) => s.email,
  joinedAt: (s) => s.enrolledAt,
};

const EXTRA_SORTS: readonly ExtraSort<RhythmStudent, RhythmSort>[] = [
  { key: 'need', label: 'Needs me first', compare: compareByNeed },
  {
    key: 'week_lowest',
    label: 'Fewest days this week',
    compare: (a, b) => a.week.count / Math.max(1, a.week.goal) - b.week.count / Math.max(1, b.week.goal),
  },
];

const STATUS = { of: (s: RhythmStudent) => s.status, order: RHYTHM_STATUS_ORDER };

const TONE: Record<RhythmStatus, StatTone> = {
  needs_call: 'error',
  needs_nudge: 'warning',
  behind: 'info',
  not_started: 'neutral',
  on_track: 'success',
};

const HINT: Record<RhythmStatus, string> = {
  needs_call: '3 reminders, still quiet',
  needs_nudge: 'No drawing for 3+ days',
  behind: 'Short of the weekly goal',
  not_started: 'No drawing yet',
  on_track: 'Drawing on pace',
};

/** The groups a teacher can nudge from: the quiet ones, never "behind" or "on track". */
const NUDGE_STATUSES: readonly RhythmStatus[] = ['needs_nudge', 'needs_call'];
const EMPTY: RhythmStudent[] = [];

/** Shown only when someone is in them: an empty "Needs a call" card is noise. */
const HIDE_WHEN_EMPTY: readonly RhythmStatus[] = ['needs_call', 'not_started'];

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/**
 * Class rhythm: who is drawing, who has gone quiet, and what they drew last.
 *
 * The cards are the filters (press "Needs a nudge 6" to see the six). Below
 * them, the shared student toolbar and one compact row per student. Dormant
 * students never reach this screen; the footnote says how many are hidden.
 */
export default function ClassRhythmList({ classroomId }: { classroomId: string }) {
  const { data, isLoading, error, mutate } = useAuthSWR<RhythmPayload>(
    `/api/sketchbook/class-rhythm?classroom=${encodeURIComponent(classroomId)}`,
  );
  const [goalOpen, setGoalOpen] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);

  const view = useStudentListView<RhythmStudent, RhythmSort, RhythmStatus>({
    rows: data?.students,
    accessors: ACCESSORS,
    extraSorts: EXTRA_SORTS,
    defaultSort: 'need',
    status: STATUS,
    storageKey: 'nexus:sketchbook-rhythm:sort',
  });

  const tiles = useMemo<StatFilterTile<StatusFilter>[]>(
    () =>
      RHYTHM_STATUS_ORDER.filter((key) => !HIDE_WHEN_EMPTY.includes(key) || view.statusCounts[key] > 0 || view.status === key).map((key) => ({
        key,
        label: RHYTHM_STATUS_LABEL[key],
        value: view.statusCounts[key] ?? 0,
        hint: HINT[key],
        tone: TONE[key],
      })),
    [view.statusCounts, view.status],
  );

  if (error && !data) {
    return (
      <EmptyState
        title="Could not load the class rhythm"
        description="Check your connection and try again."
        action={<Button variant="contained" onClick={() => mutate()} sx={{ minHeight: 48 }}>Try again</Button>}
      />
    );
  }

  if (isLoading || !data) {
    return (
      <Box aria-busy="true" aria-label="Loading class rhythm">
        <Skeleton variant="rounded" height={40} sx={{ borderRadius: 2, mb: 1.5 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1, mb: 1.5 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 2 }} />)}
        </Box>
        <Skeleton variant="rounded" height={48} sx={{ borderRadius: 2, mb: 1.5 }} />
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rounded" height={56} sx={{ borderRadius: 1, mb: 0.5 }} />)}
      </Box>
    );
  }

  const noStudents = view.total === 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            Weekly goal: {data.goal} {data.goal === 1 ? 'day' : 'days'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Any drawing counts. Tracking from {shortDate(data.startedOn)}.
          </Typography>
        </Box>
        <Button startIcon={<EditOutlinedIcon />} onClick={() => setGoalOpen(true)} sx={{ minHeight: 48, flexShrink: 0 }} aria-label="Edit weekly goal">
          Edit
        </Button>
      </Box>

      <AutoRemindersNotice />
      <TeamsSenderCard classroomId={classroomId} />

      {noStudents ? (
        <>
          <EmptyState title="No students to show" description="Students appear here once they are enrolled in this class." />
          <PausedFootnote count={view.pausedHidden + data.pausedCount} />
        </>
      ) : (
        <>
          <StudentListToolbar
            view={view}
            statusSlot={
              <StudentStatFilters<StatusFilter>
                tiles={tiles}
                active={view.status}
                onChange={view.setStatus}
                phoneLayout="grid"
              />
            }
          />

          {NUDGE_STATUSES.includes(view.status as RhythmStatus) && view.shown.length > 0 && (
            <Box
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap',
                p: 1, pl: 1.5, mb: 1, borderRadius: 2, bgcolor: 'action.hover',
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {view.shown.length} quiet {view.shown.length === 1 ? 'student' : 'students'} shown
              </Typography>
              <Button
                variant="contained"
                startIcon={<SendOutlinedIcon />}
                onClick={() => setNudgeOpen(true)}
                sx={{ minHeight: 44 }}
                data-testid="nudge-shown"
              >
                Nudge all shown
              </Button>
            </Box>
          )}

          {view.shown.length === 0 ? (
            <EmptyState
              title="No students match"
              description="Try another name, or clear the filters."
              action={<Button onClick={view.clearAll} sx={{ minHeight: 48 }}>Clear filters</Button>}
            />
          ) : (
            <Box component="ul" aria-label="Students" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {view.shown.map((s) => <RhythmRow key={s.userId} student={s} />)}
            </Box>
          )}
          <PausedFootnote count={view.pausedHidden + data.pausedCount} />
        </>
      )}

      <WeeklyGoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} classroomId={classroomId} goal={data.goal} onSaved={() => mutate()} />
      <NudgeSheet
        open={nudgeOpen}
        onClose={() => setNudgeOpen(false)}
        classroomId={classroomId}
        students={nudgeOpen ? view.shown : EMPTY}
        onSent={() => mutate()}
      />
    </Box>
  );
}
