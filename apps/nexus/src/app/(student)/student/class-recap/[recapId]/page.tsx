'use client';

/**
 * A gated class recap on its own page.
 *
 * The watching itself lives in <RecapWatch>, shared with the per-class catch-up
 * workspace, which is where a student normally arrives now. This route stays for
 * two cases the workspace cannot serve: an ad-hoc recap with no scheduled class
 * behind it, and the direct links already sent to students.
 *
 * It also handles the rewatch-after-a-failed-test banner, which is specific to
 * arriving here from the class test rather than to watching in general.
 */
import { useCallback, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Box, Typography, Button, Alert } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import RecapWatch, { type Recap } from '@/components/class-recap/RecapWatch';
import type { VideoGateMode } from '@/lib/video-gate';
import ClassResourcesSection from '@/components/timetable/ClassResourcesSection';
import { SECTION_LABEL_SX } from '@/components/timetable/timetable-theme';
import type { ClassResource } from '@/lib/class-resources';

export default function StudentClassRecapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const recapId = params?.recapId as string;
  const { getToken } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  // Arrived here from a failed class test. The banner is the only difference:
  // the gating below is unchanged, and the server decides whether the rewatch
  // counted, so there is nothing here worth faking.
  const rewatching = searchParams?.get('rewatch') === '1';
  const [rearming, setRearming] = useState(false);
  const [rearmMsg, setRearmMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [recap, setRecap] = useState<Recap | null>(null);
  const [resources, setResources] = useState<ClassResource[]>([]);
  // Reported up by RecapWatch, which got it from the server. Only used to word
  // this page's chrome; the gating itself is settled inside RecapWatch.
  const [watchMode, setWatchMode] = useState<VideoGateMode>('gated');
  const revising = watchMode !== 'gated';

  const handleLoaded = useCallback(
    async (r: Recap) => {
      setRecap(r);
      // Resources ride along on the same endpoint RecapWatch already calls, but
      // it does not need them, so they are fetched here rather than threaded
      // through a component whose job is the video.
      try {
        const res = await authFetch(`/api/student/class-recaps/${recapId}`);
        setResources((res.resources || []) as ClassResource[]);
      } catch {
        // Reference material is a bonus, never a blocker on watching.
      }
    },
    [authFetch, recapId],
  );

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', pb: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() =>
          // The per-class workspace only exists for a class the student owes. A
          // rewatcher has no absence row, so it would open on nothing: send them
          // back to the shelf they came from instead.
          recap?.scheduled_class_id && !revising
            ? router.push(`/student/timetable/${recap.scheduled_class_id}/catch-up`)
            : router.push(revising ? '/student/catch-up?tab=watch-again' : '/student/catch-up')
        }
        sx={{ mb: 1, color: 'text.secondary', minHeight: 44 }}
      >
        Back
      </Button>

      <Typography
        variant="h5"
        sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' }, letterSpacing: '-0.3px', mb: 0.5 }}
      >
        {recap?.title || 'Class Recap'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {revising
          ? 'You were in this class. Watch any part of it again, nothing to pass.'
          : 'Watch the class. At each checkpoint, pass a short quiz to unlock the next part.'}
      </Typography>

      {rewatching && recap?.scheduled_class_id && (
        <Alert
          severity={rearmMsg && !rearmMsg.ok ? 'warning' : 'info'}
          sx={{ mb: 2, borderRadius: 2 }}
          action={
            <Button
              size="small"
              disabled={rearming}
              onClick={async () => {
                setRearming(true);
                setRearmMsg(null);
                try {
                  await authFetch(`/api/student/catchup-journey/${recap.scheduled_class_id}/rearm`, {
                    method: 'POST',
                    body: JSON.stringify({}),
                  });
                  setRearmMsg({ text: 'Test unlocked. Take it now.', ok: true });
                } catch (err) {
                  // The server checks how far through the recording they got, so
                  // pressing this early simply fails and says why.
                  setRearmMsg({
                    text: err instanceof Error ? err.message : 'Could not unlock the test yet.',
                    ok: false,
                  });
                } finally {
                  setRearming(false);
                }
              }}
              sx={{ textTransform: 'none', minHeight: 40, whiteSpace: 'nowrap' }}
            >
              {rearming ? 'Checking...' : 'Unlock my test'}
            </Button>
          }
        >
          {rearmMsg
            ? rearmMsg.text
            : 'Watch this through to the end, then unlock the class test and try again.'}
        </Alert>
      )}

      {rewatching && rearmMsg?.ok && recap?.scheduled_class_id && (
        <Button
          fullWidth
          variant="contained"
          onClick={() => router.push(`/student/catch-up/${recap.scheduled_class_id}/test`)}
          sx={{ mb: 2, minHeight: 48, textTransform: 'none', fontWeight: 700 }}
        >
          Take the class test
        </Button>
      )}

      <RecapWatch recapId={recapId} onLoaded={handleLoaded} onWatchMode={setWatchMode} />

      {/* The teacher's reference material, below the checkpoints. Ungated on
          purpose: the video is what the quiz locks, and a student who just
          failed a checkpoint needs somewhere to go and read rather than another
          closed door. */}
      {recap?.scheduled_class_id && resources.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <ClassResourcesSection
            cls={{ id: recap.scheduled_class_id, title: recap.title } as any}
            getToken={getToken}
            editable={false}
            resources={resources}
            header={
              <Typography sx={{ ...SECTION_LABEL_SX, mb: 1.25 }}>
                {rewatching ? 'Revise this first' : 'Reference material from your teacher'}
              </Typography>
            }
          />
        </Box>
      )}
    </Box>
  );
}
