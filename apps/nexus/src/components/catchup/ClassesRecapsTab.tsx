'use client';

/**
 * Every recent class, what it still owes, and the button that fixes it.
 *
 * This tab is a merge of three screens that were each telling a teacher half the
 * story:
 *   - the old Classes tab      how many people missed a class and cleared it
 *   - the old "Cannot be caught up" tab   which classes have no recording or no
 *                              published recap, and how many students that blocks
 *   - the whole /teacher/class-recaps page   the same classes again, with a
 *                              Create recap button and no idea who was waiting
 *
 * They are one question ("what do I owe my students, and what do I press"), so
 * they are now one row. The recap editor itself is untouched and still lives at
 * /teacher/class-recaps/[recapId].
 *
 * Classes with full attendance are listed too. A class nobody missed can still
 * owe a recap, and finding that out should not require a second screen.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { RADIUS } from '@/components/timetable/timetable-theme';
import { SECTION_HEADING_SX, shortDate } from './shared';
import type { ClassStat, RecapState, TabProps } from './types';
import RecapReviewQueue from '@/components/class-recap/RecapReviewQueue';

type Filter = 'all' | 'blocking' | 'needs_recap';

const RECAP_LABEL: Record<RecapState, string> = {
  no_recording: 'No recording',
  recording_ready: 'Recap not made',
  draft: 'Draft recap',
  published: 'Recap published',
};

function recapTone(state: RecapState): 'error' | 'warning' | 'info' | 'success' {
  if (state === 'published') return 'success';
  if (state === 'draft') return 'info';
  if (state === 'recording_ready') return 'warning';
  return 'error';
}

export default function ClassesRecapsTab({ data, onReload }: TabProps) {
  const theme = useTheme();
  const router = useRouter();
  const { getTeacherToken } = useNexusAuthContext();

  const [filter, setFilter] = useState<Filter>('all');
  const [busyClass, setBusyClass] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [creatingManual, setCreatingManual] = useState(false);

  const teacherFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getTeacherToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Request failed');
      return payload;
    },
    [getTeacherToken],
  );

  const blockingCount = useMemo(
    () => data.classStats.filter((c) => c.blocked > 0).length,
    [data.classStats],
  );
  const needsRecapCount = useMemo(
    () => data.classStats.filter((c) => c.recap_state === 'recording_ready' || c.recap_state === 'draft').length,
    [data.classStats],
  );

  const rows = useMemo(() => {
    if (filter === 'blocking') return data.classStats.filter((c) => c.blocked > 0);
    if (filter === 'needs_recap') {
      return data.classStats.filter(
        (c) => c.recap_state === 'recording_ready' || c.recap_state === 'draft',
      );
    }
    return data.classStats;
  }, [data.classStats, filter]);

  /** Open the recap for a class, creating the draft first if there is not one. */
  const openRecap = useCallback(
    async (c: ClassStat) => {
      if (c.recap_id) {
        router.push(`/teacher/class-recaps/${c.recap_id}`);
        return;
      }
      setBusyClass(c.id);
      setError(null);
      try {
        const body = await teacherFetch('/api/class-recaps', {
          method: 'POST',
          body: JSON.stringify({ scheduled_class_id: c.id }),
        });
        if (body?.recap?.id) router.push(`/teacher/class-recaps/${body.recap.id}`);
        else onReload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create the recap');
      } finally {
        setBusyClass(null);
      }
    },
    [router, teacherFetch, onReload],
  );

  const createManual = useCallback(async () => {
    if (!manualTitle.trim() || !manualUrl.trim() || !data.classroomId) return;
    setCreatingManual(true);
    setError(null);
    try {
      const body = await teacherFetch('/api/class-recaps', {
        method: 'POST',
        body: JSON.stringify({
          title: manualTitle.trim(),
          classroom_id: data.classroomId,
          recording_url: manualUrl.trim(),
        }),
      });
      setManualOpen(false);
      setManualTitle('');
      setManualUrl('');
      if (body?.recap?.id) router.push(`/teacher/class-recaps/${body.recap.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the recap');
    } finally {
      setCreatingManual(false);
    }
  }, [manualTitle, manualUrl, data.classroomId, teacherFetch, router]);

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Recaps that generated automatically but did not clear the quality
          checks, so students cannot open them yet. Sits above the class list
          because it is the only part of this screen with something owed: every
          row is a class somebody cannot catch up on until a teacher looks.
          Renders nothing when the queue is empty. */}
      <RecapReviewQueue compact />

      <Stack
        direction="row"
        spacing={0.75}
        sx={{ mb: 2, flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}
      >
        <Chip
          label={`All ${data.classStats.length}`}
          onClick={() => setFilter('all')}
          color={filter === 'all' ? 'primary' : 'default'}
          variant={filter === 'all' ? 'filled' : 'outlined'}
          sx={{ fontWeight: 700, height: 34 }}
        />
        {blockingCount > 0 && (
          <Chip
            label={`Blocking students ${blockingCount}`}
            onClick={() => setFilter(filter === 'blocking' ? 'all' : 'blocking')}
            color={filter === 'blocking' ? 'error' : 'default'}
            variant={filter === 'blocking' ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, height: 34 }}
          />
        )}
        {needsRecapCount > 0 && (
          <Chip
            label={`Needs a recap ${needsRecapCount}`}
            onClick={() => setFilter(filter === 'needs_recap' ? 'all' : 'needs_recap')}
            color={filter === 'needs_recap' ? 'warning' : 'default'}
            variant={filter === 'needs_recap' ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, height: 34 }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setManualOpen(true)}
          disabled={!data.classroomId}
          sx={{ minHeight: 40, textTransform: 'none' }}
        >
          Recap from a link
        </Button>
      </Stack>

      {rows.length === 0 ? (
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          Nothing outstanding. Every recent class has what a student needs to catch up on it.
        </Alert>
      ) : (
        <Stack spacing={1}>
          {rows.map((c) => {
            const total = c.present + c.missed;
            const clearedPct = total > 0 ? ((c.present + c.caughtUp) / total) * 100 : 0;
            const outstandingPct = total > 0 ? (c.outstanding / total) * 100 : 0;
            const tone = recapTone(c.recap_state);
            return (
              <Box
                key={c.id}
                sx={{
                  p: 1.75,
                  borderRadius: RADIUS.card,
                  border: '1px solid',
                  borderColor:
                    c.blocked > 0 && c.recap_state !== 'no_recording'
                      ? alpha(theme.palette.error.main, 0.4)
                      : 'divider',
                  bgcolor:
                    c.blocked > 0 && c.recap_state !== 'no_recording'
                      ? alpha(theme.palette.error.main, 0.04)
                      : 'background.paper',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 160 }}>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {shortDate(c.scheduled_date)}
                    </Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
                      {c.title || 'Class'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.present} present · {c.missed} missed · {c.caughtUp} caught up
                    </Typography>
                  </Box>
                  <Stack spacing={0.75} alignItems="flex-end">
                    <Chip
                      size="small"
                      color={tone}
                      label={RECAP_LABEL[c.recap_state]}
                      icon={
                        c.recap_state === 'no_recording' ? (
                          <VideocamOffOutlinedIcon sx={{ fontSize: 15 }} />
                        ) : undefined
                      }
                      sx={{ fontWeight: 700 }}
                    />
                    {c.outstanding > 0 && (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={`${c.outstanding} outstanding`}
                        sx={{ fontWeight: 700 }}
                      />
                    )}
                  </Stack>
                </Stack>

                {total > 0 && (
                  <Box
                    sx={{
                      display: 'flex',
                      height: 8,
                      borderRadius: 99,
                      overflow: 'hidden',
                      bgcolor: alpha(theme.palette.text.disabled, 0.12),
                      mt: 1.25,
                    }}
                  >
                    <Box sx={{ width: `${clearedPct}%`, bgcolor: 'success.main' }} />
                    <Box sx={{ width: `${outstandingPct}%`, bgcolor: 'error.main' }} />
                  </Box>
                )}

                {/* The fact the old Class Recaps page could never show: this
                    missing recap is not admin, it is N people who cannot start. */}
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1.25, flexWrap: 'wrap', gap: 1 }}
                >
                  {/* Red only when we could fix it today. A class with no
                      recording at all is a content gap that counts against
                      nobody, and dressing it up as an urgent failure would put
                      an alarm next to the one thing on this screen a teacher
                      cannot act on. */}
                  {c.blocked > 0 && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: c.recap_state === 'no_recording' ? 'text.secondary' : 'error.main',
                        fontWeight: 700,
                      }}
                    >
                      {c.blocked === 1
                        ? '1 student is waiting on this'
                        : `${c.blocked} students are waiting on this`}
                    </Typography>
                  )}
                  <Box sx={{ flex: 1 }} />
                  {c.recap_state === 'no_recording' ? (
                    <Typography variant="caption" color="text.disabled">
                      Nothing to watch yet
                    </Typography>
                  ) : (
                    <Button
                      size="small"
                      variant={c.recap_state === 'published' ? 'outlined' : 'contained'}
                      disabled={busyClass === c.id}
                      onClick={() => openRecap(c)}
                      sx={{ minHeight: 40, textTransform: 'none' }}
                    >
                      {c.recap_state === 'published'
                        ? 'Edit recap'
                        : c.recap_state === 'draft'
                          ? 'Continue draft'
                          : 'Create recap'}
                    </Button>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      {data.noRecording.length > 0 && filter === 'all' && (
        <Box sx={{ mt: 3.5 }}>
          <Typography sx={SECTION_HEADING_SX}>Counts for nobody</Typography>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            {data.noRecording.length === 1
              ? '1 class has no recording at all, so it holds nobody back and counts against nobody.'
              : `${data.noRecording.length} classes have no recording at all, so they hold nobody back and count against nobody.`}{' '}
            Add a recording and every affected student gets the class back on their list on its own.
          </Alert>
        </Box>
      )}

      <Dialog open={manualOpen} onClose={() => setManualOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>Recap from a recording link</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            For a class that was scheduled straight in Teams and has no row in the timetable. Paste
            the recording link and we will build the recap around it.
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Class title"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              fullWidth
              autoFocus
              inputProps={{ style: { fontSize: 16 } }}
            />
            <TextField
              label="Recording link"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              fullWidth
              placeholder="https://..."
              inputProps={{ style: { fontSize: 16 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setManualOpen(false)} sx={{ minHeight: 44, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={creatingManual || !manualTitle.trim() || !manualUrl.trim()}
            onClick={createManual}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {creatingManual ? 'Creating...' : 'Create recap'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
