'use client';

import { Alert, Box, Button, Divider, Typography } from '@neram/ui';

/**
 * The "what needs fixing about this class's classification" banner.
 *
 * This is load-bearing, not decoration. In the live classroom 13 students have no
 * class set, so the default "Exam this year" segment renders about five rows.
 * Without an explanation sitting directly under the filter, a manager's first
 * reading is that most of the class has vanished, and they stop trusting the
 * screen before they have used it once.
 *
 * Three distinct problems, each with its own fix, most-actionable first:
 *
 *   mismatch  the class and the exam year contradict each other. Actively wrong
 *             data, so it leads. Caused at scale by the apply form: the exam-year
 *             answer never reached the database and a fallback stamped everyone
 *             with the current cohort, so Class 11 students read as sitting the
 *             exam this year.
 *   no_stage  nobody has recorded a class. Fixable from the application form for
 *             most students, which is why there are two buttons.
 *   no_year   a class is set but no cohort, so they belong to no exam.
 *
 * Every action is one tap to the fixed state rather than a link to documentation.
 */
export interface ClassYearIssuesProps {
  mismatchCount: number;
  noStageCount: number;
  noYearCount: number;
  /** Suggestions available from the application form. Hides the button at 0. */
  suggestionCount: number;
  canEdit: boolean;
  onReviewMismatches: () => void;
  onFixStages: () => void;
  onFixYears: () => void;
  onPrefill: () => void;
}

interface Row {
  key: string;
  message: string;
  actions: { label: string; onClick: () => void; primary?: boolean }[];
}

export default function ClassYearIssues({
  mismatchCount,
  noStageCount,
  noYearCount,
  suggestionCount,
  canEdit,
  onReviewMismatches,
  onFixStages,
  onFixYears,
  onPrefill,
}: ClassYearIssuesProps) {
  const rows: Row[] = [];

  if (mismatchCount > 0) {
    rows.push({
      key: 'mismatch',
      message: `${mismatchCount} ${plural(mismatchCount)} a class and exam year that disagree.`,
      actions: [{ label: 'Review', onClick: onReviewMismatches, primary: true }],
    });
  }

  if (noStageCount > 0) {
    rows.push({
      key: 'no_stage',
      message: `${noStageCount} ${plural(noStageCount)} no class set. Priority and reminders cannot be targeted until they do.`,
      actions: [
        ...(suggestionCount > 0
          ? [{ label: 'Fill from application form', onClick: onPrefill, primary: true }]
          : []),
        { label: 'Set classes', onClick: onFixStages, primary: suggestionCount === 0 },
      ],
    });
  }

  if (noYearCount > 0) {
    rows.push({
      key: 'no_year',
      message: `${noYearCount} ${plural(noYearCount)} no exam year, so they belong to no cohort.`,
      actions: [{ label: 'Set exam year', onClick: onFixYears }],
    });
  }

  if (!rows.length) return null;

  return (
    <Alert
      severity="warning"
      variant="outlined"
      icon={false}
      sx={{ borderRadius: 2, '& .MuiAlert-message': { py: 0.5, width: '100%' } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map((row, index) => (
          <Box key={row.key}>
            {index > 0 && <Divider sx={{ mb: 1 }} />}
            <Box
              sx={{
                display: 'flex',
                // Stacked at 375px, side by side from sm. The message and a
                // 44px-tall button do not fit one line on a phone.
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'stretch', sm: 'center' },
                gap: 1,
              }}
            >
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                {row.message}
                {!canEdit && ' Ask a manager or teacher with edit access.'}
              </Typography>
              {canEdit && (
                <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0, flexWrap: 'wrap' }}>
                  {row.actions.map((action) => (
                    <Button
                      key={action.label}
                      size="small"
                      variant={action.primary ? 'contained' : 'outlined'}
                      color="warning"
                      onClick={action.onClick}
                      sx={{ minHeight: 44, fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                      {action.label}
                    </Button>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Alert>
  );
}

function plural(count: number): string {
  return count === 1 ? 'student has' : 'students have';
}
