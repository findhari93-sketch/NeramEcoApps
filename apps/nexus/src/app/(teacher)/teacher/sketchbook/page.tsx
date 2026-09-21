'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNavBadges } from '@/components/NavBadgeProvider';
import DrawingsHubShell from '@/components/drawings/DrawingsHubShell';
import FlipThrough from '@/components/sketchbook/FlipThrough';
import ClassRhythmList from '@/components/sketchbook/ClassRhythmList';
import { HUB_PATH, activeHubTab, type HubTabKey } from '@/lib/drawings-hub';
import { patchQuery, readSearch } from '@/lib/list-url-state';
import { useDraftSweep } from '@/hooks/useDraftSweep';

/**
 * The Drawings hub, teacher side. The path stays /teacher/sketchbook: Teams
 * feature cards, the evening digest and the sender callback all point here, and
 * the label is the part a teacher reads.
 */
export default function TeacherDrawingsPage() {
  useDraftSweep();
  const { activeClassroom } = useNexusAuthContext();
  const { getBadgeCount } = useNavBadges();
  const [tab, setTab] = useState<HubTabKey>('flip');
  const pending = getBadgeCount(HUB_PATH.teacher);

  // ?view=rhythm opens Class rhythm, so the evening digest and Back both land
  // where they should. Read after mount (no useSearchParams, see list-url-state).
  useEffect(() => {
    const next = activeHubTab('teacher', HUB_PATH.teacher, readSearch());
    if (next) setTab(next);
  }, []);

  const select = (next: HubTabKey) => {
    setTab(next);
    // The first tab is paramless, so a bare /teacher/sketchbook opens it.
    patchQuery({ view: next === 'flip' ? null : next });
  };

  if (!activeClassroom) {
    return (
      <Box>
        <PageHeader title="Drawings" backHref="/teacher/dashboard" />
        <Typography color="text.secondary">Pick a classroom from the top bar to flip through its sketchbooks.</Typography>
      </Box>
    );
  }

  return (
    <DrawingsHubShell
      role="teacher"
      active={tab}
      subtitle={activeClassroom.name}
      backHref="/teacher/dashboard"
      countFor={(key) => (key === 'flip' ? pending : undefined)}
      onSelect={select}
    >
      {tab === 'rhythm'
        ? <ClassRhythmList classroomId={activeClassroom.id} />
        : <FlipThrough classroomId={activeClassroom.id} />}
    </DrawingsHubShell>
  );
}
