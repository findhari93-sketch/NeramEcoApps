'use client';

import Link from 'next/link';
import { Box, Button, Paper, Skeleton, Typography } from '@neram/ui';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import RhythmDots from './RhythmDots';
import { rhythmLine, type Rhythm } from '@/lib/sketchbook-rhythm';

/**
 * The dashboard's door to the sketchbook. Self-fetching (summary only) so the
 * 900-line dashboard fetch stays untouched, and gone entirely when the flag is
 * off so nothing on the dashboard points at a page FeatureGate would refuse.
 */
export default function SketchbookHomeCard() {
  const { isFeatureEnabled } = useNexusAuthContext();
  const enabled = isFeatureEnabled('student.sketchbook');
  const { data, isLoading, error } = useAuthSWR<{ rhythm: Rhythm }>(enabled ? '/api/sketchbook/me?summary=1' : null);
  if (!enabled) return null;
  // An optional dashboard card must never hold a permanent skeleton: the
  // sketchbook page itself is where a fetch failure is shown for real.
  if (error) return null;
  if (isLoading || !data) return <Skeleton variant="rounded" height={96} sx={{ borderRadius: 2, mb: 2 }} />;

  const r = data.rhythm;
  const fresh = r.totalDays === 0;
  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <AutoStoriesOutlinedIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Sketchbook</Typography>
      </Box>
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        {fresh ? 'Draw something today' : rhythmLine(r)}
      </Typography>
      {!fresh && <RhythmDots days={r.week.days} size={14} />}
      <Button component={Link} href="/student/sketchbook" variant={fresh ? 'contained' : 'text'} sx={{ mt: 1, minHeight: 48 }}>
        Open sketchbook
      </Button>
    </Paper>
  );
}
