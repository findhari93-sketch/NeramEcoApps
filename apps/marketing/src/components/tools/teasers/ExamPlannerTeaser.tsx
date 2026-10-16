'use client';

import { useEffect, useState } from 'react';
import { CtaButton, QuickCheck, QuickCheckResult } from '@/design-system';

const FULL_TOOL = 'https://app.neramclasses.com/tools/nata/exam-planner';

const NATA_EXAM_DATE = new Date('2026-04-12T09:00:00+05:30');

export default function ExamPlannerTeaser() {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    const now = new Date();
    const diff = NATA_EXAM_DATE.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    setDaysLeft(days);
  }, []);

  return (
    <QuickCheck title="NATA 2026 countdown" headingId="exam-planner-quick-check">
      {daysLeft === null ? (
        <QuickCheckResult label="Days until NATA 2026 exam" summary="Calculating..." />
      ) : daysLeft > 0 ? (
        <QuickCheckResult value={daysLeft} label="days until NATA 2026 exam" summary="Exam date: 12 April 2026, 9:00 AM IST" />
      ) : (
        <QuickCheckResult summary="NATA 2026 exam has taken place. Check results and counseling dates." />
      )}

      <CtaButton href={FULL_TOOL} external fullWidth>
        Get a personalized study plan
      </CtaButton>
    </QuickCheck>
  );
}
