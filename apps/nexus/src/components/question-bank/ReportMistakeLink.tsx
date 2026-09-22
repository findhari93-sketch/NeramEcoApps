'use client';

/**
 * The line under a solution: "Report a mistake", or "You reported this", and
 * above it, when enough students have reported this part, a plain warning so
 * nobody else learns the mistake while a teacher checks.
 *
 * The warning is text on a light tint, not a warning Alert: the theme's
 * warning Alert text sits near 3.5:1, under the 4.5:1 body text needs.
 */
import { useEffect, useState } from 'react';
import { Box, Button, Typography, alpha, useTheme } from '@neram/ui';
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { QBReportSource, QBReportStatusEntry, QBReportTarget } from '@neram/database';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { reportTargetWord, sameReportTarget, type ReportTargetOption } from '@/lib/report-targets';
import ReportSolutionSheet, { type ReportSent } from './ReportSolutionSheet';
import { useSolutionReportScope } from './SolutionReportScope';

export interface ReportMistakeLinkProps {
  questionId: string;
  /** The part this link sits under. */
  target: QBReportTarget;
  partLabel?: string | null;
  /** Everything reportable on this question, so the sheet can switch parts. */
  targets: ReportTargetOption[];
  isMcq: boolean;
  source: QBReportSource;
  testId?: string | null;
  /** Defaults to the surrounding SolutionReportScope's answer for this question. */
  status?: QBReportStatusEntry;
  onReported?: (sent: ReportSent) => void;
  /** The button's words. "Report a mistake" unless the spot calls for another. */
  label?: string;
  /**
   * One link for several parts (a drawing split into parts): the sheet asks
   * which part, and the warning shows if any part is flagged.
   */
  anyPart?: boolean;
}

export default function ReportMistakeLink({
  questionId,
  target,
  partLabel = null,
  targets,
  isMcq,
  source,
  testId = null,
  status,
  onReported,
  label = 'Report a mistake',
  anyPart = false,
}: ReportMistakeLinkProps) {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [open, setOpen] = useState(false);
  const here = { target, partLabel };

  // The scope loads the status once the first link is on screen.
  const scope = useSolutionReportScope();
  const activate = scope?.activate;
  useEffect(() => {
    activate?.();
  }, [activate]);
  const known = status ?? scope?.statusFor(questionId);

  // With several parts behind one link, the student may still have another
  // part to report, so the link stays; the sheet says if a part is a repeat.
  const reportedByMe = !anyPart && (known?.mine.some((m) => sameReportTarget(m, here)) ?? false);
  const flagged = anyPart
    ? (known?.flagged.length ?? 0) > 0
    : known?.flagged.some((f) => sameReportTarget(f, here)) ?? false;

  return (
    <Box sx={{ mt: 1 }}>
      {flagged && (
        <Box
          role="note"
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0.75,
            px: 1.25,
            py: 1,
            mb: 0.5,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.warning.main, 0.1),
          }}
        >
          <InfoOutlinedIcon aria-hidden sx={{ fontSize: 18, mt: 0.25, color: 'text.primary' }} />
          <Typography variant="body2" color="text.primary">
            {anyPart
              ? 'Some students think a solution here has a mistake. A teacher is checking it.'
              : `Some students think this ${reportTargetWord(target)} has a mistake. A teacher is checking it.`}
          </Typography>
        </Box>
      )}

      {reportedByMe ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 44, color: 'success.dark' }}>
          <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 18 }} />
          <Typography variant="body2" fontWeight={600}>
            You reported this. We will let you know.
          </Typography>
        </Box>
      ) : (
        <Button
          size="small"
          startIcon={<OutlinedFlagIcon sx={{ fontSize: 18 }} />}
          onClick={() => setOpen(true)}
          sx={{ minHeight: 44, ml: -1, textTransform: 'none', color: 'text.secondary', fontWeight: 600 }}
        >
          {label}
        </Button>
      )}

      <ReportSolutionSheet
        open={open}
        onClose={() => setOpen(false)}
        questionId={questionId}
        targets={targets}
        initialTarget={anyPart ? null : here}
        isMcq={isMcq}
        source={source}
        testId={testId}
        getToken={getToken}
        onSent={(sent) => {
          scope?.markReported(questionId, sent);
          onReported?.(sent);
        }}
      />
    </Box>
  );
}
