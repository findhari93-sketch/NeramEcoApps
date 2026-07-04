'use client';

/**
 * Student Self-learning: the catch-up tracks a teacher shared with this
 * student. Topics unlock in order; the current one expands with its summary,
 * resources and linked quiz, plus a Mark complete button.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Stack,
  Button,
  Skeleton,
  Snackbar,
  Alert,
  Chip,
  EmptyState,
  alpha,
} from '@neram/ui';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import YouTubeIcon from '@mui/icons-material/YouTube';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusCatchupTrackDetail } from '@neram/database';

type Track = NexusCatchupTrackDetail & { plan: { id: string; title: string; status: string } | null };

export default function StudentSelfLearningPage() {
  const router = useRouter();
  const { loading: authLoading } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/student/catchup');
      setTracks(res.tracks as Track[]);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load', sev: 'error' });
      setTracks([]);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const markDone = async (itemId: string) => {
    setBusy(true);
    try {
      await authFetch('/api/student/catchup', {
        method: 'POST',
        body: JSON.stringify({ item_id: itemId, status: 'done' }),
      });
      setSnack({ msg: 'Nice work. The next topic is unlocked.', sev: 'success' });
      await load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to save', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const resourceIcon = (kind: string) =>
    kind === 'youtube' ? (
      <YouTubeIcon sx={{ fontSize: 18, color: '#d32f2f' }} />
    ) : kind === 'study_file' ? (
      <InsertDriveFileOutlinedIcon sx={{ fontSize: 18, color: '#1976d2' }} />
    ) : (
      <LinkOutlinedIcon sx={{ fontSize: 18, color: '#1565C0' }} />
    );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.5 }}>
        <AutoStoriesOutlinedIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, letterSpacing: '-0.3px' }}>
          Self-learning
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Topics your teacher shared for you to study on your own, in order.
      </Typography>

      {tracks === null ? (
        <Stack spacing={1.5} sx={{ maxWidth: 640 }}>
          <Skeleton variant="rounded" height={90} sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" height={200} sx={{ borderRadius: 3 }} />
        </Stack>
      ) : tracks.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="When your teacher shares a catch-up plan or self-learning topics with you, they appear here."
        />
      ) : (
        <Stack spacing={3} sx={{ maxWidth: 640 }}>
          {tracks.map((track) => {
            const done = track.items.filter((i) => i.status === 'done').length;
            const currentIdx = track.items.findIndex((i) => i.status !== 'done');
            return (
              <Box key={track.id}>
                <Box sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', mb: 1.5 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
                    {track.plan?.title || 'Catch-up plan'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 1.25 }}>
                    <Box sx={{ flex: 1, height: 8, borderRadius: 99, bgcolor: alpha('#1A2027', 0.08) }}>
                      <Box
                        sx={{
                          width: `${track.items.length ? Math.round((done / track.items.length) * 100) : 0}%`,
                          height: '100%',
                          borderRadius: 99,
                          bgcolor: '#2E7D32',
                          transition: 'width 300ms ease',
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: '#1B5E20' }}>
                      {done} of {track.items.length} caught up
                    </Typography>
                  </Box>
                </Box>

                <Stack spacing={1}>
                  {track.items.map((item, i) => {
                    const isDone = item.status === 'done';
                    const isCurrent = i === currentIdx;
                    const locked = currentIdx !== -1 && i > currentIdx;
                    return (
                      <Box
                        key={item.id}
                        sx={{
                          borderRadius: 3,
                          bgcolor: 'background.paper',
                          border: isCurrent ? '1.5px solid' : '1px solid',
                          borderColor: isCurrent ? 'primary.main' : 'divider',
                          opacity: isDone ? 0.65 : locked ? 0.7 : 1,
                          overflow: 'hidden',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.75, py: 1.5, minHeight: 56 }}>
                          <Box
                            sx={{
                              width: 30,
                              height: 30,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.82rem',
                              fontWeight: 800,
                              flexShrink: 0,
                              bgcolor: isDone ? 'rgba(46,125,50,0.12)' : isCurrent ? 'rgba(124,58,237,0.12)' : alpha('#1A2027', 0.06),
                              color: isDone ? '#1B5E20' : isCurrent ? '#5B21B6' : 'text.secondary',
                            }}
                          >
                            {isDone ? '✓' : i + 1}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3 }}>
                              {item.topic?.title || 'Topic'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item.topic?.module?.title || ''}
                              {isDone && item.completed_at
                                ? ` · completed ${new Date(item.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                                : ''}
                            </Typography>
                          </Box>
                          {locked && <LockOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />}
                        </Box>

                        {isCurrent && item.topic && (
                          <Box sx={{ px: 1.75, pb: 1.75, borderTop: '1px solid', borderColor: alpha('#1A2027', 0.05) }}>
                            {item.topic.summary && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, lineHeight: 1.6 }}>
                                {item.topic.summary}
                              </Typography>
                            )}
                            {(item.topic.resources || []).length > 0 && (
                              <Stack spacing={0.75} sx={{ mt: 1.5 }}>
                                {item.topic.resources.map((r) => (
                                  <Button
                                    key={r.id}
                                    startIcon={resourceIcon(r.kind)}
                                    href={r.kind === 'study_file' ? '/student/study-materials' : r.url || '#'}
                                    target={r.kind === 'study_file' ? undefined : '_blank'}
                                    sx={{
                                      justifyContent: 'flex-start',
                                      minHeight: 44,
                                      px: 1.25,
                                      color: 'text.primary',
                                      fontWeight: 600,
                                      fontSize: '0.84rem',
                                      border: '1px solid',
                                      borderColor: 'divider',
                                      borderRadius: 2.5,
                                    }}
                                  >
                                    {r.title}
                                  </Button>
                                ))}
                              </Stack>
                            )}
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
                              {(item.topic.tests || []).length > 0 && (
                                <Button
                                  variant="outlined"
                                  startIcon={<QuizOutlinedIcon />}
                                  onClick={() => router.push('/student/tests')}
                                  sx={{ minHeight: 44 }}
                                >
                                  Take the quiz
                                </Button>
                              )}
                              <Button
                                variant="contained"
                                startIcon={<CheckCircleOutlineIcon />}
                                disabled={busy}
                                onClick={() => markDone(item.id)}
                                sx={{ minHeight: 44 }}
                              >
                                Mark complete
                              </Button>
                            </Stack>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
                {track.items.length > 0 && done === track.items.length && (
                  <Chip
                    label="All caught up. Great job!"
                    sx={{ mt: 1.5, bgcolor: 'rgba(46,125,50,0.12)', color: '#1B5E20', fontWeight: 800 }}
                  />
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      <Snackbar open={!!snack} autoHideDuration={3500} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
