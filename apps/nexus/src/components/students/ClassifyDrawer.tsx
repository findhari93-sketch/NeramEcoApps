'use client';

import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
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
import {
  LANGUAGES,
  LANGUAGE_ORDER,
  LANGUAGE_SCOPE_NOTE,
  LANGUAGE_SECTION_HELP,
  LANGUAGE_SECTION_TITLE,
  LANGUAGE_UNCHANGED_LABEL,
  LIMITED_ENGLISH_BULK_NOTE,
  LIMITED_ENGLISH_HELP,
  LIMITED_ENGLISH_LABEL,
  languageLabel,
  type LanguageKey,
} from '@/lib/student-language';
import { DormantIcon, stageIconFor } from './StageGlyph';
import LanguageMark from './LanguageMark';

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

/**
 * The Language select values. '' leaves the language alone, like the exam year.
 *
 * There is no "clear" option on purpose: an unrecorded student reads as English
 * everywhere, so clearing would be a change nobody could see. Undo still sends
 * null through the API to put one back.
 */
type LanguageChoice = '' | LanguageKey;

export interface ClassifyPayload {
  studyStage?: StageKey | null;
  academicYear?: string | null;
  homeLanguage?: LanguageKey | null;
  limitedEnglish?: boolean;
  participationStatus?: 'active' | 'dormant';
  reason?: string;
}

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
  /** One student's current language, shown as "Now: ..." above the choices. */
  currentLanguage?: string | null;
  currentLimitedEnglish?: boolean;
  /**
   * Open already scrolled to the Language group, for the profile's language chip.
   * The group sits below the exam year, off screen on a phone.
   */
  focus?: 'language';
  onClose: () => void;
  onApply: (payload: ClassifyPayload) => void;
}

export default function ClassifyDrawer({
  open,
  mode,
  names,
  busy = false,
  examYears = [],
  currentBatch = null,
  currentLanguage,
  currentLimitedEnglish,
  focus,
  onClose,
  onApply,
}: ClassifyDrawerProps) {
  const theme = useTheme();
  const paletteMode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const [stage, setStage] = useState<StageKey | null>(null);
  const [year, setYear] = useState('');
  const [lang, setLang] = useState<LanguageChoice>('');
  // Null means untouched, which is what a bulk edit needs: leave every student's
  // tick exactly as it is. Any interaction commits a real boolean.
  const [limited, setLimited] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const languageRef = useRef<HTMLDivElement>(null);

  // Reset every time the sheet opens, so a previous selection can never be
  // applied by accident to a different set of students.
  useEffect(() => {
    if (open) {
      setStage(null);
      setYear('');
      setLang('');
      setLimited(null);
      setReason('');
    }
  }, [open, mode]);

  const count = names.length;
  const who = count === 1 ? names[0] : `${count} students`;

  // The fields are independent: any one alone is a valid edit. Requiring them all
  // would force a teacher who only knows the class to guess the year.
  const canApply =
    mode === 'stage'
      ? stage !== null || year !== '' || lang !== '' || limited !== null
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
      const payload: ClassifyPayload = {};
      // Only send what was actually touched. An untouched field must stay
      // untouched: the API treats a present key as an instruction to write.
      if (stage !== null) payload.studyStage = stage === 'unset' ? null : stage;
      if (year !== '') payload.academicYear = year === CLEAR_YEAR ? null : year;
      if (lang !== '') payload.homeLanguage = lang;
      if (limited !== null) payload.limitedEnglish = limited;
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
      // Scroll once the slide has finished, so the measurement is of the final
      // layout. No timer, and a no-op in jsdom where scrollIntoView is absent.
      SlideProps={{
        onEntered: () => {
          if (focus === 'language') languageRef.current?.scrollIntoView?.({ block: 'center' });
        },
      }}
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

            {/* Language: a third independent field, below the exam year so the
                class and year controls keep their place on a 375px screen. */}
            <Divider sx={{ mt: 1 }} />

            <Box ref={languageRef} sx={{ display: 'flex', flexDirection: 'column', gap: 1, scrollMarginTop: 16 }}>
              {/* A select rather than tiles: five languages plus "leave
                  unchanged" is six options, and the exam-year field directly
                  above already solves that shape on a 375px sheet. Its own label
                  heads the section, exactly as the exam year's does. */}
              <TextField
                select
                size="small"
                label={LANGUAGE_SECTION_TITLE}
                value={lang}
                onChange={(e) => setLang(e.target.value as LanguageChoice)}
                helperText={LANGUAGE_SECTION_HELP}
                SelectProps={{
                  native: false,
                  // On the display element, so a test can reach the field itself
                  // rather than the menu, which shares its label while open. MUI
                  // types this slot as bare HTMLAttributes, which has no data-*.
                  SelectDisplayProps: { 'data-testid': 'language-select' } as HTMLAttributes<HTMLDivElement>,
                }}
                sx={{ mt: 0.5, '& .MuiInputBase-root': { minHeight: 48 } }}
              >
                <MenuItem value="">
                  <em>{LANGUAGE_UNCHANGED_LABEL}</em>
                </MenuItem>
                {LANGUAGE_ORDER.map((key) => (
                  <MenuItem key={key} value={key} sx={{ minHeight: 48, gap: 1 }}>
                    {/* The mark beside the word is where a teacher learns which
                        letter means which language. English has none, so it keeps
                        the space rather than shuffling its label left. */}
                    <Box
                      component="span"
                      sx={{ width: 20, flexShrink: 0, display: 'inline-flex', justifyContent: 'center' }}
                    >
                      <LanguageMark language={key} size={20} />
                    </Box>
                    {LANGUAGES[key].label}
                  </MenuItem>
                ))}
              </TextField>

              {count === 1 && currentLanguage !== undefined && (
                <Typography variant="caption" sx={{ fontWeight: 600, mt: -1 }}>
                  Now: {languageLabel(currentLanguage, currentLimitedEnglish)}
                </Typography>
              )}

              <FormControlLabel
                sx={{ m: 0, minHeight: 48 }}
                control={
                  <Checkbox
                    checked={limited ?? currentLimitedEnglish ?? false}
                    onChange={(e) => setLimited(e.target.checked)}
                    inputProps={{ 'aria-label': LIMITED_ENGLISH_LABEL }}
                  />
                }
                label={
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                    <LanguageMark language="english" limitedEnglish size={18} />
                    <Box component="span" sx={{ fontSize: '0.88rem', fontWeight: 700 }}>
                      {LIMITED_ENGLISH_LABEL}
                    </Box>
                  </Box>
                }
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                {LIMITED_ENGLISH_HELP}
                {count > 1 && limited === null ? ` ${LIMITED_ENGLISH_BULK_NOTE}` : ''}
              </Typography>

              {(lang !== '' || limited !== null) && (
                <Typography variant="caption" color="text.secondary">
                  {LANGUAGE_SCOPE_NOTE}
                </Typography>
              )}
            </Box>
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
