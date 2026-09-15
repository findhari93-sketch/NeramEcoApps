'use client';

/**
 * How the drawing scored on each thing the teacher judges. Read-only, final
 * scores only. It sits below the teacher's words on purpose: a row of numbers
 * read first is the part a student remembers, and the note is what tells them
 * what to do about it.
 */
import { Box, Stack, Typography } from '@neram/ui';
import { RATING_LABELS } from '@/lib/drawing-prompt-templates';
import type { StudentRubric } from './types';

export default function RubricBreakdown({
  criteria,
  bands,
}: {
  criteria: StudentRubric['criteria'];
  bands: Record<string, number>;
}) {
  const rows = criteria.filter((c) => typeof bands[c.key] === 'number');
  if (rows.length === 0) return null;

  return (
    <Box component="section" aria-labelledby="how-you-scored-heading">
      <Typography id="how-you-scored-heading" component="h2" variant="subtitle2" sx={{ fontWeight: 800, mb: 1.25 }}>
        How you scored
      </Typography>
      <Stack spacing={1.5}>
        {rows.map((c) => {
          const band = bands[c.key];
          return (
            <Box key={c.key}>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {c.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, flexShrink: 0 }}>
                  {RATING_LABELS[band] ?? ''} · {band} of 5
                </Typography>
              </Stack>
              <Box
                role="meter"
                aria-valuemin={1}
                aria-valuemax={5}
                aria-valuenow={band}
                aria-label={`${c.title}: ${band} out of 5`}
                sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0.5, mt: 0.75 }}
              >
                {[1, 2, 3, 4, 5].map((step) => (
                  <Box
                    key={step}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: step <= band ? 'primary.main' : 'action.selected',
                    }}
                  />
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.4 }}>
                {c.hint}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
