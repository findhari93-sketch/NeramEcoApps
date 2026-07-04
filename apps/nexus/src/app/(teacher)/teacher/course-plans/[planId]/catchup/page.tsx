'use client';

/**
 * Catch-up (teacher view): students who joined after the plan started, each
 * with an auto-generated track of the topics they missed. Share publishes
 * the track (and its topics) to the student's Self-learning page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Typography, Stack, Button, Skeleton, Avatar, alpha } from '@neram/ui';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import CheckIcon from '@mui/icons-material/Check';
import PlanShell from '@/components/course-plan/PlanShell';
import { usePlanData } from '@/components/course-plan/usePlanData';
import CatchupTrack from '@/components/course-plan/CatchupTrack';
import { fmtShort } from '@/components/course-plan/common';
import type { NexusCatchupTrackDetail } from '@neram/database';

interface Joiner {
  user_id: string;
  enrolled_at: string;
  user: { id: string; name: string | null; email: string | null; avatar_url: string | null } | null;
  track: { id: string; shared_at: string | null; done_count: number; item_count: number } | null;
}

export default function PlanCatchupPage() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();
  const planData = usePlanData(planId);
  const { plan, flow, authFetch, setSnack } = planData;

  const [joiners, setJoiners] = useState<Joiner[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [track, setTrack] = useState<NexusCatchupTrackDetail | null>(null);
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadJoiners = useCallback(async () => {
    try {
      const res = await authFetch(`/api/teaching-plans/${planId}/catchup`);
      setJoiners(res.late_joiners as Joiner[]);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load late joiners', sev: 'error' });
      setJoiners([]);
    }
  }, [authFetch, planId, setSnack]);

  const loadTrack = useCallback(
    async (studentId: string) => {
      setTrack(null);
      try {
        const res = await authFetch(`/api/teaching-plans/${planId}/catchup?student_id=${studentId}`);
        setTrack(res.track as NexusCatchupTrackDetail);
        setEnrolledAt(res.enrolled_at ?? null);
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Failed to load track', sev: 'error' });
      }
    },
    [authFetch, planId, setSnack],
  );

  useEffect(() => {
    if (plan) loadJoiners();
  }, [plan, loadJoiners]);

  useEffect(() => {
    if (selected) loadTrack(selected);
  }, [selected, loadTrack]);

  const postAction = async (action: 'generate' | 'share') => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/teaching-plans/${planId}/catchup`, {
        method: 'POST',
        body: JSON.stringify({ action, student_id: selected }),
      });
      setTrack(res.track as NexusCatchupTrackDetail);
      setSnack({
        msg:
          action === 'share'
            ? 'Track shared. The student sees it in their Self-learning page.'
            : 'Track regenerated from the plan.',
        sev: 'success',
      });
      await loadJoiners();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to save', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  /** "Joined on Day N": index of the first class day on/after enrolment. */
  const joinDayLabel = useMemo(() => {
    if (!flow || !enrolledAt) return null;
    const joinDate = enrolledAt.slice(0, 10);
    const classDays = flow.days.filter((d) => !d.isTest);
    const before = classDays.filter((d) => d.date < joinDate).length;
    return { day: before + 1, missed: before };
  }, [flow, enrolledAt]);

  const doneCount = track?.items.filter((i) => i.status === 'done').length ?? 0;
  const selectedJoiner = joiners?.find((j) => j.user_id === selected) ?? null;

  return (
    <PlanShell planId={planId} active="catchup" planData={planData}>
      <Box sx={{ maxWidth: 720 }}>
        {!joiners ? (
          <Stack spacing={1.5}>
            <Skeleton variant="rounded" height={72} sx={{ borderRadius: 3 }} />
            <Skeleton variant="rounded" height={72} sx={{ borderRadius: 3 }} />
          </Stack>
        ) : joiners.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 5, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="body2" color="text.disabled">
              No one joined after the plan started. Late joiners appear here with an auto-generated catch-up track.
            </Typography>
          </Box>
        ) : (
          <Box>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', mb: 1 }}>
              Late joiners
            </Typography>
            <Stack spacing={1} sx={{ mb: 2.5 }}>
              {joiners.map((j) => {
                const isSel = selected === j.user_id;
                return (
                  <Box
                    key={j.user_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(isSel ? null : j.user_id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelected(isSel ? null : j.user_id)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.75,
                      py: 1.25,
                      minHeight: 56,
                      borderRadius: 3,
                      bgcolor: 'background.paper',
                      border: isSel ? '1.5px solid' : '1px solid',
                      borderColor: isSel ? 'primary.main' : 'divider',
                      cursor: 'pointer',
                      '&:hover': { borderColor: alpha('#7C3AED', 0.5) },
                    }}
                  >
                    <Avatar src={j.user?.avatar_url || undefined} sx={{ width: 38, height: 38, fontSize: '0.85rem', bgcolor: '#F9A825' }}>
                      {(j.user?.name || '?').slice(0, 2).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
                        {j.user?.name || j.user?.email || 'Student'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Joined {fmtShort(j.enrolled_at.slice(0, 10))}
                        {j.track
                          ? j.track.shared_at
                            ? ` · ${j.track.done_count} of ${j.track.item_count} caught up`
                            : ' · track drafted, not shared'
                          : ' · no track yet'}
                      </Typography>
                    </Box>
                    {j.track?.shared_at && (
                      <Typography variant="caption" sx={{ fontWeight: 800, color: '#1B5E20', flexShrink: 0 }}>
                        ✓ Shared
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Stack>

            {selected && (
              <Box>
                {!track ? (
                  <Skeleton variant="rounded" height={220} sx={{ borderRadius: 3 }} />
                ) : (
                  <Box>
                    {/* Header card */}
                    <Box sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(26,32,39,0.05)', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                        <Avatar src={selectedJoiner?.user?.avatar_url || undefined} sx={{ width: 44, height: 44, bgcolor: '#F9A825', fontWeight: 800 }}>
                          {(selectedJoiner?.user?.name || '?').slice(0, 2).toUpperCase()}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 160 }}>
                          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
                            {selectedJoiner?.user?.name || 'Student'}
                            {joinDayLabel ? ` joined on Day ${joinDayLabel.day}` : ''}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {joinDayLabel ? `${joinDayLabel.missed} live classes already done · ` : ''}
                            {track.items.length} topics missed
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          {!track.shared_at && (
                            <Button size="small" variant="text" startIcon={<RefreshOutlinedIcon />} disabled={busy} onClick={() => postAction('generate')} sx={{ minHeight: 40, color: 'text.secondary' }}>
                              Regenerate
                            </Button>
                          )}
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={track.shared_at ? <CheckIcon /> : <ShareOutlinedIcon />}
                            disabled={busy || !!track.shared_at || track.items.length === 0}
                            onClick={() => postAction('share')}
                            sx={{ minHeight: 40, ...(track.shared_at ? { bgcolor: '#2E7D32' } : {}) }}
                          >
                            {track.shared_at ? 'Shared' : 'Share plan'}
                          </Button>
                        </Stack>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 1.75 }}>
                        <Box sx={{ flex: 1, height: 8, borderRadius: 99, bgcolor: alpha('#1A2027', 0.08) }}>
                          <Box
                            sx={{
                              width: `${track.items.length ? Math.round((doneCount / track.items.length) * 100) : 0}%`,
                              height: '100%',
                              borderRadius: 99,
                              bgcolor: '#2E7D32',
                              transition: 'width 300ms ease',
                            }}
                          />
                        </Box>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: '#1B5E20' }}>
                          {doneCount} of {track.items.length} caught up
                        </Typography>
                      </Box>
                    </Box>

                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', mb: 1 }}>
                      Auto-generated catch-up track
                    </Typography>
                    {track.items.length === 0 ? (
                      <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>
                        Nothing missed. This student joined before any topic was covered.
                      </Typography>
                    ) : (
                      <CatchupTrack
                        lockFuture={false}
                        steps={track.items.map((i) => ({
                          id: i.id,
                          title: i.topic?.title || 'Topic',
                          description: [
                            i.topic?.module?.title,
                            i.topic?.tests?.length ? 'quiz linked' : null,
                            i.topic?.resources?.length ? `${i.topic.resources.length} resources` : null,
                          ]
                            .filter(Boolean)
                            .join(' · '),
                          done: i.status === 'done',
                        }))}
                        onStepClick={(s) => {
                          const item = track.items.find((i) => i.id === s.id);
                          if (item?.topic?.id) router.push(`/teacher/curriculum/${item.topic.id}`);
                        }}
                      />
                    )}
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.25, textAlign: 'center' }}>
                      Teacher view. Tap any topic to edit its content in the Repository.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </PlanShell>
  );
}
