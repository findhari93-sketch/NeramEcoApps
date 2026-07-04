'use client';

/**
 * Class Day: run today's class from one screen. Left: the class card (topic,
 * time, Join meeting) with "End class & log coverage" and carry-over. Right:
 * the tap-to-mark agenda seeded from the topic's authored activities/drills.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Stack,
  Chip,
  Button,
  Skeleton,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  alpha,
} from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RedoIcon from '@mui/icons-material/Redo';
import PlanShell from '@/components/course-plan/PlanShell';
import { usePlanData } from '@/components/course-plan/usePlanData';
import AgendaList from '@/components/course-plan/AgendaList';
import {
  entryTitle,
  entrySpan,
  fmtShortDow,
  fmtTime,
  PRIORITY_DISPLAY,
  TEST_COLOR,
  type ClassDayPayload,
} from '@/components/course-plan/common';
import type { NexusPlanDayItem, NexusPlanDayItemStatus } from '@neram/database';

function ClassDayInner() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const planData = usePlanData(planId);
  const { plan, flow, today, authFetch, setSnack } = planData;

  const date = search.get('date') || today;
  const [payload, setPayload] = useState<ClassDayPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [ended, setEnded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/teaching-plans/${planId}/class-day?date=${date}`);
      setPayload(res as ClassDayPayload);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load class day', sev: 'error' });
    }
  }, [authFetch, planId, date, setSnack]);

  useEffect(() => {
    setEnded(false);
    load();
  }, [load]);

  // Prev/next class days that carry an entry.
  const nav = useMemo(() => {
    const dates = (flow?.days ?? []).filter((d) => d.entryId).map((d) => d.date);
    const uniq = [...new Set(dates)];
    const idx = uniq.indexOf(date);
    return {
      prev: idx > 0 ? uniq[idx - 1] : uniq.filter((d) => d < date).pop() ?? null,
      next: idx >= 0 && idx < uniq.length - 1 ? uniq[idx + 1] : uniq.find((d) => d > date) ?? null,
    };
  }, [flow, date]);

  const post = async (body: Record<string, unknown>, msg?: string) => {
    setBusy(true);
    try {
      await authFetch(`/api/teaching-plans/${planId}/class-day`, { method: 'POST', body: JSON.stringify(body) });
      if (msg) setSnack({ msg, sev: 'success' });
      await Promise.all([load(), planData.load()]);
      return true;
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to save', sev: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setItemStatus = async (item: NexusPlanDayItem, status: NexusPlanDayItemStatus) => {
    // Optimistic flip, then confirm.
    setPayload((p) => p && { ...p, items: p.items.map((i) => (i.id === item.id ? { ...i, status } : i)) });
    try {
      await authFetch(`/api/teaching-plans/${planId}/class-day`, {
        method: 'POST',
        body: JSON.stringify({ action: 'set_item_status', item_id: item.id, status }),
      });
    } catch {
      await load();
    }
  };

  const entry = payload?.entry ?? null;
  const day = payload?.day ?? null;
  const cls = entry?.classes?.find((c) => c.scheduled_date === date) || entry?.classes?.[0];
  const pendingCount = (payload?.items ?? []).filter((i) => i.status === 'pending' || i.status === 'partial').length;
  const span = entry ? entrySpan(entry) : 1;
  const isToday = date === today;

  return (
    <PlanShell planId={planId} active="classday" planData={planData}>
      <Box>
        {/* Date nav */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <IconButton
            disabled={!nav.prev}
            onClick={() => nav.prev && router.push(`/teacher/course-plans/${planId}/class-day?date=${nav.prev}`)}
            sx={{ width: 40, height: 40, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
          >
            <ChevronLeftIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', color: isToday ? 'primary.dark' : 'text.secondary', textTransform: 'uppercase' }}>
            {isToday ? 'Today · ' : ''}
            {fmtShortDow(date)}
            {payload ? ` · Class ${payload.class_day_index} of ${payload.total_class_days}` : ''}
          </Typography>
          <IconButton
            disabled={!nav.next}
            onClick={() => nav.next && router.push(`/teacher/course-plans/${planId}/class-day?date=${nav.next}`)}
            sx={{ width: 40, height: 40, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
          >
            <ChevronRightIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>

        {!payload ? (
          <Stack spacing={1.5}>
            <Skeleton variant="rounded" height={160} sx={{ borderRadius: 3 }} />
            <Skeleton variant="rounded" height={220} sx={{ borderRadius: 3 }} />
          </Stack>
        ) : !entry ? (
          <Box sx={{ textAlign: 'center', py: 5, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="body2" color="text.disabled">
              No class planned on this day.
            </Typography>
            <Button variant="outlined" size="small" onClick={() => router.push(`/teacher/course-plans/${planId}`)} sx={{ mt: 1.5, minHeight: 40 }}>
              Open the Builder
            </Button>
          </Box>
        ) : day?.isTest ? (
          <Box sx={{ p: 3, borderRadius: 3, bgcolor: alpha(TEST_COLOR, 0.05), border: `1px dashed ${alpha(TEST_COLOR, 0.4)}`, maxWidth: 560 }}>
            <Typography sx={{ fontWeight: 800, color: TEST_COLOR }}>◈ {entryTitle(entry)}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Test day. Run it from the Tests module.
            </Typography>
            <Button variant="outlined" size="small" onClick={() => router.push('/teacher/tests')} sx={{ mt: 1.5, minHeight: 40 }}>
              Open Tests
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: { md: 'grid' }, gridTemplateColumns: { md: '340px 1fr' }, gap: 3, alignItems: 'start' }}>
            {/* Left: class card + actions */}
            <Box sx={{ mb: { xs: 2.5, md: 0 } }}>
              <Box sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(26,32,39,0.05)' }}>
                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                  {entry.topic && (
                    <Chip
                      label={PRIORITY_DISPLAY[entry.topic.priority] || entry.topic.priority}
                      size="small"
                      sx={{ bgcolor: 'rgba(124,58,237,0.12)', color: '#5B21B6', fontWeight: 700, height: 20, fontSize: '0.65rem' }}
                    />
                  )}
                  {entry.topic?.module && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      {entry.topic.module.title}
                    </Typography>
                  )}
                </Stack>
                <Typography
                  role={entry.topic_id ? 'button' : undefined}
                  onClick={() => entry.topic_id && router.push(`/teacher/curriculum/${entry.topic_id}`)}
                  sx={{
                    fontWeight: 700,
                    fontSize: '1.15rem',
                    mt: 1,
                    lineHeight: 1.3,
                    cursor: entry.topic_id ? 'pointer' : 'default',
                    '&:hover': entry.topic_id ? { color: 'primary.main' } : {},
                  }}
                >
                  {entryTitle(entry)} {entry.topic_id ? '›' : ''}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {cls?.start_time ? `${fmtTime(cls.start_time)} – ${fmtTime(cls.end_time)}` : 'Not scheduled yet'}
                  {span > 1 && day ? ` · Day ${day.sessionIndex + 1} of ${span}` : ''}
                  {cls?.teacher?.name ? ` · ${cls.teacher.name}` : ''}
                </Typography>
                {cls?.teams_meeting_join_url && (
                  <Button
                    variant="contained"
                    fullWidth
                    startIcon={<PlayArrowIcon />}
                    href={cls.teams_meeting_join_url}
                    target="_blank"
                    sx={{ mt: 1.75, minHeight: 48, bgcolor: TEST_COLOR, '&:hover': { bgcolor: '#0D47A1' } }}
                  >
                    Join class meeting
                  </Button>
                )}
              </Box>

              <Stack spacing={1} sx={{ mt: 1.5 }}>
                <Button
                  variant="contained"
                  disabled={busy || ended || entry.status === 'done'}
                  onClick={async () => {
                    const ok = await post({ action: 'end_class', date }, undefined);
                    if (ok) {
                      setEnded(true);
                      setSnack({ msg: 'Coverage logged and synced to the plan.', sev: 'success' });
                    }
                  }}
                  sx={{ minHeight: 48 }}
                >
                  {ended || entry.status === 'done' ? '✓ Coverage logged, synced to plan' : 'End class & log coverage'}
                </Button>
                {pendingCount > 0 && !ended && (
                  <Button
                    variant="outlined"
                    startIcon={<RedoIcon />}
                    disabled={busy}
                    onClick={() =>
                      post(
                        { action: 'carry_remaining', date },
                        `Carried to the next class. Later classes shifted.`,
                      )
                    }
                    sx={{ minHeight: 48 }}
                  >
                    Carry {pendingCount} remaining to next class
                  </Button>
                )}
              </Stack>
            </Box>

            {/* Right: agenda */}
            <Box>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', mb: 1 }}>
                {isToday ? "Today's plan" : 'Class plan'}, tap to mark
              </Typography>
              <AgendaList
                items={payload.items}
                onSetStatus={setItemStatus}
                onAddUnplanned={() => {
                  setAddTitle('');
                  setAddOpen(true);
                }}
                disabled={busy}
              />
            </Box>
          </Box>
        )}

        {/* Add unplanned item */}
        <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ pb: 0.5 }}>Add unplanned topic</DialogTitle>
          <DialogContent>
            <TextField
              label="What did you cover?"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              fullWidth
              autoFocus
              placeholder="e.g. Q&A: measuring point method"
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={busy || !addTitle.trim()}
              onClick={async () => {
                setAddOpen(false);
                await post({ action: 'add_item', date, title: addTitle.trim() }, 'Added and tagged as unplanned.');
              }}
            >
              Add
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </PlanShell>
  );
}

export default function ClassDayPage() {
  return (
    <Suspense fallback={null}>
      <ClassDayInner />
    </Suspense>
  );
}
