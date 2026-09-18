'use client';

import { useEffect, useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNavBadges } from '@/components/NavBadgeProvider';
import FlipThrough from '@/components/sketchbook/FlipThrough';
import ClassRhythmList from '@/components/sketchbook/ClassRhythmList';
import { patchQuery, readSearch } from '@/lib/list-url-state';
import { useDraftSweep } from '@/hooks/useDraftSweep';

type View = 'flip' | 'rhythm';

export default function TeacherSketchbookPage() {
  useDraftSweep();
  const { activeClassroom } = useNexusAuthContext();
  const { getBadgeCount } = useNavBadges();
  const [tab, setTab] = useState<View>('flip');
  const pending = getBadgeCount('/teacher/sketchbook');

  // ?view=rhythm opens Class rhythm, so the evening digest and Back both land
  // where they should. Read after mount (no useSearchParams, see list-url-state).
  useEffect(() => {
    if (new URLSearchParams(readSearch()).get('view') === 'rhythm') setTab('rhythm');
  }, []);

  const changeTab = (next: View) => {
    setTab(next);
    patchQuery({ view: next === 'rhythm' ? 'rhythm' : null });
  };

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
      <Tabs value={tab} onChange={(_, v) => changeTab(v)} sx={{ mb: 2, minHeight: 48 }} aria-label="Sketchbook views">
        <Tab value="flip" label={pending ? `Flip through (${pending})` : 'Flip through'} sx={{ minHeight: 48 }} />
        <Tab value="rhythm" label="Class rhythm" sx={{ minHeight: 48 }} />
      </Tabs>
      {tab === 'flip' ? <FlipThrough classroomId={activeClassroom.id} /> : <ClassRhythmList classroomId={activeClassroom.id} />}
    </Box>
  );
}
