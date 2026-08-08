'use client';

import { Box, Button, LinearProgress, Paper, Typography } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { coverageGap, draftHealthCounts, syllabusCoverage } from '@/lib/test-draft-health';
import type { TestDraft } from '@/lib/test-wizard-draft';

/**
 * TEST HEALTH, for a test that does not exist yet.
 *
 * The three counts are always all shown, zeroes included. "Missing correct
 * answer 0" is a statement that the check ran; hiding a passing check would
 * leave a teacher unable to tell a clean paper from an unchecked one.
 *
 * Coverage comes from the tags the questions carry, so weak areas are named
 * rather than guessed at, and the top-up offer points at the thinnest one.
 */
export default function DraftHealthRail({
  draft,
  onAskForMore,
}: {
  draft: TestDraft;
  onAskForMore?: (slug: string, label: string) => void;
}) {
  const counts = draftHealthCounts(draft);
  const coverage = syllabusCoverage(draft).slice(0, 6);
  const gap = coverageGap(draft);

  const rows: Array<{ label: string; value: number }> = [
    { label: 'Duplicates', value: counts.duplicates },
    { label: 'Missing correct answer', value: counts.missingAnswer },
    { label: 'Images missing', value: counts.missingImage },
  ];

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', display: 'block', mb: 1.5 }}
      >
        TEST HEALTH
      </Typography>

      {rows.map((r) => (
        <Box
          key={r.label}
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75 }}
        >
          <Typography variant="body2">{r.label}</Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, color: r.value > 0 ? 'warning.dark' : 'text.secondary' }}
          >
            {r.value}
          </Typography>
        </Box>
      ))}

      {coverage.length > 0 && (
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
            Syllabus coverage
          </Typography>
          {coverage.map((c) => (
            <Box key={c.slug} sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">
                  {c.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.count}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, c.share * 100)}
                sx={{ height: 6, borderRadius: 999, mt: 0.25 }}
              />
            </Box>
          ))}

          {gap && onAskForMore && (
            <Button
              size="small"
              startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={() => onAskForMore(gap.slug, gap.label)}
              sx={{ textTransform: 'none', mt: 1, minHeight: 44 }}
            >
              Ask AI for 3 more on {gap.label.toLowerCase()}
            </Button>
          )}
        </Box>
      )}
    </Paper>
  );
}
