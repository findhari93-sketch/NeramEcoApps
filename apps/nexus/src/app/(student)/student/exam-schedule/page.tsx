'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ExamScheduleRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/student/exams?tab=schedule');
  }, [router]);
  return null;
}
