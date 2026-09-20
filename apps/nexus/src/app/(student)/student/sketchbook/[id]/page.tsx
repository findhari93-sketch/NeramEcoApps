'use client';

import { useParams, useRouter } from 'next/navigation';
import { Box, Skeleton, EmptyState } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import SketchPageView from '@/components/sketchbook/SketchPageView';
import StudentDrawingReview from '@/components/sketchbook/StudentDrawingReview';
import { deleteSketch } from '@/components/sketchbook/sketchbook-api';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { canDeleteOwnSketch, type SketchbookPayload } from '@/lib/sketchbook-payload';
import type { VoiceFeedbackView } from '@/lib/drawing-voice-feedback';

interface SubmissionDetail {
  submission: { original_image_url: string; tutor_feedback: string | null; reviewed_image_url: string | null; corrected_image_url: string | null };
  practised_from: { item_id: string; title: string; image_url: string } | null;
  /** Signed, and only ever a note the teacher actually sent (see the route). */
  voice_feedback: VoiceFeedbackView | null;
}

export default function StudentSketchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const { data, isLoading, error } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/me?sketch=${id}`);
  const sketch = data?.sketches.find((s) => s.id === id) ?? null;
  const needsDetail = !!sketch && (sketch.review.state === 'reviewed' || sketch.review.state === 'redo' || !!sketch.inspiration_item_id);
  const { data: detail } = useAuthSWR<SubmissionDetail>(needsDetail ? `/api/drawing/submissions/${id}` : null);

  if (isLoading) return <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />;
  if (error || !sketch) {
    return (
      <Box>
        <PageHeader title="Drawing" backHref="/student/sketchbook" />
        <EmptyState title="Drawing not found" description="It may have been deleted." />
      </Box>
    );
  }
  return (
    <Box>
      <SketchPageView
        sketch={sketch}
        mode="own"
        backHref="/student/sketchbook"
        getToken={getToken}
        review={(
          <StudentDrawingReview
            entry={sketch}
            submission={detail?.submission ?? null}
            practisedFrom={detail?.practised_from ?? null}
            voice={detail?.voice_feedback ?? null}
            getToken={getToken}
          />
        )}
        onDelete={canDeleteOwnSketch(sketch) ? async () => {
          await deleteSketch(getToken, sketch.id);
          router.push('/student/sketchbook');
        } : undefined}
      />
    </Box>
  );
}
