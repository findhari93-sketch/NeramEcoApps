'use client';

/**
 * Plan Builder (Course Plan v2, sequential auto-flow).
 * Left: the Repository panel (drag or tap-to-place topics). Middle: the
 * computed day-by-day roll-out (FlowList) with pinned tests, locked past and
 * an end-date summary. Entry actions live in a tap sheet; the plan history
 * sits in the shell's drawer.
 */
import { useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Stack,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  SwipeableDrawer,
  Switch,
  FormControlLabel,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SkipNextOutlinedIcon from '@mui/icons-material/SkipNextOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import LowPriorityIcon from '@mui/icons-material/LowPriority';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import PlanShell from '@/components/course-plan/PlanShell';
import { usePlanData } from '@/components/course-plan/usePlanData';
import RepositoryPanel from '@/components/course-plan/RepositoryPanel';
import FlowList from '@/components/course-plan/FlowList';
import ClassHoursEditor from '@/components/course-plan/ClassHoursEditor';
import { entryTitle, entrySpan, fmtShortDow, ENTRY_STATUS, type Entry } from '@/components/course-plan/common';

type Placing = { kind: 'topic'; id: string; title: string } | { kind: 'entry'; id: string; title: string };

export default function PlanBuilderPage() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const planData = usePlanData(planId);
  const { data, plan, flow, busy, act, patch, setSnack, authFetch } = planData;

  const [placing, setPlacing] = useState<Placing | null>(null);
  const [repoOpen, setRepoOpen] = useState(false);
  const [actionEntry, setActionEntry] = useState<Entry | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Test dialog
  const [testOpen, setTestOpen] = useState(false);
  const [testLabel, setTestLabel] = useState('');
  const [testId, setTestId] = useState('');
  const [testDate, setTestDate] = useState('');

  // Pin + span dialogs
  const [pinEntry, setPinEntry] = useState<Entry | null>(null);
  const [pinDate, setPinDate] = useState('');
  const [spanEntry, setSpanEntry] = useState<Entry | null>(null);
  const [spanValue, setSpanValue] = useState(1);

  // Task dialog (create + edit an info task / no-class day)
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskEditId, setTaskEditId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [taskTime, setTaskTime] = useState('');

  // Schedule dialog (Teams bridge, unchanged behavior)
  const [scheduleEntry, setScheduleEntry] = useState<Entry | null>(null);
  const [scDate, setScDate] = useState('');
  const [scStart, setScStart] = useState('19:00');
  const [scEnd, setScEnd] = useState('20:30');
  const [scTeacher, setScTeacher] = useState('');
  const [scTeams, setScTeams] = useState(true);
  const [scScope, setScScope] = useState<'channel_meeting' | 'calendar_event' | 'link_only'>('channel_meeting');

  const dragRef = useRef<{ kind: 'repo' | 'entry'; id: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  const queue = useMemo(
    () => (plan ? [...plan.entries].sort((a, b) => a.position - b.position) : []),
    [plan],
  );

  /** Insert whatever is in-hand (placing or drag payload) before beforeEntryId (null = end). */
  const insertAt = async (
    payload: { kind: 'repo' | 'topic' | 'entry'; id: string },
    beforeEntryId: string | null,
  ) => {
    const beforeIdx = beforeEntryId ? queue.findIndex((e) => e.id === beforeEntryId) : -1;
    if (payload.kind === 'entry') {
      const others = queue.filter((e) => e.id !== payload.id);
      let afterEntryId: string | null = null;
      if (beforeEntryId === null) {
        afterEntryId = others.length ? others[others.length - 1].id : null;
      } else {
        const idxInOthers = others.findIndex((e) => e.id === beforeEntryId);
        afterEntryId = idxInOthers > 0 ? others[idxInOthers - 1].id : null;
      }
      await act(
        { action: 'reorder_entry', entry_id: payload.id, after_entry_id: afterEntryId },
        'Moved. Dates recalculated.',
      );
    } else {
      const body: Record<string, unknown> = {
        action: 'add_entries',
        entries: [{ topic_id: payload.id }],
      };
      if (beforeEntryId !== null) {
        body.after_position = beforeIdx > 0 ? queue[beforeIdx - 1].position : 0;
      }
      await act(body, 'Placed. Later classes shifted.');
    }
    setPlacing(null);
    setRepoOpen(false);
  };

  const onDropBefore = (beforeEntryId: string | null) => {
    const payload = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!payload) return;
    insertAt({ kind: payload.kind === 'repo' ? 'repo' : 'entry', id: payload.id }, beforeEntryId);
  };

  const onInsertBefore = (beforeEntryId: string | null) => {
    if (!placing) return;
    insertAt({ kind: placing.kind === 'topic' ? 'repo' : 'entry', id: placing.id }, beforeEntryId);
  };

  const openSchedule = (entry: Entry) => {
    setActionEntry(null);
    const dates = flow?.entryDates.get(entry.id);
    setScDate(dates?.find((d) => d >= planData.today) || dates?.[0] || planData.today);
    setScStart('19:00');
    setScEnd('20:30');
    setScTeacher(data?.teachers?.[0]?.id || '');
    setScTeams(true);
    setScScope('channel_meeting');
    setScheduleEntry(entry);
  };

  const doSchedule = async () => {
    if (!scheduleEntry || !plan) return;
    try {
      const res = await authFetch(`/api/teaching-plans/${planId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({
          entry_id: scheduleEntry.id,
          scheduled_date: scDate,
          start_time: scStart,
          end_time: scEnd,
          teacher_id: scTeacher || undefined,
        }),
      });
      let teamsMsg = '';
      if (scTeams && res.class?.id) {
        try {
          await authFetch('/api/timetable/teams-meeting', {
            method: 'POST',
            body: JSON.stringify({ class_id: res.class.id, classroom_id: plan.classroom_id, scope: scScope }),
          });
          teamsMsg = ' Teams meeting created.';
        } catch {
          teamsMsg = ' Teams meeting could not be created; you can retry from the Timetable.';
        }
      }
      setScheduleEntry(null);
      setSnack({ msg: `Class scheduled.${teamsMsg}`, sev: 'success' });
      await planData.load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to schedule', sev: 'error' });
    }
  };

  const doAddTest = async () => {
    const entry: Record<string, unknown> = { entry_type: 'test' };
    if (testId) entry.test_id = testId;
    if (testLabel.trim()) entry.label = testLabel.trim();
    if (!testId && !testLabel.trim()) return;
    if (testDate) entry.planned_date = testDate;
    setTestOpen(false);
    await act(
      { action: 'add_entries', entries: [entry] },
      testDate ? `Test pinned to ${fmtShortDow(testDate)}.` : 'Test added. Pin it to a date from its row.',
    );
    setTestLabel('');
    setTestId('');
    setTestDate('');
  };

  const openTaskCreate = () => {
    setTaskEditId(null);
    setTaskTitle('');
    setTaskDesc('');
    setTaskDate(planData.today);
    setTaskTime('');
    setTaskOpen(true);
  };

  const openTaskEdit = (e: Entry) => {
    setActionEntry(null);
    setTaskEditId(e.id);
    setTaskTitle(e.label || '');
    setTaskDesc(e.notes || '');
    setTaskDate(e.planned_date || '');
    setTaskTime(e.task_time || '');
    setTaskOpen(true);
  };

  const doSaveTask = async () => {
    if (!taskTitle.trim() || !taskDate) return;
    setTaskOpen(false);
    const payload = {
      label: taskTitle.trim(),
      notes: taskDesc.trim() || null,
      planned_date: taskDate,
      task_time: taskTime || null,
    };
    if (taskEditId) {
      await act({ action: 'update_task', entry_id: taskEditId, ...payload }, 'Task saved.');
    } else {
      await act(
        { action: 'add_entries', entries: [{ entry_type: 'task', ...payload }] },
        `Task added on ${fmtShortDow(taskDate)}.`,
      );
    }
  };

  const repoPanel = flow && plan && (
    <RepositoryPanel
      entries={plan.entries}
      flow={flow}
      placingTopicId={placing?.kind === 'topic' ? placing.id : null}
      onPickTopic={(t) => {
        setPlacing((p) => (p?.kind === 'topic' && p.id === t.id ? null : { kind: 'topic', id: t.id, title: t.title }));
        setRepoOpen(false);
      }}
      onDragTopicStart={(e, topicId) => {
        e.dataTransfer.setData('text/plain', topicId);
        e.dataTransfer.effectAllowed = 'move';
        dragRef.current = { kind: 'repo', id: topicId };
        setDragging(true);
      }}
      onDragEnd={() => {
        dragRef.current = null;
        setDragging(false);
      }}
    />
  );

  const sheetPaperSx = { borderRadius: '20px 20px 0 0', maxHeight: '85vh', px: 2, pb: 3, pt: 1 };

  const actionItems = actionEntry
    ? [
        {
          icon: <PlayCircleOutlineIcon />,
          label: 'Open Class Day',
          sub: 'Agenda, coverage marking and end-of-class logging',
          onClick: () => {
            const dates = flow?.entryDates.get(actionEntry.id);
            const date = dates?.find((d) => d >= planData.today) || dates?.[0];
            router.push(`/teacher/course-plans/${planId}/class-day${date ? `?date=${date}` : ''}`);
          },
          show: actionEntry.entry_type === 'live_class' && actionEntry.status !== 'skipped',
        },
        {
          icon: <AssignmentOutlinedIcon />,
          label: 'Edit task',
          sub: 'Change the title, details, date or time',
          onClick: () => openTaskEdit(actionEntry),
          show: actionEntry.entry_type === 'task',
        },
        {
          icon: <VideocamOutlinedIcon />,
          label: 'Schedule the class',
          sub: 'Date, time, teacher and Teams meeting',
          onClick: () => openSchedule(actionEntry),
          show:
            actionEntry.entry_type !== 'test' &&
            actionEntry.entry_type !== 'task' &&
            !['done', 'skipped'].includes(actionEntry.status),
        },
        {
          icon: <LowPriorityIcon />,
          label: 'Move in the queue',
          sub: 'Tap a day on the calendar to insert it there',
          onClick: () => {
            setActionEntry(null);
            setPlacing({ kind: 'entry', id: actionEntry.id, title: entryTitle(actionEntry) });
          },
          show:
            !flow?.lockedEntryIds.has(actionEntry.id) &&
            actionEntry.entry_type !== 'test' &&
            actionEntry.entry_type !== 'task',
        },
        {
          icon: <PushPinOutlinedIcon />,
          label: actionEntry.planned_date ? 'Change the date' : 'Set the date',
          sub:
            actionEntry.entry_type === 'test'
              ? 'This test sits on the date you pick; topics flow around it'
              : 'Put this class on a specific date; other classes flow around it',
          onClick: () => {
            setActionEntry(null);
            setPinDate(actionEntry.planned_date || '');
            setPinEntry(actionEntry);
          },
          show:
            !flow?.lockedEntryIds.has(actionEntry.id) &&
            actionEntry.entry_type !== 'self_learning' &&
            actionEntry.entry_type !== 'task' &&
            actionEntry.status !== 'skipped',
        },
        {
          icon: <TuneOutlinedIcon />,
          label: `Sessions: ${entrySpan(actionEntry)}`,
          sub: 'How many class days this topic takes',
          onClick: () => {
            setActionEntry(null);
            setSpanValue(entrySpan(actionEntry));
            setSpanEntry(actionEntry);
          },
          show: actionEntry.entry_type === 'live_class',
        },
        {
          icon: <CheckCircleOutlineIcon />,
          label: 'Mark done',
          sub: 'Topic fully covered',
          onClick: () => {
            setActionEntry(null);
            act({ action: 'set_status', entry_id: actionEntry.id, status: 'done' }, 'Marked done.');
          },
          show: ['planned', 'scheduled'].includes(actionEntry.status) && actionEntry.entry_type !== 'task',
        },
        {
          icon: actionEntry.entry_type === 'self_learning' ? <VideocamOutlinedIcon /> : <MenuBookOutlinedIcon />,
          label: actionEntry.entry_type === 'self_learning' ? 'Convert to live class' : 'Move to self-learning',
          sub:
            actionEntry.entry_type === 'self_learning'
              ? 'Put it back on the calendar'
              : 'Frees its class days and shares the topic with students',
          onClick: () => {
            setActionEntry(null);
            act(
              {
                action: 'convert',
                entry_id: actionEntry.id,
                entry_type: actionEntry.entry_type === 'self_learning' ? 'live_class' : 'self_learning',
                publish: actionEntry.entry_type !== 'self_learning',
              },
              actionEntry.entry_type === 'self_learning'
                ? 'Back on the calendar.'
                : 'Converted to self-learning and shared with students.',
            );
          },
          show:
            actionEntry.entry_type !== 'test' &&
            actionEntry.entry_type !== 'task' &&
            actionEntry.status !== 'skipped',
        },
        {
          icon: <SkipNextOutlinedIcon />,
          label: actionEntry.status === 'skipped' ? 'Restore to the plan' : 'Skip this topic',
          sub:
            actionEntry.status === 'skipped'
              ? 'Puts it back in the queue'
              : 'Frees its class days; stays visible struck through',
          onClick: () => {
            setActionEntry(null);
            act(
              {
                action: 'set_status',
                entry_id: actionEntry.id,
                status: actionEntry.status === 'skipped' ? 'planned' : 'skipped',
              },
              actionEntry.status === 'skipped' ? 'Restored.' : 'Skipped. Later classes moved up.',
            );
          },
          show: actionEntry.entry_type !== 'test' && actionEntry.entry_type !== 'task',
        },
        {
          icon: <OpenInNewOutlinedIcon />,
          label: 'Open in the Repository',
          sub: 'Edit content, resources and class kit',
          onClick: () => actionEntry.topic_id && router.push(`/teacher/curriculum/${actionEntry.topic_id}`),
          show: !!actionEntry.topic_id,
        },
        {
          icon: <DeleteOutlineIcon />,
          label: 'Remove from plan',
          sub: 'The topic stays in the Repository',
          onClick: () => {
            setActionEntry(null);
            act({ action: 'remove_entry', entry_id: actionEntry.id }, 'Removed. Returned to the repository.');
          },
          show: !flow?.lockedEntryIds.has(actionEntry.id),
          danger: true,
        },
      ].filter((a) => a.show)
    : [];

  const ActionSheetBody = actionEntry && (
    <Box>
      <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: alpha('#1A2027', 0.18), mx: 'auto', mt: 1, mb: 1.5, display: { md: 'none' } }} />
      <Typography sx={{ fontWeight: 700, fontSize: '1rem', px: 0.5 }}>{entryTitle(actionEntry)}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
        {ENTRY_STATUS[actionEntry.status]?.label}
        {flow?.entryDates.get(actionEntry.id)?.length
          ? ` · ${fmtShortDow(flow.entryDates.get(actionEntry.id)![0])}`
          : ''}
      </Typography>
      <Stack sx={{ mt: 1 }}>
        {actionItems.map((a) => (
          <Button
            key={a.label}
            onClick={a.onClick}
            sx={{
              justifyContent: 'flex-start',
              textAlign: 'left',
              gap: 1.5,
              px: 1,
              py: 1.25,
              minHeight: 52,
              borderRadius: 2.5,
              color: a.danger ? 'error.main' : 'text.primary',
              '&:hover': { bgcolor: a.danger ? alpha('#C62828', 0.06) : alpha('#7C3AED', 0.05) },
            }}
          >
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                bgcolor: a.danger ? alpha('#C62828', 0.08) : alpha('#7C3AED', 0.08),
                color: a.danger ? 'error.main' : 'primary.dark',
              }}
            >
              {a.icon}
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                {a.sub}
              </Typography>
            </Box>
          </Button>
        ))}
      </Stack>
    </Box>
  );

  return (
    <PlanShell planId={planId} active="builder" planData={planData}>
      {plan && flow && (
        <Box>
          {/* Placing bar */}
          {placing && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1.25,
                mb: 1.5,
                borderRadius: 2.5,
                bgcolor: '#1A2027',
                color: '#fff',
                position: 'sticky',
                top: 8,
                zIndex: 20,
              }}
            >
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
                Placing “{placing.title}”. Tap a day on the calendar to insert it there.
              </Typography>
              <Button
                size="small"
                onClick={() => setPlacing(null)}
                sx={{ color: '#fff', border: '1px solid rgba(255,255,255,0.35)', minHeight: 34, flexShrink: 0 }}
              >
                Cancel
              </Button>
            </Box>
          )}

          {/* Toolbar */}
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
            {isMobile && (
              <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => setRepoOpen(true)} sx={{ minHeight: 40 }}>
                Add from repository
              </Button>
            )}
            <Button variant="outlined" size="small" startIcon={<QuizOutlinedIcon />} onClick={() => setTestOpen(true)} sx={{ minHeight: 40 }}>
              Add test
            </Button>
            <Button variant="outlined" size="small" startIcon={<AssignmentOutlinedIcon />} onClick={openTaskCreate} sx={{ minHeight: 40 }}>
              Add task
            </Button>
            <Button
              variant="text"
              size="small"
              startIcon={<TuneOutlinedIcon />}
              onClick={() => setSettingsOpen(true)}
              sx={{ minHeight: 40, color: 'text.secondary' }}
            >
              Schedule settings
            </Button>
          </Stack>

          <Box sx={{ display: { md: 'grid' }, gridTemplateColumns: { md: '320px 1fr' }, gap: 2.5, alignItems: 'start' }}>
            {!isMobile && (
              <Box sx={{ position: 'sticky', top: 84, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', pr: 0.5 }}>
                {repoPanel}
              </Box>
            )}
            <FlowList
              plan={plan}
              flow={flow}
              today={planData.today}
              placing={placing?.title ?? null}
              onInsertBefore={onInsertBefore}
              onDropBefore={onDropBefore}
              onEntryClick={(e) => setActionEntry(e)}
              onRemove={(e) => act({ action: 'remove_entry', entry_id: e.id }, 'Removed. Returned to the repository.')}
              onSetSpan={(e, span) => act({ action: 'set_span', entry_id: e.id, session_span: span }, 'Classes updated. Dates recalculated.')}
              onDragEntryStart={(e, entryId) => {
                e.dataTransfer.setData('text/plain', entryId);
                e.dataTransfer.effectAllowed = 'move';
                dragRef.current = { kind: 'entry', id: entryId };
                setDragging(true);
              }}
              onDragEnd={() => {
                dragRef.current = null;
                setDragging(false);
              }}
              dragging={dragging}
            />
          </Box>

          {/* Mobile repository drawer */}
          <SwipeableDrawer
            anchor="bottom"
            open={repoOpen}
            onClose={() => setRepoOpen(false)}
            onOpen={() => {}}
            PaperProps={{ sx: { ...sheetPaperSx, maxHeight: '80vh' } }}
          >
            <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: alpha('#1A2027', 0.18), mx: 'auto', mt: 1, mb: 1.5 }} />
            {repoPanel}
          </SwipeableDrawer>

          {/* Entry action sheet */}
          {isMobile ? (
            <SwipeableDrawer anchor="bottom" open={!!actionEntry} onClose={() => setActionEntry(null)} onOpen={() => {}} PaperProps={{ sx: sheetPaperSx }}>
              {ActionSheetBody}
            </SwipeableDrawer>
          ) : (
            <Dialog open={!!actionEntry} onClose={() => setActionEntry(null)} maxWidth="xs" fullWidth>
              <DialogContent>{ActionSheetBody}</DialogContent>
            </Dialog>
          )}

          {/* Add test */}
          <Dialog open={testOpen} onClose={() => setTestOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>Add a test to the plan</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 1 }}>
                <TextField select label="Existing test (optional)" value={testId} onChange={(e) => setTestId(e.target.value)} fullWidth>
                  <MenuItem value="">None, use a label</MenuItem>
                  {(data?.tests || []).map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.title}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Label"
                  value={testLabel}
                  onChange={(e) => setTestLabel(e.target.value)}
                  fullWidth
                  placeholder="e.g. Unit Test 2: Ch 3"
                  helperText="Used when no existing test is linked yet"
                />
                <TextField
                  label="Pinned date"
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="Tests sit on fixed dates; topics flow around them"
                />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setTestOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={doAddTest} disabled={busy || (!testId && !testLabel.trim())}>
                Add test
              </Button>
            </DialogActions>
          </Dialog>

          {/* Set the class date */}
          <Dialog open={!!pinEntry} onClose={() => setPinEntry(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>Set the class date</DialogTitle>
            <DialogContent>
              <Typography variant="caption" color="text.secondary">
                {pinEntry ? entryTitle(pinEntry) : ''}
              </Typography>
              <TextField
                label="Date"
                type="date"
                value={pinDate}
                onChange={(e) => setPinDate(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={{ mt: 1.5 }}
                helperText="Other classes flow around this date. Clear it to go back to auto-flow by position."
              />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setPinEntry(null)}>Cancel</Button>
              {pinEntry?.planned_date && (
                <Button
                  color="inherit"
                  disabled={busy}
                  onClick={async () => {
                    const e = pinEntry;
                    setPinEntry(null);
                    if (e) await act({ action: 'set_entry_date', entry_id: e.id, date: null }, 'Back to auto-flow. Dates recalculated.');
                  }}
                >
                  Back to auto-flow
                </Button>
              )}
              <Button
                variant="contained"
                disabled={busy || !pinDate}
                onClick={async () => {
                  const e = pinEntry;
                  setPinEntry(null);
                  if (e) await act({ action: 'set_entry_date', entry_id: e.id, date: pinDate }, `Set to ${fmtShortDow(pinDate)}. Dates recalculated.`);
                }}
              >
                Set date
              </Button>
            </DialogActions>
          </Dialog>

          {/* Add / edit an info task (no-class day) */}
          <Dialog open={taskOpen} onClose={() => setTaskOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>{taskEditId ? 'Edit task' : 'Add a task'}</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 1 }}>
                <TextField
                  label="Task"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  fullWidth
                  autoFocus
                  placeholder="e.g. Sketch 3 elevations"
                />
                <TextField
                  label="Details for students"
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  fullWidth
                  multiline
                  minRows={2}
                  placeholder="What to do, and how to submit or bring it"
                />
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="Date"
                    type="date"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Time (optional)"
                    type="time"
                    value={taskTime}
                    onChange={(e) => setTaskTime(e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Students see this on their timeline. It sits on the date you pick; classes flow around it.
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setTaskOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={doSaveTask} disabled={busy || !taskTitle.trim() || !taskDate}>
                {taskEditId ? 'Save' : 'Add task'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Session span */}
          <Dialog open={!!spanEntry} onClose={() => setSpanEntry(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>How many class days?</DialogTitle>
            <DialogContent>
              <Typography variant="caption" color="text.secondary">
                {spanEntry ? entryTitle(spanEntry) : ''}. Later classes shift automatically.
              </Typography>
              <TextField
                label="Sessions"
                type="number"
                value={spanValue}
                onChange={(e) => setSpanValue(Math.max(1, Number(e.target.value) || 1))}
                fullWidth
                inputProps={{ min: 1, max: 30 }}
                sx={{ mt: 1.5 }}
              />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setSpanEntry(null)}>Cancel</Button>
              <Button
                variant="contained"
                disabled={busy}
                onClick={async () => {
                  const e = spanEntry;
                  setSpanEntry(null);
                  if (e) await act({ action: 'set_span', entry_id: e.id, session_span: spanValue }, 'Sessions updated. Dates recalculated.');
                }}
              >
                Save
              </Button>
            </DialogActions>
          </Dialog>

          {/* Schedule settings. Class hours live here, not in a separate
              Seasons dialog: this plan already has the dates that bound the
              season, so its hours belong beside them. */}
          <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>Schedule settings</DialogTitle>
            <DialogContent>
              <Stack spacing={2.5} sx={{ mt: 1 }}>
                <ClassHoursEditor
                  bands={(plan as unknown as Record<string, unknown>).class_bands}
                  days={(plan as unknown as Record<string, unknown>).class_days}
                  saving={busy}
                  onSave={(bands, days) =>
                    patch(
                      { class_bands: bands, class_days: days },
                      'Class hours saved. The timetable follows this plan.',
                    )
                  }
                />
                <TextField
                  label="Exam date"
                  type="date"
                  defaultValue={plan.exam_date || ''}
                  onBlur={(e) => e.target.value !== (plan.exam_date || '') && patch({ exam_date: e.target.value || null }, 'Exam date saved.')}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="Drives the buffer shown in the end-date summary"
                />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setSettingsOpen(false)}>Done</Button>
            </DialogActions>
          </Dialog>

          {/* Schedule class (Teams) */}
          <Dialog open={!!scheduleEntry} onClose={() => setScheduleEntry(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>Schedule class</DialogTitle>
            <DialogContent>
              <Typography variant="caption" color="text.secondary">
                {scheduleEntry ? entryTitle(scheduleEntry) : ''}
              </Typography>
              <Stack spacing={2} sx={{ mt: 1.5 }}>
                <Stack direction="row" spacing={1.5}>
                  <TextField label="Date" type="date" value={scDate} onChange={(e) => setScDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
                  <TextField label="Start" type="time" value={scStart} onChange={(e) => setScStart(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
                  <TextField label="End" type="time" value={scEnd} onChange={(e) => setScEnd(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
                </Stack>
                <TextField select label="Teacher" value={scTeacher} onChange={(e) => setScTeacher(e.target.value)} fullWidth>
                  {(data?.teachers || []).map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name || 'Unnamed'}
                    </MenuItem>
                  ))}
                </TextField>
                <FormControlLabel
                  control={<Switch checked={scTeams} onChange={(e) => setScTeams(e.target.checked)} />}
                  label={
                    <Box>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.88rem' }}>Create Teams meeting</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Students get the join link in their timetable
                      </Typography>
                    </Box>
                  }
                />
                {scTeams && (
                  <TextField select label="Meeting type" value={scScope} onChange={(e) => setScScope(e.target.value as typeof scScope)} fullWidth>
                    <MenuItem value="channel_meeting">Channel meeting (posted in the classroom Team)</MenuItem>
                    <MenuItem value="calendar_event">Calendar invite (Outlook invite to every student)</MenuItem>
                    <MenuItem value="link_only">Link only (share it yourself)</MenuItem>
                  </TextField>
                )}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setScheduleEntry(null)}>Cancel</Button>
              <Button variant="contained" onClick={doSchedule} disabled={busy || !scDate || !scStart || !scEnd}>
                Schedule
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
    </PlanShell>
  );
}
