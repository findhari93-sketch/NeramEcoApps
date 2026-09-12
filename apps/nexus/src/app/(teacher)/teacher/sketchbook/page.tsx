'use client';

import { useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNavBadges } from '@/components/NavBadgeProvider';
import FlipThrough from '@/components/sketchbook/FlipThrough';
import ClassRhythmList from '@/components/sketchbook/ClassRhythmList';

export default function TeacherSketchbookPage() {
  const { activeClassroom } = useNexusAuthContext();
  const { getBadgeCount } = useNavBadges();
  const [tab, setTab] = useState<'flip' | 'rhythm'>('flip');
  const pending = getBadgeCount('/teacher/sketchbook');

  if (!activeClassroom) {
    return (
      <Box>
        <PageHeader title="Sketchbooks" backHref="/teacher/dashboard" />
        <Typography color="text.secondary">Pick a classroom from the top bar to flip through its sketchbooks.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader title="Sketchbooks" subtitle={activeClassroom.name} backHref="/teacher/dashboard" />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 48 }} aria-label="Sketchbook views">
        <Tab value="flip" label={pending ? `Flip through (${pending})` : 'Flip through'} sx={{ minHeight: 48 }} />
        <Tab value="rhythm" label="Class rhythm" sx={{ minHeight: 48 }} />
      </Tabs>
      {tab === 'flip' ? <FlipThrough classroomId={activeClassroom.id} /> : <ClassRhythmList classroomId={activeClassroom.id} />}
    </Box>
  );
}
