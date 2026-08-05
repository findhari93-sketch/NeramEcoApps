'use client';

/**
 * Teacher: turn a recorded class into a gated recap.
 *
 * One button does the whole thing, and everything else on the screen exists for
 * the rare case where that button produced something worth changing by hand.
 * That ordering is deliberate and it is a correction. This used to be five
 * separate steps (generate, review, save, publish, build the class test), which
 * left production with nine recorded classes and no usable recap: nobody presses
 * five buttons per class.
 *
 * Two of those steps were also quietly broken, and between them they published a
 * recap with nothing in it. Generate returned a PREVIEW and saved nothing, and
 * Publish sent a PATCH that knew only what the server already had, so pressing
 * one and then the other published an empty recap and said "Published to
 * students." Publish now saves first, and reports the class test warning the API
 * has always returned and this screen has always discarded.
 *
 * A third was worse and silent. This screen used to hold its own copy of the
 * checkpoint editor, and its loader dropped the section id. updateRecapSections
 * decides update-in-place versus re-create on exactly that id, so pressing Save
 * on a published recap archived every live checkpoint, inserted fresh ones, and
 * left every student's passed attempt pointing at an invisible row. They were
 * re-locked mid-recap by a teacher fixing a typo. The editor now comes from
 * components/class-recap/RecapCheckpointsEditor, whose toEditableSections
 * carries the id, and which the Foundation chapter tracks use as well.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
  alpha,
} from '@neram/ui';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import PublishIcon from '@mui/icons-material/Publish';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import TuneIcon from '@mui/icons-material/Tune';
import { ToggleButtonGroup, ToggleButton } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import RecapSettingsSheet, { type RecapSettings } from '@/components/class-recap/RecapSettingsSheet';
import RecapCheckpointsEditor, {
  toEditableSections,
  type EditableSection,
} from '@/components/class-recap/RecapCheckpointsEditor';

export default function TeacherClassRecapEditor() {
  const params = useParams();
  const router = useRouter();
  const recapId = params?.recapId as string;
  const { loading: authLoading, getTeacherToken } = useNexusAuthContext();

  const [recap, setRecap] = useState<{ id: string; title: string; status: string; recording_url: string | null; video_source: string; video_duration_seconds: number | null } | null>(null);
  const [settings, setSettings] = useState<RecapSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sections, setSections] = useState<EditableSection[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' | 'info' } | null>(null);
  // The 85% paper a catch-up student sits after finishing this recap. Built
  // from these checkpoints, so it only exists once they do.
  const [classTest, setClassTest] = useState<{
    test: { placement_id: string; test_id: string; passing_pct: number; question_count: number } | null;
    buildable: boolean;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    try {
      const res = await teacherFetch(`/api/class-recaps/${recapId}`);
      const r = res.recap;
      setRecap({
        id: r.id,
        title: r.title,
        status: r.status,
        recording_url: r.recording_url,
        video_source: r.video_source || 'sharepoint',
        video_duration_seconds: r.video_duration_seconds ?? null,
      });
      // Falls back to the shipped defaults rather than zeros, so opening the
      // sheet on a recap predating these columns still shows real numbers.
      setSettings({
        target_segment_seconds: r.target_segment_seconds ?? 900,
        question_pool_per_segment: r.question_pool_per_segment ?? 15,
        questions_per_segment: r.questions_per_segment ?? 10,
        pass_percentage: r.pass_percentage ?? 70,
      });
      // Through toEditableSections, never by hand: it carries the section id,
      // and a save without ids re-creates every checkpoint and strands the
      // attempts of every student who had already passed one.
      setSections(toEditableSections(r.sections));
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load', sev: 'error' });
    }
    // Separate and swallowed: the class test is extra information about this
    // recap, not part of it, and failing to read it must not blank the editor.
    try {
      const t = await teacherFetch(`/api/class-recaps/${recapId}/class-test`);
      setClassTest({ test: t.test ?? null, buildable: !!t.buildable });
    } catch {
      setClassTest({ test: null, buildable: false });
    }
  }, [teacherFetch, recapId]);

  const buildClassTest = useCallback(async () => {
    setBusy('class-test');
    try {
      const res = await teacherFetch(`/api/class-recaps/${recapId}/class-test`, { method: 'POST' });
      setClassTest({
        test: {
          placement_id: res.placement_id,
          test_id: res.test_id,
          passing_pct: res.passing_pct,
          question_count: res.question_count,
        },
        buildable: true,
      });
      setSnack({
        msg:
          res.warning ||
          `Class test ready: ${res.question_count} questions, ${res.must_get_right} needed to pass.`,
        sev: res.warning ? 'info' : 'success',
      });
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not build the class test', sev: 'error' });
    } finally {
      setBusy(null);
    }
  }, [teacherFetch, recapId]);

  useEffect(() => {
    if (!authLoading && recapId) load();
  }, [authLoading, recapId, load]);

  const generate = useCallback(
    async (vttContent?: string) => {
      setBusy('generate');
      setSnack({ msg: 'Generating checkpoints from the class transcript...', sev: 'info' });
      try {
        const res = await teacherFetch(`/api/class-recaps/${recapId}/generate`, {
          method: 'POST',
          body: JSON.stringify(vttContent ? { vtt_content: vttContent } : {}),
        });
        if (res.error === 'no_transcript') {
          setSnack({ msg: res.message || 'No transcript available. Upload a .vtt file.', sev: 'error' });
          return;
        }
        // Freshly generated, so these carry no ids and are meant to be new rows.
        setSections(toEditableSections(res.generated?.sections));
        setSnack({ msg: 'Draft checkpoints generated. Review, edit, then save.', sev: 'success' });
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Generation failed', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [teacherFetch, recapId],
  );

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const text = await file.text();
      await generate(text);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  /**
   * Persist the checkpoints currently on screen.
   *
   * Returns whether it worked, because publish now depends on it: publishing
   * without saving first is how a recap went live with nothing in it.
   */
  const save = useCallback(
    async (announce = true): Promise<boolean> => {
      setBusy('save');
      try {
        await teacherFetch(`/api/class-recaps/${recapId}/sections`, {
          method: 'PUT',
          body: JSON.stringify({ sections }),
        });
        if (announce) setSnack({ msg: 'Checkpoints saved.', sev: 'success' });
        await load();
        return true;
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Save failed', sev: 'error' });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [teacherFetch, recapId, sections, load],
  );

  /** Success, then out. Long enough to read, short enough not to feel stuck. */
  const leaveTo = useCallback(
    (msg: string) => {
      setSnack({ msg, sev: 'success' });
      setTimeout(() => router.push('/teacher/catch-up?tab=classes'), 1400);
    },
    [router],
  );

  const setStatus = useCallback(
    async (action: 'publish' | 'unpublish') => {
      // Publishing SAVES first. Without this, Generate put checkpoints on screen
      // and nowhere else, Publish sent a PATCH that knew nothing about them, and
      // the recap went live empty while the button reported plain success. That
      // is exactly what happened to the 12 July class in production.
      if (action === 'publish') {
        if (sections.length === 0) {
          setSnack({ msg: 'There are no checkpoints to publish yet.', sev: 'error' });
          return;
        }
        if (!(await save(false))) return;
      }

      setBusy(action);
      try {
        const res = await teacherFetch(`/api/class-recaps/${recapId}`, {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        });
        setRecap((prev) => (prev ? { ...prev, status: res.recap.status } : prev));
        if (action !== 'publish') {
          setSnack({ msg: 'Unpublished.', sev: 'success' });
          return;
        }
        // load() re-reads the class test alongside the recap, so the panel below
        // stops offering to build something that now exists.
        await load();
        // The API has always returned this and the editor has always thrown it
        // away, so "Published to students." was printed over a recap with no
        // class test and no way for anyone to clear the class.
        if (res.classTestWarning) {
          setSnack({ msg: res.classTestWarning, sev: 'error' });
          return;
        }
        leaveTo('Published to students. Class test ready.');
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Failed', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [teacherFetch, recapId, sections.length, save, load, leaveTo],
  );

  /**
   * The whole job in one press: generate, save, grade, publish, build the test.
   *
   * This is what the screen is for. The five-button version left production with
   * nine recorded classes and no usable recap, because nobody presses five
   * buttons per class and the second one only ever produced a preview.
   *
   * A hold is not a failure and does not navigate away: the checkpoints are
   * already saved, the reason is on screen, and the teacher fixes what is wrong
   * and presses Publish.
   */
  const generateAndPublish = useCallback(async () => {
    setBusy('autopublish');
    setSnack({ msg: 'Writing checkpoints from the class transcript. This takes a minute.', sev: 'info' });
    try {
      const res = await teacherFetch(`/api/class-recaps/${recapId}/autopublish`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load();

      if (!res.published) {
        setSnack({
          msg: res.summary
            ? `Not published yet. ${res.summary}`
            : 'Not published yet. Review the checkpoints below.',
          sev: 'error',
        });
        return;
      }

      const test = res.classTest
        ? `class test of ${res.classTest.question_count} questions ready`
        : res.classTestWarning || 'no class test';
      leaveTo(
        `Published. ${res.sections} checkpoints, ${res.questions} questions, ${test}.`,
      );
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not prepare this recap', sev: 'error' });
    } finally {
      setBusy(null);
    }
  }, [teacherFetch, recapId, load, leaveTo]);

  const setVideoSource = useCallback(
    async (source: 'sharepoint' | 'youtube') => {
      setBusy('source');
      try {
        const res = await teacherFetch(`/api/class-recaps/${recapId}`, {
          method: 'PATCH',
          body: JSON.stringify({ action: 'set_video_source', video_source: source }),
        });
        setRecap((prev) =>
          prev ? { ...prev, video_source: res.recap.video_source, recording_url: res.recap.recording_url } : prev,
        );
        setSnack({
          msg:
            source === 'youtube'
              ? 'Students will watch the YouTube backup copy.'
              : 'Students will watch the Teams recording.',
          sev: 'success',
        });
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Failed', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [teacherFetch, recapId],
  );

  if (!recap) {
    return (
      <Box sx={{ maxWidth: 820, mx: 'auto' }}>
        <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rounded" height={240} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  const published = recap.status === 'published';

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', pb: 6 }}>
      {/* Pushed, not router.back(). This editor is opened from the review queue,
          from a class row, and straight from a link in a notification, and
          back() sent a teacher who arrived by the last of those nowhere useful.
          Catch-up is the screen this work belongs to whichever way you came. */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/teacher/catch-up?tab=classes')}
        sx={{ mb: 1, color: 'text.secondary', minHeight: 44 }}
      >
        Back to Catch-up
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' }, letterSpacing: '-0.3px' }}>
          {recap.title}
        </Typography>
        <Chip
          size="small"
          label={published ? 'Published' : 'Draft'}
          sx={{
            fontWeight: 700,
            bgcolor: published ? 'rgba(46,125,50,0.12)' : alpha('#1A2027', 0.08),
            color: published ? '#1B5E20' : 'text.secondary',
          }}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Generate checkpoint quizzes from the class transcript, review them, then publish. Anyone who
        missed this class watches it here, not only students who joined late.
      </Typography>

      {/* Video source: which copy students watch */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
          Which recording do students watch?
        </Typography>
        <ToggleButtonGroup
          value={recap.video_source}
          exclusive
          size="small"
          disabled={!!busy}
          onChange={(_, v) => v && setVideoSource(v)}
        >
          <ToggleButton value="sharepoint" sx={{ textTransform: 'none', minHeight: 40, px: 2 }}>
            Teams recording
          </ToggleButton>
          <ToggleButton value="youtube" sx={{ textTransform: 'none', minHeight: 40, px: 2 }}>
            YouTube backup
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          The Teams recording is used for the transcript. The unlisted YouTube copy is the durable one (Teams expires after ~6 months).
        </Typography>
      </Box>

      {/* The one press that does the whole job. Full width and alone, because
          every other control on this screen exists for the rare case where this
          one produced something a teacher wants to change by hand. */}
      <Button
        fullWidth
        variant="contained"
        size="large"
        startIcon={<AutoAwesomeIcon />}
        disabled={!!busy}
        onClick={generateAndPublish}
        sx={{ mb: 1.5, minHeight: 56, textTransform: 'none', fontWeight: 800, borderRadius: 99 }}
      >
        {busy === 'autopublish' ? 'Preparing this class...' : 'Generate and publish'}
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
        Writes the checkpoints and their questions, saves them, builds the class test and publishes,
        in one go. If anything looks wrong it stops and tells you, and everything below stays
        editable.
      </Typography>

      {/* Actions */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2.5 }}>
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeIcon />}
          disabled={!!busy}
          onClick={() => generate()}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          {busy === 'generate' ? 'Generating...' : 'Generate only'}
        </Button>
        <Button variant="outlined" startIcon={<UploadFileIcon />} disabled={!!busy} onClick={() => fileRef.current?.click()} sx={{ minHeight: 44, textTransform: 'none' }}>
          Upload .vtt
        </Button>
        {/* Sits next to Generate on purpose: these numbers decide what Generate
            produces, so finding them afterwards is finding them too late. */}
        <Button
          variant="outlined"
          startIcon={<TuneIcon />}
          disabled={!!busy || !settings}
          onClick={() => setSettingsOpen(true)}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Checkpoint settings
        </Button>
        <input ref={fileRef} type="file" accept=".vtt,text/vtt" hidden onChange={onUpload} />
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<SaveOutlinedIcon />} disabled={!!busy || sections.length === 0} onClick={() => save()} sx={{ minHeight: 44, textTransform: 'none' }}>
          Save
        </Button>
        {published ? (
          <Button variant="text" disabled={!!busy} onClick={() => setStatus('unpublish')} sx={{ minHeight: 44, textTransform: 'none' }}>
            Unpublish
          </Button>
        ) : (
          <Button variant="contained" color="success" startIcon={<PublishIcon />} disabled={!!busy || sections.length === 0} onClick={() => setStatus('publish')} sx={{ minHeight: 44, textTransform: 'none' }}>
            Publish
          </Button>
        )}
      </Stack>

      {/* The class test. Separate from the checkpoints above because it answers
          a different question: the checkpoints prove someone watched, this
          proves they learned it. Only a catch-up student sits it. */}
      {classTest?.buildable && (
        <Box
          sx={{
            mb: 2.5,
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha('#1A2027', 0.02),
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
            Class test for catch-up students
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
            {classTest.test
              ? `Ready: ${classTest.test.question_count} questions, ${classTest.test.passing_pct}% to pass. Built from the checkpoints below, so rebuild it after you change them.`
              : 'Built from the checkpoint questions below, so it costs nothing to generate and every question has already been through your review. A student clears this class only after passing it.'}
          </Typography>
          <Button
            variant={classTest.test ? 'outlined' : 'contained'}
            disabled={!!busy || sections.length === 0}
            onClick={buildClassTest}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {busy === 'class-test'
              ? 'Building...'
              : classTest.test
                ? 'Rebuild the class test'
                : 'Build the class test'}
          </Button>
          {sections.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
              Add checkpoints first. The test is assembled from their questions.
            </Typography>
          )}
        </Box>
      )}

      <RecapCheckpointsEditor
        sections={sections}
        disabled={!!busy}
        onChange={setSections}
        emptyState={
          <Typography variant="body2">
            No checkpoints yet. Press <strong>Generate and publish</strong> above and this fills
            itself in. Use <strong>Generate only</strong> if you want to read them before students do.
          </Typography>
        }
      />

      {settings && recap && (
        <RecapSettingsSheet
          open={settingsOpen}
          recapId={recap.id}
          initial={settings}
          videoDurationSeconds={recap.video_duration_seconds}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setSettings(s);
            // The saved pass mark is written onto every existing checkpoint, so
            // reload rather than trust the local copy.
            void load();
            setSnack({ msg: 'Checkpoint settings saved', sev: 'success' });
          }}
        />
      )}

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'info'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
