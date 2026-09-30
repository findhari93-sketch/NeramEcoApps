'use client';

/**
 * Levels: sort a whole class by drawing level, one student at a time.
 *
 * A manager can only judge drawing ability by looking across a student's
 * sketches, and opening 40 sketchbooks one by one is what nobody has time for.
 * So this screen puts one student's last six drawings side by side with three
 * big buttons, and moves to the next student as soon as one is pressed. The
 * whole class loads in one request, so moving is instant.
 *
 * Students not rated yet come first (see lib/level-queue.ts). Undo puts the old
 * level back and returns to that student. Keys: 1 Top, 2 Mid, 3 Needs practice,
 * arrows to move.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
  EmptyState,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useSetDrawingLevel } from '@/lib/student-level-client';
import { LEVEL_KEYS, LEVEL_LABEL, LEVEL_MEANING, countLevels, type LevelKey } from '@/lib/student-level';
import { sortedCount } from '@/lib/level-queue';
import type { LevelQueuePayload, LevelQueueStudent, RecentDrawing } from '@/lib/student-level-types';
import { LevelBars } from '@/components/students/LevelMark';
import StudentAvatar from '@/components/students/StudentAvatar';

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const day = (iso: string) => dateFmt.format(new Date(iso));

export default function DrawingLevelSort({ classroomId }: { classroomId: string }) {
  const { data, error, isLoading, mutate } = useAuthSWR<LevelQueuePayload>(
    `/api/drawing-levels/queue?classroom=${classroomId}`,
    { revalidateOnFocus: false },
  );
  const setLevel = useSetDrawingLevel();

  // The order is frozen once loaded, so a level change cannot reshuffle the
  // list under the manager's thumb. Levels are updated in place.
  const [students, setStudents] = useState<LevelQueueStudent[] | null>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<RecentDrawing | null>(null);
  const [toast, setToast] = useState<
    { message: string; undo?: { studentId: string; index: number; previous: LevelKey | null } ; error?: boolean } | null
  >(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && students === null) setStudents(data.students);
  }, [data, students]);

  const current = students?.[index] ?? null;
  const total = students?.length ?? 0;
  const done = students ? sortedCount(students) : 0;
  const finished = !!students && total > 0 && index >= total;

  const patchLocal = (studentId: string, level: LevelKey | null) =>
    setStudents((list) => list?.map((s) => (s.id === studentId ? { ...s, level } : s)) ?? list);

  const choose = useCallback(
    async (level: LevelKey) => {
      if (!current || saving) return;
      const previous = current.level;
      const at = index;
      const first = current.name?.split(' ')[0] || 'Student';
      if (level !== previous) {
        setSaving(true);
        patchLocal(current.id, level);
        try {
          await setLevel(current.id, level, 'sort', previous);
          setToast({ message: `${first}: ${LEVEL_LABEL[level]}`, undo: { studentId: current.id, index: at, previous } });
        } catch (err) {
          patchLocal(current.id, previous);
          setToast({ message: err instanceof Error ? err.message : 'Could not save the level', error: true });
          setSaving(false);
          return;
        }
        setSaving(false);
      }
      setIndex(at + 1);
    },
    [current, index, saving, setLevel],
  );

  const undo = async () => {
    const u = toast?.undo;
    setToast(null);
    if (!u || !students) return;
    const now = students.find((s) => s.id === u.studentId)?.level ?? null;
    patchLocal(u.studentId, u.previous);
    setIndex(u.index);
    try {
      await setLevel(u.studentId, u.previous, 'sort', now);
    } catch (err) {
      patchLocal(u.studentId, now);
      setToast({ message: err instanceof Error ? err.message : 'Could not undo', error: true });
    }
  };

  // Keyboard: 1/2/3 choose, arrows move. Ignored while typing or zoomed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (zoom || target?.closest('input, textarea, [contenteditable="true"], [role="menu"]')) return;
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        e.preventDefault();
        void choose(LEVEL_KEYS[Number(e.key) - 1]);
      } else if (e.key === 'ArrowRight') {
        setIndex((i) => Math.min(i + 1, total));
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose, total, zoom]);

  const counts = useMemo(() => countLevels((students ?? []).map((s) => s.level)), [students]);

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={() => mutate()} sx={{ minHeight: 44 }}>
            Retry
          </Button>
        }
      >
        {error.message || 'Could not load the students to sort.'}
      </Alert>
    );
  }

  if (isLoading || !students) {
    return (
      <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider' }} aria-busy>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Skeleton variant="circular" width={56} height={56} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" />
            <Skeleton width="30%" />
          </Box>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mt: 2 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="rounded" sx={{ aspectRatio: '1', height: 'auto' }} />
          ))}
        </Box>
        <Stack spacing={1} sx={{ mt: 2 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={56} />
          ))}
        </Stack>
      </Paper>
    );
  }

  if (total === 0) {
    return <EmptyState title="No students to sort" description="This classroom has no active students yet." />;
  }

  if (finished) {
    return (
      <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: 1, borderColor: 'divider', textAlign: 'center' }}>
        <DoneAllOutlinedIcon color="primary" sx={{ fontSize: 40 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>
          {done === total ? 'Everyone is sorted' : `You have been through everyone. ${done} of ${total} sorted.`}
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
          {LEVEL_KEYS.map((k) => (
            <Stack key={k} direction="row" spacing={0.75} alignItems="center" sx={{ px: 1.5, py: 1, borderRadius: 999, bgcolor: 'action.hover' }}>
              <Box sx={{ color: 'primary.main', display: 'inline-flex' }}>
                <LevelBars level={k} size={18} />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                {LEVEL_LABEL[k]} {counts[k]}
              </Typography>
            </Stack>
          ))}
          {counts.unrated > 0 && (
            <Typography sx={{ fontSize: 14, color: 'text.secondary', alignSelf: 'center' }}>
              Not rated {counts.unrated}
            </Typography>
          )}
        </Stack>
        <Button variant="outlined" onClick={() => setIndex(0)} sx={{ mt: 3, minHeight: 48 }}>
          Go through again
        </Button>
      </Paper>
    );
  }

  const s = current as LevelQueueStudent;

  return (
    <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', overflow: 'clip' }} data-testid="level-sort">
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 2, pb: 1.5 }}>
        <StudentAvatar userId={s.id} name={s.name} size={48} snapshot={false} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 17, lineHeight: 1.25 }} noWrap>
            {s.name || 'Student'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {s.drawings.length > 0
              ? `${s.drawings.length === 6 ? 'Last 6' : s.drawings.length} drawing${s.drawings.length === 1 ? '' : 's'}, ${data?.sinceDays ?? 90} days`
              : `No drawings in ${data?.sinceDays ?? 90} days`}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" aria-live="polite" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          Student {index + 1} of {total}
        </Typography>
      </Stack>

      <Box sx={{ px: 2 }}>
        <LinearProgress
          variant="determinate"
          value={(done / total) * 100}
          aria-label={`${done} of ${total} sorted`}
          sx={{ height: 6, borderRadius: 3 }}
        />
        <Typography variant="caption" color="text.secondary">
          {done} of {total} sorted
        </Typography>
      </Box>

      {s.drawings.length > 0 ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' }, gap: 1, p: 2 }}>
          {s.drawings.map((d) => (
            <Box
              key={d.id}
              component="button"
              type="button"
              onClick={() => setZoom(d)}
              aria-label={`Enlarge drawing from ${day(d.submittedAt)}`}
              sx={{
                appearance: 'none',
                border: 0,
                p: 0,
                cursor: 'zoom-in',
                bgcolor: 'transparent',
                textAlign: 'left',
                '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: 1.5 },
              }}
            >
              <Box
                component="img"
                src={d.thumbUrl}
                alt=""
                loading="lazy"
                sx={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 1.5, display: 'block', bgcolor: 'action.hover' }}
              />
              <Typography variant="caption" color="text.secondary">
                {day(d.submittedAt)}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ p: 2 }}>
          Nothing to look at yet. Skip for now, or set a level from what you know.
        </Typography>
      )}

      <Stack spacing={1} sx={{ px: 2 }} role="group" aria-label="Drawing level">
        {LEVEL_KEYS.map((k, i) => {
          const selected = s.level === k;
          return (
            <Button
              key={k}
              onClick={() => choose(k)}
              disabled={saving}
              variant={selected ? 'contained' : 'outlined'}
              aria-pressed={selected}
              aria-keyshortcuts={String(i + 1)}
              data-testid={`level-choose-${k}`}
              sx={{ minHeight: 56, justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, px: 2, textTransform: 'none' }}
            >
              <LevelBars level={k} size={24} />
              <Box sx={{ minWidth: 0 }}>
                <Typography component="span" sx={{ display: 'block', fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>
                  {LEVEL_LABEL[k]}
                </Typography>
                <Typography component="span" sx={{ display: 'block', fontSize: 12, opacity: 0.85, lineHeight: 1.35 }}>
                  {LEVEL_MEANING[k]}
                </Typography>
              </Box>
            </Button>
          );
        })}
      </Stack>

      <Stack direction="row" justifyContent="space-between" sx={{ p: 1, pt: 1.5 }}>
        <Button
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          startIcon={<ChevronLeftRoundedIcon />}
          sx={{ minHeight: 48 }}
        >
          Previous
        </Button>
        <Button onClick={() => setIndex((i) => i + 1)} endIcon={<ChevronRightRoundedIcon />} sx={{ minHeight: 48 }}>
          {s.level ? 'Next' : 'Skip for now'}
        </Button>
      </Stack>

      <Dialog open={!!zoom} onClose={() => setZoom(null)} fullScreen={false} maxWidth="md" fullWidth aria-label="Drawing">
        {zoom && (
          <Box sx={{ position: 'relative', bgcolor: 'common.black' }}>
            <IconButton
              onClick={() => setZoom(null)}
              aria-label="Close"
              sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48, bgcolor: 'rgba(0,0,0,0.5)', color: 'common.white', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
            >
              <CloseIcon />
            </IconButton>
            <Box component="img" src={zoom.imageUrl} alt={`Drawing from ${day(zoom.submittedAt)}`} sx={{ display: 'block', width: '100%', maxHeight: '85vh', objectFit: 'contain' }} />
          </Box>
        )}
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.error ? 6000 : 4000}
        onClose={(_, reason) => reason !== 'clickaway' && setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 88, md: 24 } }}
      >
        {toast ? (
          <Alert
            severity={toast.error ? 'error' : 'success'}
            variant="filled"
            action={
              toast.undo ? (
                <Button color="inherit" size="small" onClick={undo} sx={{ minHeight: 36 }}>
                  Undo
                </Button>
              ) : undefined
            }
            sx={{ width: '100%' }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Paper>
  );
}
