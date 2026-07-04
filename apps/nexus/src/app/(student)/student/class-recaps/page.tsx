'use client';

/**
 * Student Class Recaps list: recorded classes (published as gated recaps) the
 * student can watch to catch up. Shows completion status; opens the gated player.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Stack,
  Button,
  Chip,
  Skeleton,
  EmptyState,
  Snackbar,
  Alert,
} from '@neram/ui';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface RecapRow {
  id: string;
  title: string;
  section_count: number;
  progress_status: 'in_progress' | 'completed' | 'locked' | null;
  created_at: string;
}

export default function StudentClassRecapsList() {
  const router = useRouter();
  const { loading: authLoading } = useNexusAuthContext();
  const authFetch = useAuthFetch();
  const [recaps, setRecaps] = useState<RecapRow[] | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/student/class-recaps');
      setRecaps(res.recaps as RecapRow[]);
    } catch (err) {
      setSnack(err instanceof Error ? err.message : 'Failed to load');
      setRecaps([]);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.5 }}>
        <VideoLibraryOutlinedIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, letterSpacing: '-0.3px' }}>
          Class Recaps
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Missed a class? Watch the recording and pass each checkpoint to catch up.
      </Typography>

      {recaps === null ? (
        <Stack spacing={1.25}>
          <Skeleton variant="rounded" height={72} sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" height={72} sx={{ borderRadius: 3 }} />
        </Stack>
      ) : recaps.length === 0 ? (
        <EmptyState
          title="No recaps yet"
          description="When your teacher publishes a recorded class, it appears here for you to catch up on."
        />
      ) : (
        <Stack spacing={1.25}>
          {recaps.map((r) => {
            const done = r.progress_status === 'completed';
            return (
              <Box
                key={r.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 1.75,
                  py: 1.5,
                  minHeight: 64,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: done ? 'rgba(46,125,50,0.4)' : 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }} noWrap>
                    {r.title}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary">
                      {r.section_count} checkpoint{r.section_count === 1 ? '' : 's'}
                    </Typography>
                    {done && (
                      <Chip
                        size="small"
                        icon={<CheckCircleIcon />}
                        label="Completed"
                        sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, bgcolor: 'rgba(46,125,50,0.12)', color: '#1B5E20' }}
                      />
                    )}
                  </Box>
                </Box>
                <Button
                  size="small"
                  variant={done ? 'text' : 'contained'}
                  startIcon={<PlayCircleOutlineIcon />}
                  onClick={() => router.push(`/student/class-recap/${r.id}`)}
                  sx={{ minHeight: 40, textTransform: 'none', flexShrink: 0 }}
                >
                  {done ? 'Rewatch' : r.progress_status === 'in_progress' ? 'Resume' : 'Start'}
                </Button>
              </Box>
            );
          })}
        </Stack>
      )}

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setSnack(null)}>
          {snack}
        </Alert>
      </Snackbar>
    </Box>
  );
}
