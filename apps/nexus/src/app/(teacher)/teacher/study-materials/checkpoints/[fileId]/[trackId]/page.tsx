'use client';

/**
 * Read and edit the checkpoints for ONE language recording of a chapter.
 *
 * This screen is the missing half of a promise the code has been making since
 * the feature shipped. The tracks dialog saved whatever the generator produced
 * and told the teacher to "review them, then publish"; the generate route's own
 * header called itself a preview the teacher reads and edits. Neither was true,
 * because nothing anywhere could open a checkpoint. The questions a student
 * would be stopped by were unreadable to the person responsible for them.
 *
 * A page rather than a panel inside the dialog, and that is a deliberate
 * departure from "one window". Ten checkpoints times four options is roughly
 * sixty inputs. The dialog is the one window for MANAGING LANGUAGES, which is
 * the job it is good at; editing sixty fields inside a 600px dialog on a phone
 * is not the same job.
 *
 * Tamil and English are edited separately on purpose. They are different
 * recordings of different lengths that pause in different places, so their
 * checkpoints are cut from their own transcripts and never shared. Editing one
 * cannot touch the other.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Stack,
  Button,
  Chip,
  Skeleton,
  Snackbar,
  Alert,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import PublishIcon from '@mui/icons-material/Publish';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import RecapCheckpointsEditor, {
  toEditableSections,
  type EditableSection,
} from '@/components/class-recap/RecapCheckpointsEditor';

interface TrackHead {
  id: string;
  title: string;
  language: string;
  language_label: string | null;
  status: string;
  readiness: string;
  video_source: string;
  video_duration_seconds: number | null;
}

export default function StudyTrackCheckpointsPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params?.fileId as string;
  const trackId = params?.trackId as string;
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [track, setTrack] = useState<TrackHead | null>(null);
  const [sections, setSections] = useState<EditableSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' | 'info' } | null>(null);

  const authed = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
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
    [getToken],
  );

  const base = `/api/study-materials/files/${fileId}/video-tracks/${trackId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authed(`${base}/sections`);
      setTrack(data.track);
      // Through toEditableSections, never by hand. It carries the section id,
      // and without that id a save re-creates every checkpoint and strands the
      // attempts of every student who had already passed one.
      setSections(toEditableSections(data.sections || []));
      setDirty(false);
    } catch (err) {
      setSnack({
        msg: err instanceof Error ? err.message : 'Could not load these checkpoints',
        sev: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [authed, base]);

  useEffect(() => {
    if (!authLoading && fileId && trackId) void load();
  }, [authLoading, fileId, trackId, load]);

  const save = useCallback(async () => {
    setBusy('save');
    try {
      await authed(`${base}/sections`, { method: 'PUT', body: JSON.stringify({ sections }) });
      await load();
      setSnack({ msg: 'Saved', sev: 'success' });
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not save', sev: 'error' });
    } finally {
      setBusy(null);
    }
  }, [authed, base, sections, load]);

  const setStatus = useCallback(
    async (status: 'published' | 'draft') => {
      setBusy('status');
      try {
        await authed(base, { method: 'PATCH', body: JSON.stringify({ status }) });
        await load();
        setSnack({
          msg:
            status === 'published'
              ? 'Published. Students can pick this language now.'
              : 'Unpublished. Students no longer see this language.',
          sev: 'success',
        });
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Could not update', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [authed, base, load],
  );

  if (loading || !track) {
    return (
      <Box sx={{ maxWidth: 820, mx: 'auto' }}>
        <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rounded" height={240} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  const published = track.status === 'published';
  const label = track.language_label || track.language;

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', pb: 6 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/teacher/study-materials')}
        sx={{ mb: 1, color: 'text.secondary', minHeight: 48 }}
      >
        Back to Study Materials
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' }, letterSpacing: '-0.3px' }}>
          {label} checkpoints
        </Typography>
        <Chip
          size="small"
          color={published ? 'success' : 'default'}
          label={published ? 'Published' : 'Draft'}
          sx={{ fontWeight: 700 }}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        {track.title}. The video stops at each checkpoint below and asks these questions. A student
        cannot move past one until they pass it.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2.5 }}>
        <Button
          variant="contained"
          startIcon={<SaveOutlinedIcon />}
          disabled={!!busy || !dirty}
          onClick={save}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          {busy === 'save' ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
        </Button>
        <Box sx={{ flex: 1 }} />
        {published ? (
          <Button
            variant="text"
            disabled={!!busy}
            onClick={() => setStatus('draft')}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Unpublish
          </Button>
        ) : (
          <Button
            variant="outlined"
            color="success"
            startIcon={<PublishIcon />}
            disabled={!!busy || sections.length === 0 || dirty}
            onClick={() => setStatus('published')}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Publish
          </Button>
        )}
      </Stack>

      {/* Publishing with unsaved edits would put the version on screen and the
          version students get out of step, which is worth one sentence rather
          than a greyed button nobody can explain. */}
      {dirty && !published && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Save your changes first, then publish.
        </Alert>
      )}

      <RecapCheckpointsEditor
        sections={sections}
        disabled={!!busy}
        onChange={(next) => {
          setSections(next);
          setDirty(true);
        }}
        emptyState={
          <Typography variant="body2">
            No checkpoints yet. Go back to <strong>Class recordings</strong> on this chapter and
            upload this recording&apos;s transcript, which is what creates them.
          </Typography>
        }
      />

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.sev || 'info'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
