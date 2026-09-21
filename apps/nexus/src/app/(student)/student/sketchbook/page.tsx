'use client';

import { useCallback, useEffect, useState } from 'react';
import { patchQuery, readSearch } from '@/lib/list-url-state';
import { Box } from '@neram/ui';
import DrawingsHubShell from '@/components/drawings/DrawingsHubShell';
import SketchbookView from '@/components/sketchbook/SketchbookView';
import AddSketchSheet from '@/components/sketchbook/AddSketchSheet';
import { setOptOut, setShareOptOut } from '@/components/sketchbook/sketchbook-api';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { HUB_PATH, activeHubTab, type HubTabKey } from '@/lib/drawings-hub';
import { istDate } from '@/lib/sketchbook-rhythm';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

/**
 * The Drawings hub, student side. The path stays /student/sketchbook: the
 * notification bell, the reminder cron and every sketch page link here, and
 * /student/drawings is still the retired tree with live Question Bank pages
 * under it.
 */
export default function StudentDrawingsPage() {
  const { getToken } = useNexusAuthContext();
  const [month, setMonth] = useState(() => istDate(new Date()).slice(0, 7));
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<HubTabKey>('mine');
  const { data, isLoading, mutate } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/me?month=${month}`);

  // A reminder's "Add a sketch" button lands here with ?add=1: open the sheet
  // straight away rather than making the student find the button. The param is
  // removed so Back or a refresh does not reopen it.
  useEffect(() => {
    if (new URLSearchParams(readSearch()).get('add') === '1') {
      setAdding(true);
      patchQuery({ add: null });
    }
    const next = activeHubTab('student', HUB_PATH.student, readSearch());
    if (next) setTab(next);
  }, []);

  const select = (next: HubTabKey) => {
    setTab(next);
    patchQuery({ view: next === 'mine' ? null : next });
  };

  const onOptOutChange = useCallback(async (optOut: boolean) => {
    await setOptOut(getToken, optOut);
    await mutate();
  }, [getToken, mutate]);

  const onShareOptOutChange = useCallback(async (optOut: boolean) => {
    await setShareOptOut(getToken, optOut);
    await mutate();
  }, [getToken, mutate]);

  return (
    <DrawingsHubShell
      role="student"
      active={tab}
      subtitle="Draw often. Small sketches count."
      backHref="/student/dashboard"
      onSelect={select}
    >
      {/* Room for the Add a sketch floating button to clear the bottom nav. */}
      <Box sx={{ pb: 6 }}>
        <SketchbookView
          payload={data ?? null}
          loading={isLoading}
          mode="own"
          month={month}
          onMonthChange={setMonth}
          hrefFor={(s) => `/student/sketchbook/${s.id}`}
          onAdd={() => setAdding(true)}
          onOptOutChange={onOptOutChange}
          onShareOptOutChange={onShareOptOutChange}
        />
      </Box>
      <AddSketchSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          setMonth(istDate(new Date()).slice(0, 7));
          void mutate();
        }}
      />
    </DrawingsHubShell>
  );
}
