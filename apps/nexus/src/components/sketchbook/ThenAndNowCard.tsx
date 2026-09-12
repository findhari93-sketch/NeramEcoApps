'use client';

import { Box, Paper, Typography } from '@neram/ui';
import type { SketchbookSketchRow } from '@neram/database/queries/nexus';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** First sketch beside the latest. Shown only when the engine says growth is visible (8+ sketches, 30+ days). */
export default function ThenAndNowCard({ first, latest }: { first: SketchbookSketchRow; latest: SketchbookSketchRow }) {
  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
      <Typography variant="overline" color="text.secondary">Then and now</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1 }}>
        {[{ label: 'Then', s: first }, { label: 'Now', s: latest }].map(({ label, s }) => (
          <Box key={label}>
            <Box component="img" src={s.thumbnail_url || s.original_image_url} alt={`${label}, ${fmt(s.submitted_at)}`} loading="lazy" width={400} height={400}
              sx={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 1.5, display: 'block' }} />
            <Typography variant="caption" color="text.secondary">{label}, {fmt(s.submitted_at)}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
