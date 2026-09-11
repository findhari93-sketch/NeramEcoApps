'use client';

/**
 * /teacher/study-materials/[fileId]/recordings/[trackId]/checkpoints
 *
 * The checkpoints of one language's recording. Nested under the recording so its
 * Back returns to that recording's tab. The old address,
 * /teacher/study-materials/checkpoints/[fileId]/[trackId], redirects here from
 * next.config.js. See CheckpointWorkbench.
 */

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Box, Skeleton } from '@neram/ui';
import CheckpointWorkbench from '@/components/study-materials/checkpoints/CheckpointWorkbench';
import { parseRecordingsFrom } from '@/lib/recordings-nav';

function TrackCheckpoints() {
  const { fileId, trackId } = useParams<{ fileId: string; trackId: string }>();
  const searchParams = useSearchParams();
  return <CheckpointWorkbench fileId={fileId} trackId={trackId} from={parseRecordingsFrom(searchParams.get('from'))} />;
}

export default function TrackCheckpointsPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ p: 2 }}>
          <Skeleton variant="rounded" height={420} />
        </Box>
      }
    >
      <TrackCheckpoints />
    </Suspense>
  );
}
