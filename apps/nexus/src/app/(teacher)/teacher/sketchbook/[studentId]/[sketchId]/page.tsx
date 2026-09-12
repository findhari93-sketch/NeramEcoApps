'use client';

import { useParams } from 'next/navigation';
import { Box, Skeleton, EmptyState } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import SketchPageView from '@/components/sketchbook/SketchPageView';
import TeacherSketchActions from '@/components/sketchbook/TeacherSketchActions';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

/** One sketch, opened from a teacher's peek at a student's sketchbook. */
export default function TeacherSketchPage() {
  const { studentId, sketchId } = useParams<{ studentId: string; sketchId: string }>();
  const { getToken } = useNexusAuthContext();
  const { factsFor } = useStudentStageFacts();
  const { data, isLoading, error, mutate } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/students/${studentId}?sketch=${sketchId}`);
  const sketch = data?.sketches.find((s) => s.id === sketchId) ?? null;

  if (isLoading) return <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />;
  if (error || !sketch) {
    return (
      <Box>
        <PageHeader title="Sketch" backHref={`/teacher/sketchbook/${studentId}`} />
        <EmptyState title="Sketch not found" description="It may have been deleted." />
      </Box>
    );
  }

  return (
    <Box>
      <SketchPageView
        sketch={sketch}
        mode="teacher"
        backHref={`/teacher/sketchbook/${studentId}`}
        getToken={getToken}
        studentName={factsFor(studentId)?.name || null}
        actions={
          <TeacherSketchActions sketchId={sketch.id} reaction={sketch.reaction} featured={sketch.featured} selfNote={sketch.self_note} onChanged={() => mutate()} />
        }
      />
    </Box>
  );
}
