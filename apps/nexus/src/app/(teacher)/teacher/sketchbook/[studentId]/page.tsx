'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Box } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import SketchbookView from '@/components/sketchbook/SketchbookView';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import { istDate } from '@/lib/sketchbook-rhythm';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

/** A teacher's peek at one student's sketchbook: the same view the student sees, read only. */
export default function TeacherStudentSketchbookPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { factsFor } = useStudentStageFacts();
  const [month, setMonth] = useState(() => istDate(new Date()).slice(0, 7));
  const { data, isLoading } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/students/${studentId}?month=${month}`);
  const name = factsFor(studentId)?.name || 'Student';

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader title={`${name}'s sketchbook`} subtitle={data?.classroom?.name} backHref="/teacher/sketchbook" />
      <SketchbookView
        payload={data ?? null}
        loading={isLoading}
        mode="teacher"
        month={month}
        onMonthChange={setMonth}
        hrefFor={(s) => `/teacher/sketchbook/${studentId}/${s.id}`}
      />
    </Box>
  );
}
