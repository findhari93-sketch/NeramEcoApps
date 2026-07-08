'use client';

/**
 * Schedule: the plan's computed roll-out as a two-week board. Desktop shows a
 * MON..SAT grid; mobile a date-by-date list. Class cards open Class Day;
 * empty class days link to the Builder. A drift banner surfaces when the
 * plan is behind.
 */
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CloseIcon from '@mui/icons-material/Close';
import PlanShell from '@/components/course-plan/PlanShell';
import { usePlanData } from '@/components/course-plan/usePlanData';
import DriftBanner from '@/components/course-plan/DriftBanner';
import { addDays, dayOfWeek, isClassDay, type FlowDay } from '@/lib/plan-flow';
import {
  entryTitle,
  entryColor,
  entrySpan,
  fmtShort,
  fmtDow,
  fmtTime,
  TEST_COLOR,
  type Entry,
} from '@/components/course-plan/common';

/** Monday of the week containing `date`. */
function mondayOf(date: string): string {
  const dow = dayOfWeek(date); // 0 Sun .. 6 Sat
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export default function PlanSchedulePage() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const planData = usePlanData(planId);
  const { plan, flow, today, busy, act, entriesById } = planData;

  // Cancel / makeup overrides that bend the auto-flow onto real class days.
  const cancelledDates = useMemo(
    () => new Set((plan?.schedule_overrides ?? []).filter((o) => o.kind === 'cancelled').map((o) => o.date)),
    [plan],
  );
  const makeupDates = useMemo(
    () => new Set((plan?.schedule_overrides ?? []).filter((o) => o.kind === 'makeup').map((o) => o.date)),
    [plan],
  );
  const classDayOpts = useMemo(
    () => ({ saturdayClasses: plan?.saturday_classes ?? true, holidays: [...cancelledDates], extraDays: [...makeupDates] }),
    [plan, cancelledDates, makeupDates],
  );

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelDate, setCancelDate] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [makeupDate, setMakeupDate] = useState('');

  const doCancel = async () => {
    if (!cancelDate) return;
    const ok = await act(
      { action: 'cancel_class', date: cancelDate, reason: cancelReason || undefined },
      'Class cancelled. Later classes moved forward.',
    );
    if (ok) {
      setCancelDate('');
      setCancelReason('');
    }
  };
  const doMakeup = async () => {
    if (!makeupDate) return;
    const ok = await act({ action: 'add_makeup', date: makeupDate }, 'Makeup class added. The plan catches up.');
    if (ok) setMakeupDate('');
  };
  const removeOverride = (date: string) => act({ action: 'remove_override', date }, 'Schedule change removed.');

  const [weekStart, setWeekStart] = useState<string | null>(null);
  const start = useMemo(() => {
    if (weekStart) return weekStart;
    if (!plan) return null;
    return mondayOf(today >= plan.start_date ? today : plan.start_date);
  }, [weekStart, plan, today]);

  const dayByDate = useMemo(() => {
    const map = new Map<string, FlowDay>();
    for (const d of flow?.days ?? []) if (!map.has(d.date)) map.set(d.date, d);
    return map;
  }, [flow]);

  const cols = plan?.saturday_classes === false ? 5 : 6;
  const dates = useMemo(() => {
    if (!start) return [];
    const out: string[] = [];
    for (let w = 0; w < 2; w++) {
      for (let i = 0; i < cols; i++) out.push(addDays(start, w * 7 + i));
    }
    return out;
  }, [start, cols]);

  const legend = useMemo(() => {
    const mods = new Map<string, { title: string; color: string }>();
    for (const e of plan?.entries ?? []) {
      const m = e.topic?.module;
      if (m && !mods.has(m.id)) mods.set(m.id, { title: m.title, color: m.color || '#7C3AED' });
    }
    return [...mods.values()].slice(0, 5);
  }, [plan]);

  const statusLine = (d: FlowDay, entry: Entry) => {
    const cls = entry.classes?.find((c) => c.scheduled_date === d.date);
    const teacher = cls?.teacher?.name ? ` · ${cls.teacher.name.split(' ')[0]}` : '';
    if (d.isTest) return { text: entry.test?.title ? 'Pinned test' : 'Test day', color: alpha(TEST_COLOR, 0.8) };
    if (d.isCovered) return { text: `✓ Covered${teacher}`, color: '#1B5E20' };
    if (d.isToday) {
      return {
        text: cls?.start_time ? `◷ ${fmtTime(cls.start_time)}${cls.teams_meeting_join_url ? ' · Join meeting' : ''}` : '◷ Today',
        color: TEST_COLOR,
      };
    }
    if (d.isPast) return { text: '◌ Not logged yet', color: '#B54700' };
    if (entry.is_unplanned) return { text: '＋ Unplanned topic', color: '#B54700' };
    return { text: `Planned${teacher}`, color: 'text.disabled' };
  };

  const openDay = (d: FlowDay) => {
    if (d.entryId && !d.isTest) router.push(`/teacher/course-plans/${planId}/class-day?date=${d.date}`);
    else if (!d.entryId) router.push(`/teacher/course-plans/${planId}`);
  };

  const DayCard = ({ date }: { date: string }) => {
    const d = dayByDate.get(date);
    const entry = d?.entryId ? entriesById.get(d.entryId) : null;
    const classDay = plan ? isClassDay(date, classDayOpts) : false;
    const inPlan = !!d;
    const isToday = date === today;
    const isCancelled = cancelledDates.has(date);
    const isMakeup = makeupDates.has(date);

    if (!classDay && !d?.isTest) {
      // A cancelled day reads as "Cancelled" (with undo) instead of a plain Off day.
      if (isCancelled) {
        return (
          <Box
            sx={{
              minHeight: isMobile ? 44 : 96,
              borderRadius: 2.5,
              border: '1px dashed',
              borderColor: alpha('#C62828', 0.4),
              bgcolor: alpha('#C62828', 0.05),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              px: 0.5,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#C62828' }}>
              Cancelled
            </Typography>
            <Button
              size="small"
              onClick={() => removeOverride(date)}
              disabled={busy}
              sx={{ minHeight: 28, fontSize: '0.62rem', px: 0.75, color: 'text.secondary' }}
            >
              Undo
            </Button>
          </Box>
        );
      }
      return (
        <Box sx={{ minHeight: isMobile ? 44 : 96, borderRadius: 2.5, bgcolor: alpha('#1A2027', 0.02), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" color="text.disabled">
            Off
          </Typography>
        </Box>
      );
    }

    return (
      <Box
        sx={{
          minHeight: isMobile ? undefined : 96,
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: isToday ? '#F9A825' : d?.isTest ? alpha(TEST_COLOR, 0.35) : 'divider',
          borderWidth: isToday ? 1.5 : 1,
          bgcolor: d?.isTest ? alpha(TEST_COLOR, 0.05) : isToday ? alpha('#F9A825', 0.06) : 'background.paper',
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        {!isMobile && (
          <Typography variant="caption" sx={{ fontWeight: 700, color: d?.isTest ? TEST_COLOR : isToday ? '#9a6b12' : 'text.disabled' }}>
            {new Date(date + 'T00:00:00').getDate()}
            {isToday ? ' · TODAY' : ''}
          </Typography>
        )}
        {isMakeup && (
          <Chip
            label="Makeup"
            size="small"
            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: alpha('#2E7D32', 0.14), color: '#1B5E20', alignSelf: 'flex-start' }}
          />
        )}
        {entry && d ? (
          <Box
            role="button"
            tabIndex={0}
            onClick={() => openDay(d)}
            onKeyDown={(e) => e.key === 'Enter' && openDay(d)}
            sx={{
              flex: 1,
              borderRadius: 2,
              p: 1,
              cursor: d.isTest ? 'default' : 'pointer',
              bgcolor: 'background.paper',
              border: d.isTest ? 'none' : '1px solid',
              borderColor: 'divider',
              borderLeft: d.isTest ? 'none' : `3px solid ${entryColor(entry)}`,
              boxShadow: d.isTest ? 'none' : '0 1px 2px rgba(26,32,39,0.06)',
              '&:hover': d.isTest ? {} : { borderColor: alpha('#7C3AED', 0.4) },
            }}
          >
            <Typography sx={{ fontSize: '0.76rem', fontWeight: 700, lineHeight: 1.3, color: d.isTest ? TEST_COLOR : 'text.primary' }}>
              {d.isTest ? '◈ ' : ''}
              {entryTitle(entry)}
              {!d.isTest && entrySpan(entry) > 1 ? (
                <Typography component="span" sx={{ fontSize: '0.7rem', color: 'text.disabled', fontWeight: 600 }}>
                  {' '}· day {d.sessionIndex + 1} of {entrySpan(entry)}
                </Typography>
              ) : null}
            </Typography>
            <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, mt: 0.25, color: statusLine(d, entry).color }}>
              {statusLine(d, entry).text}
            </Typography>
          </Box>
        ) : inPlan ? (
          <Box
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/teacher/course-plans/${planId}`)}
            sx={{
              flex: 1,
              minHeight: 44,
              border: '1.5px dashed',
              borderColor: 'divider',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.disabled',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              '&:hover': { borderColor: alpha('#7C3AED', 0.45), color: 'primary.main' },
            }}
          >
            ＋ Pick from repository
          </Box>
        ) : (
          <Box sx={{ flex: 1, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="caption" color="text.disabled">
              {date < (plan?.start_date || '') ? 'Before start' : 'After plan end'}
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <PlanShell planId={planId} active="schedule" planData={planData}>
      {plan && flow && start && (
        <Box>
          <DriftBanner
            planId={planId}
            flow={flow}
            entriesById={entriesById}
            busy={busy}
            onConvert={async (ids) => {
              for (const id of ids) {
                await act(
                  { action: 'convert', entry_id: id, entry_type: 'self_learning', publish: true },
                  undefined,
                );
              }
              planData.setSnack({
                msg: `${ids.length} ${ids.length === 1 ? 'topic' : 'topics'} converted to self-learning and shared with students. Back on track.`,
                sev: 'success',
              });
            }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <IconButton onClick={() => setWeekStart(addDays(start, -14))} sx={{ width: 40, height: 40, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <ChevronLeftIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Typography sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
              {fmtShort(dates[0])} – {fmtShort(dates[dates.length - 1])}
            </Typography>
            <IconButton onClick={() => setWeekStart(addDays(start, 14))} sx={{ width: 40, height: 40, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <ChevronRightIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Button
              size="small"
              variant="outlined"
              startIcon={<EventBusyOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={() => setRescheduleOpen(true)}
              sx={{ minHeight: 40, fontWeight: 600 }}
            >
              Cancel / makeup
              {cancelledDates.size + makeupDates.size > 0 ? ` (${cancelledDates.size + makeupDates.size})` : ''}
            </Button>
            {!isMobile && legend.length > 0 && (
              <Stack direction="row" spacing={1.5} sx={{ ml: 'auto' }} flexWrap="wrap" useFlexGap>
                {legend.map((l) => (
                  <Stack key={l.title} direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 9, height: 9, borderRadius: 0.75, bgcolor: l.color }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      {l.title}
                    </Typography>
                  </Stack>
                ))}
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Box sx={{ width: 9, height: 9, borderRadius: 0.75, bgcolor: TEST_COLOR }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Test
                  </Typography>
                </Stack>
              </Stack>
            )}
          </Box>

          {isMobile ? (
            <Stack spacing={0.75}>
              {dates.map((date) => (
                <Box key={date} sx={{ display: 'flex', gap: 1.25 }}>
                  <Typography
                    sx={{
                      width: 64,
                      flexShrink: 0,
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      textAlign: 'right',
                      pt: 1.25,
                      textTransform: 'uppercase',
                      color: date === today ? '#B54700' : dayByDate.get(date)?.isTest ? TEST_COLOR : 'text.disabled',
                    }}
                  >
                    {fmtDow(date)} {new Date(date + 'T00:00:00').getDate()}
                    {date === today ? ' · TODAY' : ''}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <DayCard date={date} />
                  </Box>
                </Box>
              ))}
            </Stack>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 1 }}>
              {Array.from({ length: cols }, (_, i) => (
                <Typography key={i} sx={{ textAlign: 'center', fontSize: '0.66rem', fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase' }}>
                  {fmtDow(addDays(start, i))}
                </Typography>
              ))}
              {dates.map((date) => (
                <DayCard key={date} date={date} />
              ))}
            </Box>
          )}
          {!isMobile && (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.25 }}>
              Tap a class card to open Class Day. Tap ＋ to open the Builder.
            </Typography>
          )}

          <Dialog open={rescheduleOpen} onClose={() => !busy && setRescheduleOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Cancel or makeup a class</DialogTitle>
            <DialogContent>
              <Stack spacing={2.5} sx={{ mt: 0.5 }}>
                {/* Cancel */}
                <Box>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                    <EventBusyOutlinedIcon sx={{ fontSize: 18, color: '#C62828' }} />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>Cancel a class</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    The class day is dropped. Every class after it shifts one day forward.
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                    <TextField
                      label="Date"
                      type="date"
                      value={cancelDate}
                      onChange={(e) => setCancelDate(e.target.value)}
                      fullWidth
                      size="small"
                      InputLabelProps={{ shrink: true }}
                    />
                    <Button variant="contained" color="error" onClick={doCancel} disabled={busy || !cancelDate} sx={{ minHeight: 40, whiteSpace: 'nowrap' }}>
                      Cancel class
                    </Button>
                  </Stack>
                  <TextField
                    label="Reason (optional)"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    fullWidth
                    size="small"
                    sx={{ mt: 1 }}
                    placeholder="e.g. Public holiday, teacher unavailable"
                  />
                </Box>

                {/* Makeup */}
                <Box>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                    <EventAvailableOutlinedIcon sx={{ fontSize: 18, color: '#1B5E20' }} />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>Add a makeup class</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    Runs an extra class on an off-day (a Sunday works) so the plan catches back up.
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                    <TextField
                      label="Date"
                      type="date"
                      value={makeupDate}
                      onChange={(e) => setMakeupDate(e.target.value)}
                      fullWidth
                      size="small"
                      InputLabelProps={{ shrink: true }}
                    />
                    <Button variant="contained" color="success" onClick={doMakeup} disabled={busy || !makeupDate} sx={{ minHeight: 40, whiteSpace: 'nowrap' }}>
                      Add makeup
                    </Button>
                  </Stack>
                </Box>

                {/* Current overrides */}
                {(plan?.schedule_overrides ?? []).length > 0 && (
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.secondary', mb: 0.75 }}>
                      Current changes
                    </Typography>
                    <Stack spacing={0.75}>
                      {(plan?.schedule_overrides ?? []).map((o) => (
                        <Stack
                          key={o.id}
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          sx={{ p: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
                        >
                          <Chip
                            label={o.kind === 'cancelled' ? 'Cancelled' : 'Makeup'}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              bgcolor: o.kind === 'cancelled' ? alpha('#C62828', 0.12) : alpha('#2E7D32', 0.14),
                              color: o.kind === 'cancelled' ? '#C62828' : '#1B5E20',
                            }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{fmtShort(o.date)}</Typography>
                            {o.reason && (
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {o.reason}
                              </Typography>
                            )}
                          </Box>
                          <IconButton size="small" aria-label="Remove change" onClick={() => removeOverride(o.date)} disabled={busy} sx={{ width: 32, height: 32 }}>
                            <CloseIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setRescheduleOpen(false)} disabled={busy}>Done</Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
    </PlanShell>
  );
}
