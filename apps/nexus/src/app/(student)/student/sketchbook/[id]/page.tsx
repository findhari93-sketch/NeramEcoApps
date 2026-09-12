'use client';

import { useParams, useRouter } from 'next/navigation';
import { Box, Skeleton, EmptyState } from '@neram/ui';
import SketchPageView from '@/components/sketchbook/SketchPageView';
import { deleteSketch } from '@/components/sketchbook/sketchbook-api';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

export default function StudentSketchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const { data, isLoading, error } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/me?sketch=${id}`);
  const sketch = data?.sketches.find((s) => s.id === id) ?? null;

  if (isLoading) return <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />;
  if (error || !sketch) {
    return <EmptyState title="Sketch not found" description="It may have been deleted." />;
  }
  return (
    <Box>
      <SketchPageView
        sketch={sketch}
        mode="own"
        backHref="/student/sketchbook"
        getToken={getToken}
        onDelete={async () => {
          await deleteSketch(getToken, sketch.id);
          router.push('/student/sketchbook');
        }}
      />
    </Box>
  );
}
