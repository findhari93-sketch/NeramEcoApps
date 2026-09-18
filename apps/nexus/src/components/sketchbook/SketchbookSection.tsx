'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Box, Button, Skeleton } from '@neram/ui';
import ProfileSection from '@/components/students/profile/ProfileSection';
import RhythmCard from './RhythmCard';
import SketchGrid from './SketchGrid';
import { useAuthSWR } from '@/lib/nexus-swr';
import { daysBetween, istDate, weekStart } from '@/lib/sketchbook-rhythm';
import { sketchbookReviewHref } from '@/lib/review-context';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

/** The peek from a student's profile: this week, six recent tiles, one door. Fetches only once opened. */
export default function SketchbookSection({ studentId }: { studentId: string }) {
  const [opened, setOpened] = useState(false);
  const { data, isLoading } = useAuthSWR<SketchbookPayload>(opened ? `/api/sketchbook/students/${studentId}` : null);
  const today = istDate(new Date());
  const headline = data ? `${data.rhythm.week.count} of ${data.goal} this week` : null;

  return (
    <ProfileSection id="profile-sketchbook" title="Sketchbook" headline={headline} onFirstOpen={() => setOpened(true)}>
      {!data || isLoading ? (
        <Skeleton variant="rounded" height={200} sx={{ borderRadius: 2 }} />
      ) : (
        <Box>
          <RhythmCard rhythm={data.rhythm} todayIndex={daysBetween(weekStart(today), today)} />
          <SketchGrid sketches={data.sketches.slice(0, 6)} hrefFor={(s) => sketchbookReviewHref(s.id, studentId)} viewer="teacher"
            emptyTitle="No sketches yet" emptyDescription="Nothing has been added to this sketchbook this month." />
          <Button component={Link} href={`/teacher/sketchbook/${studentId}`} variant="outlined" sx={{ mt: 2, minHeight: 48 }}>
            Open sketchbook
          </Button>
        </Box>
      )}
    </ProfileSection>
  );
}
