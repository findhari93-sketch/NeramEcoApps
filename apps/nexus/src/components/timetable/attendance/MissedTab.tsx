'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Collapse,
  IconButton,
  Skeleton,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhoneIcon from '@mui/icons-material/Phone';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import { stageKeyOf } from '@/lib/student-stage';
import { reasonShortLabel } from '@/lib/rsvp-reasons';
import type { AttendanceTabProps, StudentInsight } from './types';

/**
 * Who was not here, grouped by whether anything is being done about it.
 *
 * The order of the groups is the whole design. A teacher opening this after a
 * class has one question, "who do I chase", and the answer is the first group:
 * away, said nothing, has not watched the recording. Students who explained
 * themselves come second because they need a look but not a call. Late joiners
 * come third: the work is owed but nobody did anything wrong, so they must never
 * sit in a list headed "No reason given". Anyone who has already caught up is
 * collapsed, because they are finished and showing them expanded buries the four
 * names that matter under twelve that do not.
 *
 * Everything here is a selection. The actions live in the shell's bar, so a
 * teacher can tick names across two groups and send one message.
 */

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return null;
  }
}

/** What this student has and has not done about the class they missed. */
function progressLine(s: StudentInsight): string {
  const a = s.absence;
  if (a?.excused_at) return 'Excused by a teacher';
  if (a?.caught_up_at) return 'Caught up';
  if (a?.recording_watched_at) return 'Watched the recording, check not taken yet';
  return 'Recording not watched';
}

function MissedRow({
  student,
  selected,
  onSelect,
}: {
  student: StudentInsight;
  selected: boolean;
  onSelect: (id: string, next: boolean) => void;
}) {
  const a = student.absence;
  const reason = a?.reason_code ? reasonShortLabel(a.reason_code) : null;
  const said = shortDate(a?.reason_submitted_at ?? null);
  const nudged = shortDate(a?.followup_sent_at ?? null);
  const joined = shortDate(student.enrolled_at ?? null);

  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.5,
        px: 0.5,
        py: 1,
        borderRadius: 1,
        minHeight: 48,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {/* 44px is the floor for the most repeated tap on this screen. The label
          wrapper means the name and the reason are part of the target too. */}
      <Checkbox
        checked={selected}
        onChange={(e) => onSelect(student.id, e.target.checked)}
        sx={{ p: 1.25, mt: -0.5 }}
        inputProps={{ 'aria-label': `Select ${student.name}` }}
      />
      <StudentStageAvatar
        stage={stageKeyOf(student.study_stage)}
        dormant={student.dormant}
        name={student.name}
        src={student.avatar_url}
        size={36}
        tapToView={false}
      />
      <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {student.name}
        </Typography>

        {student.joinedAfterClass ? (
          // Never "No reason given". They enrolled after this class ran, so the
          // absence is an artefact of the calendar rather than a choice, and the
          // per-class reason route refuses their answer anyway.
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Joined after this class
            {joined && `, enrolled ${joined}`}
          </Typography>
        ) : reason || a?.reason_note ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {reason}
            {said && `, said ${said}`}
            {a?.reason_source === 'parent' && ', by a parent'}
            {a?.reason_note && (
              // overflowWrap: a student's own words can be one long unbroken
              // string, and truncating the reason defeats the point of showing it.
              <Box
                component="span"
                sx={{ display: 'block', fontStyle: 'italic', color: 'text.primary', overflowWrap: 'anywhere' }}
              >
                &ldquo;{a.reason_note}&rdquo;
              </Box>
            )}
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            No reason given
          </Typography>
        )}

        <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
          {progressLine(student)}
          {nudged && ` · last nudged ${nudged}`}
        </Typography>
      </Box>

      {/* A number is the fastest route to a student who has gone quiet, and it
          is one tap on the phone the teacher is already holding. */}
      {student.phone && (
        <IconButton
          component="a"
          href={`tel:${student.phone}`}
          aria-label={`Call ${student.name}`}
          onClick={(e) => e.stopPropagation()}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <PhoneIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

/**
 * Tick everyone who still owes work on this class, in one gesture.
 *
 * The group headers could already select a group each, which is not the same
 * thing: chasing a whole class meant finding three separate checkboxes and
 * remembering which ones existed today, and the tab label says "Missed 16" while
 * nothing on the screen could produce 16 ticks. This is that control.
 *
 * It deliberately covers the outstanding groups only. Students who have already
 * caught up are on this tab so a teacher can see the class is closing, not so
 * they can be messaged again about work they have finished.
 */
function SelectAllBar({
  ids,
  selected,
  onSelectMany,
}: {
  ids: string[];
  selected: Set<string>;
  onSelectMany: (ids: string[], next: boolean) => void;
}) {
  const chosen = ids.filter((id) => selected.has(id)).length;
  const all = chosen === ids.length;
  const label = `Select all ${ids.length} not caught up`;

  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        mb: 1.5,
        pr: 1,
        borderRadius: 1,
        minHeight: 48,
        cursor: 'pointer',
        bgcolor: 'action.hover',
        '&:hover': { bgcolor: 'action.selected' },
      }}
    >
      <Checkbox
        checked={all}
        indeterminate={chosen > 0 && !all}
        onChange={() => onSelectMany(ids, !all)}
        sx={{ p: 1.25 }}
        inputProps={{ 'aria-label': label }}
      />
      <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
        {all ? `All ${ids.length} selected` : label}
      </Typography>
      {chosen > 0 && (
        <Typography variant="caption" color="text.secondary">
          {chosen} ticked
        </Typography>
      )}
    </Box>
  );
}

function Group({
  title,
  tone,
  students,
  selected,
  onSelect,
  onSelectMany,
  defaultOpen,
}: {
  title: string;
  tone: 'error' | 'warning' | 'info' | 'success';
  students: StudentInsight[];
  selected: Set<string>;
  onSelect: (id: string, next: boolean) => void;
  onSelectMany: (ids: string[], next: boolean) => void;
  defaultOpen: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  if (students.length === 0) return null;

  const ids = students.map((s) => s.id);
  const chosen = ids.filter((id) => selected.has(id)).length;
  const all = chosen === ids.length;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.5,
          py: 0.5,
          borderRadius: 1,
          bgcolor: alpha(theme.palette[tone].main, 0.1),
        }}
      >
        {/* Selecting the whole group is the gesture a teacher actually makes:
            "everyone who missed this and said nothing, tell them". */}
        <Checkbox
          checked={all}
          indeterminate={chosen > 0 && !all}
          onChange={() => onSelectMany(ids, !all)}
          sx={{ p: 1.25 }}
          inputProps={{ 'aria-label': `Select everyone in ${title}` }}
        />
        <Typography
          variant="caption"
          sx={{ fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 }}
        >
          {title}
        </Typography>
        <Chip size="small" color={tone} label={students.length} sx={{ fontWeight: 700 }} />
        <IconButton
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          aria-expanded={open}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <ExpandMoreIcon
            sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
          />
        </IconButton>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pt: 0.5 }}>
          {students.map((s) => (
            <MissedRow key={s.id} student={s} selected={selected.has(s.id)} onSelect={onSelect} />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function MissedTab({
  insights,
  insightsLoading,
  selected,
  onSelect,
  onSelectMany,
}: AttendanceTabProps) {
  const groups = useMemo(() => {
    const students = insights?.students ?? [];
    return {
      silent: students.filter((s) => s.bucket === 'missed_no_reason'),
      explained: students.filter((s) => s.bucket === 'missed_with_reason'),
      lateJoiners: students.filter((s) => s.bucket === 'late_joiner'),
      done: students.filter((s) => s.bucket === 'caught_up' || s.bucket === 'excused'),
    };
  }, [insights]);

  /**
   * Everyone the actions are for, in the order they are shown. Built from the
   * same three arrays the groups render, so the count on the Select all control
   * can never claim more people than are on the screen.
   */
  const outstandingIds = useMemo(
    () => [...groups.silent, ...groups.explained, ...groups.lateJoiners].map((s) => s.id),
    [groups],
  );

  if (insightsLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  if (!insights) return <Alert severity="info">Could not load this class.</Alert>;

  const nobodyMissed = outstandingIds.length === 0 && groups.done.length === 0;

  if (nobodyMissed) {
    return (
      <Alert severity="success" sx={{ borderRadius: 2 }}>
        Everyone on the roster was in this class. Nothing to follow up.
      </Alert>
    );
  }

  return (
    <>
      {outstandingIds.length > 0 && (
        <SelectAllBar ids={outstandingIds} selected={selected} onSelectMany={onSelectMany} />
      )}
      <Group
        title="No reason given"
        tone="error"
        students={groups.silent}
        selected={selected}
        onSelect={onSelect}
        onSelectMany={onSelectMany}
        defaultOpen
      />
      <Group
        title="Told us why"
        tone="warning"
        students={groups.explained}
        selected={selected}
        onSelect={onSelect}
        onSelectMany={onSelectMany}
        defaultOpen
      />
      {/* Info, not error: they owe the recording, but nobody skipped anything. */}
      <Group
        title="Joined after this class"
        tone="info"
        students={groups.lateJoiners}
        selected={selected}
        onSelect={onSelect}
        onSelectMany={onSelectMany}
        defaultOpen
      />
      <Group
        title="Already caught up"
        tone="success"
        students={groups.done}
        selected={selected}
        onSelect={onSelect}
        onSelectMany={onSelectMany}
        defaultOpen={false}
      />
    </>
  );
}
