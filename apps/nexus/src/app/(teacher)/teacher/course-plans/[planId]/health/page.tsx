'use client';

/**
 * Course Health: planned vs actual progress, lagging topics with one-tap
 * rebalance (self-learning / reschedule / skip), module coverage bars and
 * upcoming tests readiness. Everything is computed client-side from the
 * plan payload + flow engine; no extra API routes.
 */
import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Typography, Stack, Chip, Button, alpha } from '@neram/ui';
import PlanShell from '@/components/course-plan/PlanShell';
import { usePlanData } from '@/components/course-plan/usePlanData';
import DriftBanner from '@/components/course-plan/DriftBanner';
import {
  entryTitle,
  entrySpan,
  fmtShort,
  PRIORITY_DISPLAY,
  TEST_COLOR,
  type Entry,
} from '@/components/course-plan/common';

export default function PlanHealthPage() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();
  const planData = usePlanData(planId);
  const { plan, flow, today, busy, act, entriesById } = planData;

  const stats = useMemo(() => {
    if (!plan || !flow) return null;
    const live = plan.entries.filter((e) => e.entry_type === 'live_class' && e.status !== 'skipped');
    const totalSessions = live.reduce((s, e) => s + entrySpan(e), 0);
    const dueSessions = flow.days.filter((d) => !d.isTest && d.entryId && d.date <= today).length;
    const doneSessions = live.reduce((s, e) => s + Math.min(e.completed_sessions ?? 0, entrySpan(e)), 0);
    const lagging = live
      .filter((e) => {
        const past = (flow.entryDates.get(e.id) ?? []).filter((d) => d < today).length;
        return past > (e.completed_sessions ?? 0);
      })
      .sort((a, b) => a.position - b.position);
    return { totalSessions, dueSessions, doneSessions, lagging };
  }, [plan, flow, today]);

  const modules = useMemo(() => {
    if (!plan) return [];
    const map = new Map<string, { title: string; color: string; total: number; done: number }>();
    for (const e of plan.entries) {
      if (e.entry_type !== 'live_class' || e.status === 'skipped' || !e.topic?.module) continue;
      const m = e.topic.module;
      const row = map.get(m.id) || { title: m.title, color: m.color || '#7C3AED', total: 0, done: 0 };
      row.total += entrySpan(e);
      row.done += Math.min(e.completed_sessions ?? 0, entrySpan(e));
      map.set(m.id, row);
    }
    return [...map.values()];
  }, [plan]);

  const upcomingTests = useMemo(() => {
    if (!plan) return [];
    const queue = [...plan.entries].sort((a, b) => a.position - b.position);
    return queue
      .filter((e) => e.entry_type === 'test' && (!e.planned_date || e.planned_date >= today))
      .map((t) => {
        const before = queue.filter((e) => e.position < t.position && e.entry_type === 'live_class' && e.status !== 'skipped');
        const total = before.reduce((s, e) => s + entrySpan(e), 0);
        const done = before.reduce((s, e) => s + Math.min(e.completed_sessions ?? 0, entrySpan(e)), 0);
        return { entry: t, ready: total ? Math.round((done / total) * 100) : 100 };
      })
      .slice(0, 3);
  }, [plan, today]);

  const rebalance = async (e: Entry, mode: 'self_learning' | 'skip') => {
    if (mode === 'self_learning') {
      await act(
        { action: 'convert', entry_id: e.id, entry_type: 'self_learning', publish: true },
        `“${entryTitle(e)}” converted to self-learning and shared with students.`,
      );
    } else {
      await act({ action: 'set_status', entry_id: e.id, status: 'skipped' }, `“${entryTitle(e)}” skipped. Later classes moved up.`);
    }
  };

  const behind = flow?.behindBy ?? 0;
  const statusChip =
    behind === 0
      ? { label: '● On track', bg: 'rgba(46,125,50,0.12)', color: '#1B5E20' }
      : behind <= 2
        ? { label: '◐ Slightly behind', bg: 'rgba(249,168,37,0.18)', color: '#8D5A00' }
        : { label: '◉ Behind plan', bg: 'rgba(198,40,40,0.1)', color: '#C62828' };

  const pct = (n: number, d: number) => (d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0);

  return (
    <PlanShell planId={planId} active="health" planData={planData}>
      {plan && flow && stats && (
        <Box sx={{ maxWidth: 860 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              {plan.exam_date ? `Exam ${fmtShort(plan.exam_date)} · ` : ''}
              {stats.doneSessions} of {stats.totalSessions} sessions covered
            </Typography>
            <Chip label={statusChip.label} size="small" sx={{ ml: 'auto', bgcolor: statusChip.bg, color: statusChip.color, fontWeight: 800 }} />
          </Box>

          <DriftBanner
            planId={planId}
            flow={flow}
            entriesById={entriesById}
            busy={busy}
            onConvert={async (ids) => {
              for (const id of ids) {
                await act({ action: 'convert', entry_id: id, entry_type: 'self_learning', publish: true }, undefined);
              }
              planData.setSnack({ msg: 'Converted to self-learning and shared. Back on track.', sev: 'success' });
            }}
          />

          {/* Planned vs actual */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Planned · {stats.dueSessions} sessions by today
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Actual · {stats.doneSessions} covered
              </Typography>
            </Box>
            <Box sx={{ position: 'relative', height: 14, borderRadius: 99, bgcolor: alpha('#1A2027', 0.08), mt: 2 }}>
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  width: `${pct(stats.doneSessions, stats.totalSessions)}%`,
                  borderRadius: 99,
                  background: 'linear-gradient(90deg, #2E7D32, #66BB6A)',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  top: -4,
                  bottom: -4,
                  left: `${pct(stats.dueSessions, stats.totalSessions)}%`,
                  width: 2.5,
                  borderRadius: 2,
                  bgcolor: '#C62828',
                }}
              />
              <Typography
                sx={{
                  position: 'absolute',
                  top: -20,
                  left: `${pct(stats.dueSessions, stats.totalSessions)}%`,
                  transform: 'translateX(-50%)',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  color: '#C62828',
                }}
              >
                plan
              </Typography>
            </Box>
            {behind > 0 && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 700, color: '#B54700' }}>
                {behind} {behind === 1 ? 'class' : 'classes'} behind. Rebalance below to protect the next test.
              </Typography>
            )}
          </Box>

          {/* Lagging topics */}
          {stats.lagging.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', mb: 1 }}>
                Lagging topics, rebalance
              </Typography>
              <Stack spacing={1}>
                {stats.lagging.map((e) => (
                  <Box
                    key={e.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      flexWrap: 'wrap',
                      px: 1.75,
                      py: 1.25,
                      borderRadius: 3,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                    }}
                  >
                    {e.topic && (
                      <Chip
                        label={PRIORITY_DISPLAY[e.topic.priority] || e.topic.priority}
                        size="small"
                        sx={{ bgcolor: 'rgba(249,168,37,0.18)', color: '#8D5A00', fontWeight: 700, height: 20, fontSize: '0.65rem' }}
                      />
                    )}
                    <Typography sx={{ flex: 1, minWidth: 140, fontWeight: 700, fontSize: '0.86rem' }}>{entryTitle(e)}</Typography>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={busy}
                      onClick={() => rebalance(e, 'self_learning')}
                      sx={{ minHeight: 36, bgcolor: '#5B21B6', '&:hover': { bgcolor: '#4C1D95' } }}
                    >
                      Self-learning
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => router.push(`/teacher/course-plans/${planId}`)} sx={{ minHeight: 36 }}>
                      Reschedule
                    </Button>
                    <Button size="small" disabled={busy} onClick={() => rebalance(e, 'skip')} sx={{ minHeight: 36, color: 'text.secondary' }}>
                      Skip
                    </Button>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {/* Module coverage */}
            <Box sx={{ flex: 1, minWidth: 260 }}>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', mb: 1.25 }}>
                Module coverage
              </Typography>
              {modules.length === 0 ? (
                <Typography variant="body2" color="text.disabled">
                  No live-class topics in the plan yet.
                </Typography>
              ) : (
                <Stack spacing={1.25}>
                  {modules.map((m) => {
                    const p = pct(m.done, m.total);
                    const color = p >= 80 ? '#2E7D32' : p >= 40 ? '#F9A825' : '#C62828';
                    return (
                      <Box key={m.title} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Typography sx={{ width: 150, flexShrink: 0, fontSize: '0.8rem', fontWeight: 600 }} noWrap>
                          {m.title}
                        </Typography>
                        <Box sx={{ flex: 1, height: 8, borderRadius: 99, bgcolor: alpha('#1A2027', 0.08) }}>
                          <Box sx={{ width: `${p}%`, height: '100%', borderRadius: 99, bgcolor: m.color }} />
                        </Box>
                        <Typography sx={{ width: 40, fontSize: '0.72rem', fontWeight: 800, color }}>{p}%</Typography>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Box>

            {/* Upcoming tests */}
            <Box sx={{ width: { xs: '100%', sm: 260 } }}>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', mb: 1.25 }}>
                Upcoming tests
              </Typography>
              {upcomingTests.length === 0 ? (
                <Typography variant="body2" color="text.disabled">
                  No tests placed in the plan.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {upcomingTests.map(({ entry, ready }) => (
                    <Box
                      key={entry.id}
                      sx={{
                        p: 1.5,
                        borderRadius: 3,
                        bgcolor: alpha(TEST_COLOR, 0.06),
                        border: `1px solid ${alpha(TEST_COLOR, 0.25)}`,
                      }}
                    >
                      <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: TEST_COLOR }}>
                        ◈ {entryTitle(entry)}
                        {entry.planned_date ? ` · ${fmtShort(entry.planned_date)}` : ''}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: alpha(TEST_COLOR, 0.8) }}>
                        {ready}% syllabus ready
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </PlanShell>
  );
}
