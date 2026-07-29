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
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import QuestionPickerList from '@/components/question-bank/QuestionPickerList';
import type { NexusQBQuestionListItem } from '@neram/database';
import type { ClassCardData } from './ClassCard';

/** A prep test is meant to be short. Beyond this it stops being pre-class work. */
const MAX_QUESTIONS = 15;

interface LinkableTest {
  id: string;
  title: string;
  total_marks: number | null;
}

interface LinkPrepTestDialogProps {
  open: boolean;
  cls: ClassCardData | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (message: string) => void;
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

/**
 * Set the short test a student must pass before this class.
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
}: LinkPrepTestDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [tab, setTab] = useState<'build' | 'reuse'>('build');
  const [selected, setSelected] = useState<Map<string, NexusQBQuestionListItem>>(new Map());
  const [linkable, setLinkable] = useState<LinkableTest[]>([]);
  const [reuseId, setReuseId] = useState<string | null>(null);
  const [passingPct, setPassingPct] = useState(70);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
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
    setReuseId(null);
    setPassingPct(70);
    setTitle(`${cls.title || 'Class'}: before you join`);

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`/api/timetable/${cls.id}/prep-test`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) {
          const d = await res.json();
          setLinkable(d.linkable || []);
          if (d.default_passing_pct) setPassingPct(d.default_passing_pct);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cls?.id, cls?.title, getToken]);

  const questionCount = tab === 'build' ? selected.size : (linkable.find((t) => t.id === reuseId)?.total_marks ?? 0);
  const mustGetRight = questionCount > 0 ? Math.ceil((passingPct / 100) * questionCount) : 0;
  const canSave = tab === 'build' ? selected.size > 0 : !!reuseId;

  const save = async () => {
    if (!cls?.id || !canSave) return;
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${cls.id}/prep-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          tab === 'build'
            ? { question_ids: [...selected.keys()], title: title.trim(), passing_pct: passingPct }
            : { test_id: reuseId, passing_pct: passingPct },
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify(d.error || 'Could not set the prep test', 'error');
        return;
      }
      onSaved('Prep test set for this class');
      onClose();
    } catch {
      onNotify('Could not set the prep test', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.0625rem' }}>Test before this class</Typography>
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
              // The grader can only mark these two, and a prep test must never
              // contain a question that needs a human before the class starts.
              formats={['MCQ', 'NUMERICAL']}
              initialSearch={topicSeed}
              maxSelected={MAX_QUESTIONS}
            />
          </>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : linkable.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            You have not built any reusable tests yet. Pick questions instead.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {linkable.map((t) => (
              <Box
                key={t.id}
                onClick={() => setReuseId(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setReuseId(t.id);
                  }
                }}
                sx={{
                  p: 1.5,
                  minHeight: 48,
                  cursor: 'pointer',
                  borderRadius: 1.5,
                  border: `1px solid ${reuseId === t.id ? theme.palette.primary.main : theme.palette.divider}`,
                  bgcolor: reuseId === t.id ? 'action.hover' : 'transparent',
                }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: '0.8438rem' }}>{t.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t.total_marks ?? 0} question{t.total_marks === 1 ? '' : 's'}
                </Typography>
              </Box>
            ))}
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
