'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import { STAGE_LABEL, examYearOf, stageColor, stageKeyOf } from '@/lib/student-stage';
import { StudentStageChip } from './StudentStageChip';

/**
 * Review sheet for what the students already told us on their application form.
 *
 * The stakeholder's instruction was to fill this in automatically. It is applied
 * on one tap, but shown first, because the last thing that wrote this data
 * automatically got it wrong for the whole classroom: the apply form's exam-year
 * answer was destroyed on the way in and a fallback stamped every applicant with
 * the current cohort. A second silent write is not what this screen needs.
 *
 * Only MISSING values are ever suggested (the API enforces that), so accepting
 * everything can never overwrite a decision a human made.
 */

export interface PrefillSuggestion {
  studentId: string;
  name: string;
  currentStage: string | null;
  currentYear: string | null;
  suggestedStage: string | null;
  suggestedYear: string | null;
  evidence: string[];
}

export interface PrefillReviewSheetProps {
  open: boolean;
  loading?: boolean;
  busy?: boolean;
  suggestions: PrefillSuggestion[];
  onClose: () => void;
  onApply: (
    assignments: { studentId: string; studyStage?: string | null; academicYear?: string | null }[],
  ) => void;
}

export default function PrefillReviewSheet({
  open,
  loading = false,
  busy = false,
  suggestions,
  onClose,
  onApply,
}: PrefillReviewSheetProps) {
  const theme = useTheme();
  const paletteMode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  // Pre-tick everything on open. The common case is "yes, all of that is right",
  // and making a teacher tick 13 boxes to reach it would defeat the point.
  useEffect(() => {
    if (open) setAccepted(new Set(suggestions.map((s) => s.studentId)));
  }, [open, suggestions]);

  function toggle(studentId: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function handleApply() {
    onApply(
      suggestions
        .filter((s) => accepted.has(s.studentId))
        .map((s) => ({
          studentId: s.studentId,
          // Only send a field that has a suggestion. An absent key means "leave
          // it alone", which is exactly right for a student whose class is
          // already set but whose year is not.
          ...(s.suggestedStage ? { studyStage: s.suggestedStage } : {}),
          ...(s.suggestedYear ? { academicYear: s.suggestedYear } : {}),
        })),
    );
  }

  const count = accepted.size;

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={() => !busy && onClose()}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88dvh' } }}
    >
      <Box sx={{ p: 2, pb: 1, display: 'flex', flexDirection: 'column', gap: 1.25, overflowY: 'auto' }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
            Fill from application form
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Only students with a missing class or exam year appear here. Nothing already
            recorded is changed.
          </Typography>
        </Box>

        <Divider />

        {loading && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            Reading application forms…
          </Typography>
        )}

        {!loading && !suggestions.length && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            Nothing to suggest. Either every student already has a class and exam year, or their
            application forms did not record one. Set them by hand from the students list.
          </Typography>
        )}

        {!loading &&
          suggestions.map((suggestion) => {
            const on = accepted.has(suggestion.studentId);
            const stageKey = stageKeyOf(suggestion.suggestedStage);
            return (
              <Box
                key={suggestion.studentId}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                onClick={() => toggle(suggestion.studentId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(suggestion.studentId);
                  }
                }}
                sx={{
                  minHeight: 56,
                  p: 1,
                  pl: 0.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 0.5,
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: `1px solid ${on ? alpha(stageColor(stageKey, paletteMode), 0.5) : theme.palette.divider}`,
                  bgcolor: on ? alpha(stageColor(stageKey, paletteMode), 0.06) : 'transparent',
                }}
              >
                <Checkbox
                  checked={on}
                  tabIndex={-1}
                  inputProps={{ 'aria-label': `Apply suggestion for ${suggestion.name}` }}
                  sx={{ p: 1 }}
                />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
                    {suggestion.name}
                  </Typography>
                  <Box
                    sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', mt: 0.25 }}
                  >
                    {suggestion.suggestedStage && (
                      <StudentStageChip stage={stageKey} density="compact" />
                    )}
                    {suggestion.suggestedYear && (
                      <Typography
                        variant="caption"
                        sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'text.secondary' }}
                      >
                        {suggestion.suggestedYear} (writes in {examYearOf(suggestion.suggestedYear)})
                      </Typography>
                    )}
                  </Box>
                  {suggestion.evidence.length > 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.25 }}
                    >
                      {suggestion.evidence.join(' · ')}
                    </Typography>
                  )}
                  {suggestion.currentStage && suggestion.suggestedYear && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Class already set to {STAGE_LABEL[stageKeyOf(suggestion.currentStage)]}, only the
                      exam year is being filled in.
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
      </Box>

      <Box
        sx={{
          p: 2,
          pt: 1.5,
          pb: 'calc(16px + env(safe-area-inset-bottom))',
          borderTop: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 1,
        }}
      >
        <Button
          variant="outlined"
          onClick={onClose}
          disabled={busy}
          sx={{ minHeight: 48, flex: { xs: 'unset', sm: 1 } }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleApply}
          disabled={busy || count === 0}
          sx={{ minHeight: 48, fontWeight: 700, flex: { xs: 'unset', sm: 2 } }}
        >
          {busy ? 'Saving…' : count === 1 ? 'Apply to 1 student' : `Apply to ${count} students`}
        </Button>
      </Box>
    </Drawer>
  );
}
