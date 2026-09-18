'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Box } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import SketchbookView from '@/components/sketchbook/SketchbookView';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import { istDate } from '@/lib/sketchbook-rhythm';
import { patchQuery, readSearch } from '@/lib/list-url-state';
import { sketchbookReviewHref } from '@/lib/review-context';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

/**
 * A teacher's view of one student's sketchbook: every drawing on its date, each
 * opening in the one review screen. The month lives in the address (?month=) so
 * Back from a review lands on the month the teacher was looking at.
 */
export default function TeacherStudentSketchbookPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { factsFor } = useStudentStageFacts();
  const [month, setMonth] = useState(() => istDate(new Date()).slice(0, 7));
  useEffect(() => {
    const asked = new URLSearchParams(readSearch()).get('month');
    if (asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked)) setMonth(asked);
  }, []);
  const changeMonth = (next: string) => {
    setMonth(next);
    patchQuery({ month: next });
  };
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
        onMonthChange={changeMonth}
        hrefFor={(s) => sketchbookReviewHref(s.id, studentId, month)}
      />
    </Box>
  );
}
