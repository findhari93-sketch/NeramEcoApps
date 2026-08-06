'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import QuestionPickerList from '@/components/question-bank/QuestionPickerList';
import TestBrowser, { type PickableTest } from '@/components/tests/TestBrowser';
import type { NexusQBQuestionListItem } from '@neram/database';
import type { ClassCardData } from './ClassCard';
import type { ClassTestTiming } from './ClassPrepTestSection';

/** A prep test is meant to be short. Beyond this it stops being pre-class work. */
const MAX_PREP_QUESTIONS = 15;
/**
 * A class test is a whole class's worth of questions. Still capped: past this it
 * is a mock, and a mock belongs in the library rather than bolted to one class.
 * Kept in step with CLASS_TEST_MAX_QUESTIONS, which the server enforces.
 */
const MAX_CLASS_TEST_QUESTIONS = 40;

/**
 * Which library tests may gate a class. A content gate belongs to its chapter and
 * a catch-up paper belongs to the class it clears, so neither is offered here.
 */
const REUSABLE_PREP_KINDS = [
  'classroom_assigned',
  'practice_pool',
  'class_prep',
  'weekly',
  'mock',
  'full',
  'chapter',
];

/**
 * The after-class list additionally drops 'class_prep'. Reusing a prep paper here
 * would either hand a student a gated test through the ordinary take engine, or
 * force us to rewrite its kind and so unlock the door of the class it was gating.
 * The server refuses it either way; this keeps it off the menu.
 */
const REUSABLE_CLASS_TEST_KINDS = REUSABLE_PREP_KINDS.filter((k) => k !== 'class_prep');

interface LinkPrepTestDialogProps {
  open: boolean;
  cls: ClassCardData | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (message: string) => void;
  onNotify: (message: string, severity?: 'success' | 'error') => void;
  /** Defaults to 'before', so every existing call site keeps its meaning. */
  timing?: ClassTestTiming;
}

/** YYYY-MM-DD in IST, which is what a date input wants. */
function toDateInput(ms: number): string {
  return new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/**
 * A due DATE becomes the end of that day in IST.
 *
 * A teacher picking "12 Aug" means "by the end of the 12th", not midnight at its
 * start. The +05:30 is load-bearing for the same reason it is everywhere else
 * here: a bare date string is parsed as UTC on Vercel and lands 5.5 hours early.
 */
function dueDateToIso(date: string): string | null {
  if (!date) return null;
  const ms = Date.parse(`${date}T23:59:00+05:30`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Set the test attached to this class, on either side of it.
 *
 * Two ways in, because teachers arrive from two different places: build a paper
 * from the bank now, or reuse one they already made. Modelled on
 * LinkAssignmentDialog, full-screen on mobile because picking questions on a
 * 375px screen inside a floating dialog is unusable.
 */
export default function LinkPrepTestDialog({
  open,
  cls,
  getToken,
  onClose,
  onSaved,
  onNotify,
  timing = 'before',
}: LinkPrepTestDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const after = timing === 'after';
  const endpoint = after ? 'class-test' : 'prep-test';
  const maxQuestions = after ? MAX_CLASS_TEST_QUESTIONS : MAX_PREP_QUESTIONS;

  const [tab, setTab] = useState<'build' | 'reuse'>('build');
  const [selected, setSelected] = useState<Map<string, NexusQBQuestionListItem>>(new Map());
  const [reusePick, setReusePick] = useState<PickableTest | null>(null);
  const [passingPct, setPassingPct] = useState(after ? 60 : 70);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [required, setRequired] = useState(true);
  const [busy, setBusy] = useState(false);

  // The class topic is the best search seed we have. There is no join from a
  // class topic to a bank topic: nexus_qb_questions.topic_id points at
  // nexus_qb_topics, a separate hierarchy with no mapping to nexus_course_topics.
  const topicSeed = useMemo(() => {
    const c = cls as any;
    return c?.course_topic?.title || c?.topic?.title || '';
  }, [cls]);

  useEffect(() => {
    if (!open || !cls?.id) return;
    setTab('build');
    setSelected(new Map());
    setReusePick(null);
    setPassingPct(after ? 60 : 70);
    setRequired(true);
    setDueDate('');
    setTitle(after ? `${cls.title || 'Class'}: test` : `${cls.title || 'Class'}: before you join`);

    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`/api/timetable/${cls.id}/${endpoint}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const d = await res.json();
        if (d.default_passing_pct) setPassingPct(d.default_passing_pct);
        // Seed the deadline from the class the server knows about rather than
        // from today, so a test set weeks later still reads as "three days after
        // the class" the way the empty state promises.
        if (after) {
          const existing = d.class_test;
          if (existing?.due_at) {
            setDueDate(toDateInput(Date.parse(existing.due_at)));
          } else {
            const startMs = d.class_start ? Date.parse(d.class_start) : Date.now();
            const days = Number(d.default_due_days) || 3;
            setDueDate(toDateInput((Number.isFinite(startMs) ? startMs : Date.now()) + days * 86_400_000));
          }
          if (existing) {
            setRequired(existing.required !== false);
            if (existing.passing_pct) setPassingPct(existing.passing_pct);
          }
        }
      } catch {
        // Only the defaults come from here; the browser loads its own list.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cls?.id, cls?.title, getToken, after, endpoint]);

  // The library reports a real question count. The old reuse list used
  // total_marks as a stand-in, which silently lied about "5 of 6" whenever a
  // question was worth more than one mark.
  const questionCount = tab === 'build' ? selected.size : (reusePick?.question_count ?? 0);
  const mustGetRight = questionCount > 0 ? Math.ceil((passingPct / 100) * questionCount) : 0;
  const canSave = tab === 'build' ? selected.size > 0 : !!reusePick;

  const save = async () => {
    if (!cls?.id || !canSave) return;
    setBusy(true);
    try {
      const token = await getToken();
      const extras = after ? { due_at: dueDateToIso(dueDate), required } : {};
      const res = await fetch(`/api/timetable/${cls.id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          tab === 'build'
            ? { question_ids: [...selected.keys()], title: title.trim(), passing_pct: passingPct, ...extras }
            : { test_id: reusePick?.id, passing_pct: passingPct, ...extras },
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify(d.error || 'Could not set the test', 'error');
        return;
      }
      onSaved(after ? 'Test set for this class' : 'Prep test set for this class');
      onClose();
    } catch {
      onNotify('Could not set the test', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.0625rem' }}>
          {after ? 'Test for this class' : 'Test before this class'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {cls?.title || 'Class'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2, minHeight: 48 }}>
          <Tab value="build" label="Pick questions" sx={{ textTransform: 'none', minHeight: 48 }} />
          <Tab value="reuse" label="Reuse a test" sx={{ textTransform: 'none', minHeight: 48 }} />
        </Tabs>

        {tab === 'build' ? (
          <>
            <TextField
              fullWidth
              size="small"
              label="Test name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              inputProps={{ style: { fontSize: 16 } }}
              sx={{ mb: 2, '& .MuiInputBase-root': { minHeight: 48 } }}
            />
            <QuestionPickerList
              getToken={getToken}
              selected={selected}
              onChange={setSelected}
              // The grader can only mark these two, and a paper with a pass mark
              // must never contain a question that needs a human.
              formats={['MCQ', 'NUMERICAL']}
              initialSearch={topicSeed}
              maxSelected={maxQuestions}
            />
          </>
        ) : (
          // Browses the same folder tree as the Tests library, so a paper filed
          // under "Foundation > History of Architecture" is found the same way
          // here as it is there.
          <TestBrowser
            getToken={getToken}
            value={reusePick}
            onChange={setReusePick}
            kinds={after ? REUSABLE_CLASS_TEST_KINDS : REUSABLE_PREP_KINDS}
            resetToken={open ? cls?.id : null}
            maxListHeight={280}
          />
        )}

        {/* When it is due, and whether it is a rule or a suggestion. Only the
            after-class test has either: a prep test's deadline is the class
            start, and it is always required or it is not a gate. */}
        {after && (
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Due by"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              helperText="Late is late, not locked. Students can still finish it afterwards."
              inputProps={{ style: { fontSize: 16 } }}
              sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
            />

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>
                Does everyone have to do it?
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={required ? 'required' : 'optional'}
                onChange={(_e, v) => {
                  // Null arrives when the active button is tapped again. Ignored,
                  // because "neither" is not one of the two answers.
                  if (v) setRequired(v === 'required');
                }}
                sx={{ '& .MuiToggleButton-root': { minHeight: 44, textTransform: 'none' } }}
              >
                <ToggleButton value="required">Required</ToggleButton>
                <ToggleButton value="optional">Optional</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                {required
                  ? 'Reminders go out, and anyone who missed the class has to pass it to clear their catch-up.'
                  : 'Offered, never chased. It blocks nothing.'}
              </Typography>
            </Box>
          </Box>
        )}

        {/* The pass mark, stated twice. Teachers set 80% meaning "most of it" and
            accidentally set "near perfect": on six questions that is 5 of 6. */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
            Pass mark
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Slider
              value={passingPct}
              onChange={(_e, v) => setPassingPct(v as number)}
              min={10}
              max={100}
              step={5}
              marks={[{ value: 50 }, { value: 70 }, { value: 90 }]}
              valueLabelDisplay="auto"
              sx={{ flex: 1 }}
              aria-label="Pass mark percentage"
            />
            <Typography sx={{ fontWeight: 800, minWidth: 52, textAlign: 'right' }}>{passingPct}%</Typography>
          </Box>
          {questionCount > 0 && (
            <Alert
              severity={questionCount < 8 ? 'warning' : 'info'}
              sx={{ mt: 1, py: 0.25 }}
              icon={false}
            >
              <Typography variant="caption">
                {questionCount} question{questionCount === 1 ? '' : 's'}, so a pass means getting{' '}
                <strong>
                  {mustGetRight} of {questionCount}
                </strong>{' '}
                right.
              </Typography>
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={!canSave || busy}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          {busy ? <CircularProgress size={18} /> : 'Set the test'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
