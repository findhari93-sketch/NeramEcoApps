'use client';

/**
 * `/question-bank` with no exam in the address.
 *
 * Every link that predates the split still points here (the nav's bottom-bar
 * tab, Back on a dozen sub-pages, the drawings page), so rather than touch them
 * all this page forwards to an exam: the one used last while it is still
 * listed, otherwise the first listed one. `replace`, not `push`, so Back from
 * the exam page does not land on a page that immediately forwards again.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Skeleton, Typography } from '@neram/ui';
import type { QBExamType } from '@neram/database';
import {
  pickQBExam,
  qbExamPath,
  readRememberedQBExam,
  type QBSurface,
} from '@/lib/qb-exam-routes';

export interface QuestionBankRedirectProps {
  surface: QBSurface;
  /** Exams this person may open. Null while that is still being worked out. */
  available: readonly QBExamType[] | null;
}

export default function QuestionBankRedirect({ surface, available }: QuestionBankRedirectProps) {
  const router = useRouter();

  useEffect(() => {
    if (!available) return;
    const exam = pickQBExam(readRememberedQBExam(), available);
    if (exam) router.replace(qbExamPath(surface, exam));
  }, [available, router, surface]);

  return (
    <Box aria-busy="true">
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', letterSpacing: 1, fontWeight: 700 }}>
        Question Bank
      </Typography>
      <Skeleton variant="text" width={200} height={40} sx={{ mb: 2 }} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 1.5,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    </Box>
  );
}
