'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  MenuItem,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import { expectedYearForStage } from '@neram/database';
import {
  DORMANT_EXPLAINER,
  DORMANT_REASON_PRESETS,
  EXAM_YEAR_HELP,
  EXAM_YEAR_LABEL,
  EXAM_YEAR_SCOPE_WARNING,
  SETTABLE_STAGES,
  STAGE_LABEL,
  STAGE_MEANING,
  dormantColor,
  examYearOf,
  pairMismatchColor,
  stageColor,
  type StageKey,
} from '@/lib/student-stage';
import { DormantIcon, stageIconFor } from './StageGlyph';

/**
 * The one editor for both classification axes, used by the bulk bar on the
 * students list and by the single-student detail page. Two entry points, one
 * component, so the wording and the guard rails cannot diverge.
 *
 * Bottom sheet rather than a dialog: the house pattern for this area (see the
 * watchlist page), and the only modal shape that stays thumb-reachable at 375px.
 */

export type ClassifyMode = 'stage' | 'dormant' | 'reactivate';

/** Sentinel for "clear the exam year", distinct from "leave it alone" (''). */
const CLEAR_YEAR = '__clear__';

export interface ClassifyDrawerProps {
  open: boolean;
  mode: ClassifyMode;
  /** Names of the affected students, for the header and the avatar strip. */
  names: string[];
  busy?: boolean;
  /** Selectable exam-year cohorts, from the batch registry. */
  examYears?: readonly string[];
  /** The current cohort, used to name the expected pairing. */
  currentBatch?: string | null;
  onClose: () => void;
  onApply: (payload: {
    studyStage?: StageKey | null;
    academicYear?: string | null;
    participationStatus?: 'active' | 'dormant';
    reason?: string;
  }) => void;
}

export default function ClassifyDrawer({
  open,
  mode,
  names,
  busy = false,
  examYears = [],
  currentBatch = null,
  onClose,
  onApply,
}: ClassifyDrawerProps) {
  const theme = useTheme();
  const paletteMode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const [stage, setStage] = useState<StageKey | null>(null);
  const [year, setYear] = useState('');
  const [reason, setReason] = useState('');

  // Reset every time the sheet opens, so a previous selection can never be
  // applied by accident to a different set of students.
  useEffect(() => {
    if (open) {
      setStage(null);
      setYear('');
      setReason('');
    }
  }, [open, mode]);

  const count = names.length;
  const who = count === 1 ? names[0] : `${count} students`;

  // The two fields are independent: either one alone is a valid edit. Requiring
  // both would force a teacher who only knows the class to guess the year.
  const canApply =
    mode === 'stage'
      ? stage !== null || year !== ''
      : mode === 'dormant'
        ? reason.trim().length > 0
        : true;

  // What the class implies, so a disagreement can be named rather than just felt.
  // Nothing auto-fills from this: a repeater or an early attempt is legitimate.
  const expectedYear =
    stage && stage !== 'unset' && currentBatch ? expectedYearForStage(stage, currentBatch) : null;
  const chosenYear = year === '' || year === CLEAR_YEAR ? null : year;
  const willMismatch = !!expectedYear && !!chosenYear && expectedYear !== chosenYear;

  function handleApply() {
    if (mode === 'stage') {
      const payload: {
        studyStage?: StageKey | null;
        academicYear?: string | null;
      } = {};
      // Only send what was actually touched. An untouched field must stay
      // untouched: the API treats a present key as an instruction to write.
      if (stage !== null) payload.studyStage = stage === 'unset' ? null : stage;
      if (year !== '') payload.academicYear = year === CLEAR_YEAR ? null : year;
      onApply(payload);
    } else if (mode === 'dormant') {
      onApply({ participationStatus: 'dormant', reason: reason.trim() });
    } else {
      onApply({ participationStatus: 'active' });
    }
  }

  const title =
    mode === 'stage'
      ? `Set class and exam year for ${who}`
      : mode === 'dormant'
        ? `Mark ${who} dormant`
        : `Bring ${who} back to active`;

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={() => !busy && onClose()}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88dvh' } }}
    >
      <Box sx={{ p: 2, pb: 1, display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto' }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>{title}</Typography>
          {count > 1 && (
            <Typography variant="caption" color="text.secondary">
              {names.slice(0, 4).join(', ')}
              {count > 4 ? ` and ${count - 4} more` : ''}
            </Typography>
          )}
        </Box>

        <Divider />

        {mode === 'stage' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {SETTABLE_STAGES.map((key) => {
              const k = key as StageKey;
              const color = stageColor(k, paletteMode);
              const Icon = stageIconFor(k);
              const selected = stage === k;
              return (
                <Box
                  key={k}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => setStage(k)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setStage(k);
                  }}
                  sx={{
                    // 56px: comfortably above the 48px touch minimum, and roomy
                    // enough for the meaning line that stops "Break Year" being
                    // guessed at.
                    minHeight: 56,
                    px: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    borderRadius: 2,
                    cursor: 'pointer',
                    border: `2px solid ${selected ? color : theme.palette.divider}`,
                    bgcolor: selected ? alpha(color, 0.12) : 'transparent',
                    '&:hover': { bgcolor: alpha(color, 0.08) },
                  }}
                >
                  <Icon sx={{ color, fontSize: '1.4rem' }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
                      {STAGE_LABEL[k]}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {STAGE_MEANING[k]}
                    </Typography>
                  </Box>
                </Box>
              );
            })}

            <Box
              role="button"
              tabIndex={0}
              aria-pressed={stage === 'unset'}
              onClick={() => setStage('unset')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setStage('unset');
              }}
              sx={{
                mt: 0.5,
                minHeight: 48,
                px: 1.5,
                display: 'flex',
                alignItems: 'center',
                borderRadius: 2,
                cursor: 'pointer',
                border: `1px dashed ${stage === 'unset' ? theme.palette.text.secondary : theme.palette.divider}`,
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Clear, back to Not set
              </Typography>
            </Box>

            {/* Exam year: a separate, independent field. Deliberately not derived
                from the class above, and it does not derive the class either. */}
            <Divider sx={{ mt: 1 }} />

            <TextField
              select
              size="small"
              label={EXAM_YEAR_LABEL}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              helperText={EXAM_YEAR_HELP}
              SelectProps={{ native: false }}
              sx={{ mt: 0.5, '& .MuiInputBase-root': { minHeight: 48 } }}
            >
              <MenuItem value="">
                <em>Leave unchanged</em>
              </MenuItem>
              {examYears.map((code) => (
                <MenuItem key={code} value={code}>
                  {code}
                  {code === currentBatch ? '  (current)' : ''}
                  {`  ,  writes in ${examYearOf(code) ?? '?'}`}
                </MenuItem>
              ))}
              <MenuItem value={CLEAR_YEAR}>Clear, no exam year</MenuItem>
            </TextField>

            {willMismatch && (
              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: alpha(pairMismatchColor(paletteMode), 0.1),
                  border: `1px solid ${alpha(pairMismatchColor(paletteMode), 0.35)}`,
                }}
              >
                <Typography variant="caption" sx={{ color: pairMismatchColor(paletteMode), fontWeight: 600 }}>
                  {STAGE_LABEL[stage as StageKey]} normally sits the exam in {expectedYear}. Saving{' '}
                  {chosenYear} will flag this student for a check. That is fine for a repeater or an
                  early attempt.
                </Typography>
              </Box>
            )}

            {year !== '' && (
              <Typography variant="caption" color="text.secondary">
                {EXAM_YEAR_SCOPE_WARNING}
              </Typography>
            )}
          </Box>
        )}

        {mode === 'dormant' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Box
              sx={{
                p: 1.25,
                borderRadius: 2,
                display: 'flex',
                gap: 1,
                bgcolor: alpha(dormantColor(paletteMode), 0.12),
              }}
            >
              <DormantIcon sx={{ color: dormantColor(paletteMode), fontSize: '1.2rem', mt: 0.2 }} />
              {/* Rendered from the shared constant, so this sheet, the chip
                  tooltip and the docs can never promise different things. */}
              <Typography variant="caption" sx={{ lineHeight: 1.5 }}>
                {DORMANT_EXPLAINER}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {DORMANT_REASON_PRESETS.map((preset) => (
                <Chip
                  key={preset}
                  label={preset}
                  size="small"
                  onClick={() => setReason(preset)}
                  variant={reason === preset ? 'filled' : 'outlined'}
                  color={reason === preset ? 'primary' : 'default'}
                  sx={{ minHeight: 32, cursor: 'pointer' }}
                />
              ))}
            </Box>

            <TextField
              label="Reason"
              required
              multiline
              minRows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              placeholder="Why are they pausing?"
              helperText="Recorded against their enrolment so the next person knows why they disappeared from the reports."
              fullWidth
            />
          </Box>
        )}

        {mode === 'reactivate' && (
          <Typography variant="body2" color="text.secondary">
            They will be counted again in attendance, submissions, prep readiness, the watchlist and
            automated reminders, starting now. Past figures are unchanged.
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          p: 2,
          pt: 1,
          display: 'flex',
          gap: 1,
          borderTop: `1px solid ${theme.palette.divider}`,
          // Keeps the footer clear of the iOS home indicator at 88dvh.
          pb: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 48, flex: 1 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={mode === 'dormant' ? 'warning' : 'primary'}
          onClick={handleApply}
          disabled={!canApply || busy}
          sx={{ minHeight: 48, flex: 2, fontWeight: 700 }}
        >
          {busy ? 'Saving…' : count === 1 ? 'Apply' : `Apply to ${count} students`}
        </Button>
      </Box>
    </Drawer>
  );
}
