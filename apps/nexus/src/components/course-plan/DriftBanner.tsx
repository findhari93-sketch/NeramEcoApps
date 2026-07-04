'use client';

/**
 * "You're N classes behind plan" banner, shown on Schedule and Health when
 * the flow engine detects drift (uncovered past sessions, or topics that no
 * longer fit before a pinned test). One tap converts the overflow topics to
 * self-learning; Reschedule jumps to the Builder.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, alpha } from '@neram/ui';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import type { FlowResult } from '@/lib/plan-flow';
import { entryTitle, type Entry } from './common';

export default function DriftBanner({
  planId,
  flow,
  entriesById,
  busy,
  onConvert,
}: {
  planId: string;
  flow: FlowResult;
  entriesById: Map<string, Entry>;
  busy: boolean;
  /** Convert these entries to self-learning (publish to students). */
  onConvert: (entryIds: string[]) => void;
}) {
  const router = useRouter();

  const overflow = useMemo(() => {
    const ids = new Set<string>();
    for (const w of flow.wontFit) {
      for (const id of w.entryIds) {
        const e = entriesById.get(id);
        if (e && e.entry_type === 'live_class' && e.status !== 'done') ids.add(id);
      }
    }
    return [...ids];
  }, [flow.wontFit, entriesById]);

  if (flow.behindBy === 0 && overflow.length === 0) return null;

  const nextTest = flow.wontFit.length ? entriesById.get(flow.wontFit[0].testEntryId) : null;
  const names = overflow
    .slice(0, 2)
    .map((id) => entriesById.get(id))
    .filter(Boolean)
    .map((e) => `“${entryTitle(e as Entry)}”`)
    .join(' and ');

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
        p: 1.75,
        mb: 2,
        borderRadius: 3,
        bgcolor: alpha('#F9A825', 0.1),
        border: `1px solid ${alpha('#F9A825', 0.4)}`,
      }}
    >
      <WarningAmberOutlinedIcon sx={{ color: '#B54700', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 200 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: '#7a5410' }}>
          {flow.behindBy > 0
            ? `You're ${flow.behindBy} ${flow.behindBy === 1 ? 'class' : 'classes'} behind plan`
            : 'The plan no longer fits'}
        </Typography>
        {overflow.length > 0 && (
          <Typography variant="caption" sx={{ color: '#9a6b12' }}>
            {names}
            {overflow.length > 2 ? ` and ${overflow.length - 2} more` : ''} won&apos;t fit
            {nextTest ? ` before ${entryTitle(nextTest)}` : ' before the plan target'}.
          </Typography>
        )}
      </Box>
      {overflow.length > 0 && (
        <Button
          variant="contained"
          size="small"
          disabled={busy}
          onClick={() => onConvert(overflow)}
          sx={{ minHeight: 40, bgcolor: '#5B21B6', '&:hover': { bgcolor: '#4C1D95' } }}
        >
          Move to self-learning
        </Button>
      )}
      <Button
        variant="outlined"
        size="small"
        onClick={() => router.push(`/teacher/course-plans/${planId}`)}
        sx={{ minHeight: 40, borderColor: alpha('#B54700', 0.4), color: '#7a5410' }}
      >
        Reschedule
      </Button>
    </Box>
  );
}
