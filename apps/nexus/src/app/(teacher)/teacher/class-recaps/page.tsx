'use client';

/**
 * Teacher: Class Recaps hub. Turn recorded classes into gated catch-up modules
 * for late joiners, and track how many students have completed each one.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Stack,
  Button,
  Chip,
  TextField,
  MenuItem,
  Skeleton,
  EmptyState,
  Snackbar,
  Alert,
  alpha,
} from '@neram/ui';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface Candidate {
  scheduled_class_id: string;
  title: string;
  scheduled_date: string;
  start_time: string | null;
  has_transcript: boolean;
  recap: { id: string; status: string } | null;
}
interface RecapRow {
  id: string;
  title: string;
  status: string;
  section_count: number;
  completed_count: number;
  in_progress_count: number;
}

export default function TeacherClassRecapsHub() {
  const router = useRouter();
  const { loading: authLoading, classrooms, activeClassroom, getTeacherToken } = useNexusAuthContext();

  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [recaps, setRecaps] = useState<RecapRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  // Ad-hoc recap from a pasted recording link (class scheduled directly in Teams).
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [creatingManual, setCreatingManual] = useState(false);

  useEffect(() => {
    if (activeClassroom?.id && !classroomId) setClassroomId(activeClassroom.id);
  }, [activeClassroom, classroomId]);

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

  const load = useCallback(async () => {
    if (!classroomId) return;
    setCandidates(null);
    setRecaps(null);
    try {
      const [c, r] = await Promise.all([
        teacherFetch(`/api/class-recaps/candidates?classroomId=${classroomId}`),
        teacherFetch(`/api/class-recaps?classroomId=${classroomId}`),
      ]);
      setCandidates(c.candidates as Candidate[]);
      setRecaps(r.recaps as RecapRow[]);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load', sev: 'error' });
      setCandidates([]);
      setRecaps([]);
    }
  }, [teacherFetch, classroomId]);

  useEffect(() => {
    if (!authLoading && classroomId) load();
  }, [authLoading, classroomId, load]);

  const createRecap = async (scheduledClassId: string) => {
    setBusy(scheduledClassId);
    try {
      const res = await teacherFetch('/api/class-recaps', {
        method: 'POST',
        body: JSON.stringify({ scheduled_class_id: scheduledClassId }),
      });
      router.push(`/teacher/class-recaps/${res.recap.id}`);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to create recap', sev: 'error' });
      setBusy(null);
    }
  };

  const createManualRecap = async () => {
    if (!classroomId) return;
    const title = manualTitle.trim();
    const recording_url = manualUrl.trim();
    if (!title || !recording_url) {
      setSnack({ msg: 'Add a title and paste the recording link', sev: 'error' });
      return;
    }
    setCreatingManual(true);
    try {
      const res = await teacherFetch('/api/class-recaps', {
        method: 'POST',
        body: JSON.stringify({ title, classroom_id: classroomId, recording_url }),
      });
      router.push(`/teacher/class-recaps/${res.recap.id}`);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to create recap', sev: 'error' });
      setCreatingManual(false);
    }
  };

  const withoutRecap = (candidates || []).filter((c) => !c.recap);

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.5 }}>
        <VideoLibraryOutlinedIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, letterSpacing: '-0.3px' }}>
          Class Recaps
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Turn a recorded class into a gated catch-up module. Late joiners must pass a short quiz at each checkpoint to complete it.
      </Typography>

      {classrooms.length > 1 && (
        <TextField
          select
          size="small"
          label="Classroom"
          value={classroomId || ''}
          onChange={(e) => setClassroomId(e.target.value)}
          sx={{ mb: 2.5, minWidth: 220 }}
        >
          {classrooms.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      {/* Ad-hoc recap from a pasted recording link (Teams-scheduled class) */}
      {!manualOpen ? (
        <Button
          startIcon={<AddIcon />}
          variant="outlined"
          onClick={() => setManualOpen(true)}
          disabled={!classroomId}
          sx={{ mb: 2.5, minHeight: 44, textTransform: 'none' }}
        >
          New recap from a recording link
        </Button>
      ) : (
        <Box
          sx={{
            mb: 2.5,
            p: { xs: 1.75, sm: 2 },
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', mb: 0.5 }}>
            New recap from a recording link
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            For a class recorded in Teams that was not scheduled in Nexus. Open the meeting in Teams, copy the recording link, and paste it below.
          </Typography>
          <Stack spacing={1.5}>
            <TextField
              size="small"
              label="Title"
              placeholder="JEE Paper 2 (B.Arch): Introduction & Maths Focus"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Recording link"
              placeholder="https://teams.microsoft.com/l/meetingrecap?..."
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                onClick={createManualRecap}
                disabled={creatingManual}
                sx={{ minHeight: 44, textTransform: 'none' }}
              >
                {creatingManual ? 'Creating…' : 'Create & edit'}
              </Button>
              <Button
                onClick={() => {
                  setManualOpen(false);
                  setManualTitle('');
                  setManualUrl('');
                }}
                disabled={creatingManual}
                sx={{ minHeight: 44, textTransform: 'none' }}
              >
                Cancel
              </Button>
            </Box>
          </Stack>
        </Box>
      )}

      {/* Published / draft recaps with completion */}
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
        Recaps
      </Typography>
      {recaps === null ? (
        <Stack spacing={1} sx={{ mb: 3 }}>
          <Skeleton variant="rounded" height={64} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" height={64} sx={{ borderRadius: 2 }} />
        </Stack>
      ) : recaps.length === 0 ? (
        <Box sx={{ mb: 3 }}>
          <EmptyState title="No recaps yet" description="Create one from a recorded class below." />
        </Box>
      ) : (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {recaps.map((r) => (
            <Box
              key={r.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.75,
                py: 1.25,
                minHeight: 60,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.92rem' }} noWrap>
                  {r.title}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    label={r.status === 'published' ? 'Published' : r.status === 'archived' ? 'Archived' : 'Draft'}
                    sx={{
                      height: 20,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      bgcolor: r.status === 'published' ? 'rgba(46,125,50,0.12)' : alpha('#1A2027', 0.08),
                      color: r.status === 'published' ? '#1B5E20' : 'text.secondary',
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {r.section_count} checkpoint{r.section_count === 1 ? '' : 's'}
                  </Typography>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <GroupOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.secondary">
                      {r.completed_count} completed · {r.in_progress_count} in progress
                    </Typography>
                  </Box>
                </Box>
              </Box>
              <Button
                size="small"
                startIcon={<EditOutlinedIcon />}
                onClick={() => router.push(`/teacher/class-recaps/${r.id}`)}
                sx={{ minHeight: 40, textTransform: 'none', flexShrink: 0 }}
              >
                Manage
              </Button>
            </Box>
          ))}
        </Stack>
      )}

      {/* Recorded classes to convert */}
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
        Recorded classes
      </Typography>
      {candidates === null ? (
        <Stack spacing={1}>
          <Skeleton variant="rounded" height={56} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" height={56} sx={{ borderRadius: 2 }} />
        </Stack>
      ) : withoutRecap.length === 0 ? (
        <EmptyState
          title="No new recordings"
          description="Recorded classes without a recap will appear here once recordings sync from Teams."
        />
      ) : (
        <Stack spacing={1}>
          {withoutRecap.map((c) => (
            <Box
              key={c.scheduled_class_id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.75,
                py: 1.25,
                minHeight: 56,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
                  {c.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(c.scheduled_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {c.has_transcript ? ' · transcript ready' : ' · no transcript yet'}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon />}
                disabled={busy === c.scheduled_class_id}
                onClick={() => createRecap(c.scheduled_class_id)}
                sx={{ minHeight: 40, textTransform: 'none', flexShrink: 0 }}
              >
                Create recap
              </Button>
            </Box>
          ))}
        </Stack>
      )}

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
