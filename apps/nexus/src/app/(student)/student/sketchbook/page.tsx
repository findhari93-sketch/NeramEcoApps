'use client';

import { useCallback, useState } from 'react';
import { Box } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import SketchbookView from '@/components/sketchbook/SketchbookView';
import AddSketchSheet from '@/components/sketchbook/AddSketchSheet';
import { setOptOut } from '@/components/sketchbook/sketchbook-api';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { istDate } from '@/lib/sketchbook-rhythm';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

export default function StudentSketchbookPage() {
  const { getToken } = useNexusAuthContext();
  const [month, setMonth] = useState(() => istDate(new Date()).slice(0, 7));
  const [adding, setAdding] = useState(false);
  const { data, isLoading, mutate } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/me?month=${month}`);

  const onOptOutChange = useCallback(async (optOut: boolean) => {
    await setOptOut(getToken, optOut);
    await mutate();
  }, [getToken, mutate]);

  return (
    <Box sx={{ pb: 10 }}>
      <PageHeader title="Sketchbook" subtitle="Draw often. Small sketches count." backHref="/student/dashboard" />
      <SketchbookView
        payload={data ?? null}
        loading={isLoading}
        mode="own"
        month={month}
        onMonthChange={setMonth}
        hrefFor={(s) => `/student/sketchbook/${s.id}`}
        onAdd={() => setAdding(true)}
        onOptOutChange={onOptOutChange}
      />
      <AddSketchSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          setMonth(istDate(new Date()).slice(0, 7));
          void mutate();
        }}
      />
    </Box>
  );
}
