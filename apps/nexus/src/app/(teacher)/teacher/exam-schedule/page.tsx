'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TeacherExamScheduleRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/teacher/exams');
  }, [router]);
  return null;
}
