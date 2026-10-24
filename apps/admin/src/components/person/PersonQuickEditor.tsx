'use client';

/**
 * The quick editor a click on any avatar opens: record what you just learned
 * about a person without going to their page.
 *
 *   Class      Class 10 · 11 · 12 · Break year, and for a break year the year
 *              they finished Class 12. A class the student gave on a form shows
 *              selected with "From their application"; clicking it confirms it.
 *   Language   the six languages and English, the Limited English tick, and a
 *              one-click confirm of the grey guess.
 *
 * Each pick saves at once and changes every avatar of this person on screen
 * (usePersonEdits). The sections are exported so the person pages' chips can
 * show the same controls.
 */
import Link from 'next/link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Alert,
  AvatarRing,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  LANGUAGES,
  LANGUAGE_ORDER,
  LIMITED_ENGLISH_LABEL,
  LanguageMark,
  MenuItem,
  Popover,
  Select,
  Snackbar,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  isLanguageValue,
  type AvatarRingVariant,
} from '@neram/ui';
import { BREAK_YEAR_COLOR, RING_LABEL, STANDARD_LABEL, type PersonFacts } from '@/lib/person-avatar';
import { STUDY_STAGES, twelfthYearOptions, type StudyStage } from '@/lib/person-study';
import type { LanguagePatch, StudiesPatch } from './usePersonEdits';

const FOCUS_RING = {
  '&.Mui-focusVisible, &:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
};

/** Chips are 32px tall on screen but take a 44px hit area. */
const CHIP_HIT = {
  height: 32,
  fontWeight: 600,
  position: 'relative',
  overflow: 'visible',
  '&::before': { content: '""', position: 'absolute', inset: '-6px 0' },
  ...FOCUS_RING,
} as const;

const STAGE_BUTTON_LABEL: Record<StudyStage, string> = {
  '10th': 'Class 10',
  '11th': 'Class 11',
  '12th': 'Class 12',
  gap_year: 'Break year',
};

function SectionLabel({ children, id }: { children: string; id?: string }) {
  return (
    <Typography
      id={id}
      variant="overline"
      color="text.secondary"
      sx={{ display: 'block', lineHeight: 1.6, fontWeight: 700, letterSpacing: '0.06em' }}
    >
      {children}
    </Typography>
  );
}

export function StudiesSection({
  facts,
  disabled,
  onSave,
  now = new Date(),
}: {
  facts: Partial<PersonFacts> | undefined;
  disabled?: boolean;
  onSave: (patch: StudiesPatch) => void;
  now?: Date;
}) {
  const stage = (STUDY_STAGES as readonly string[]).includes(facts?.currentStandard ?? '')
    ? (facts!.currentStandard as StudyStage)
    : null;
  const fromForm = facts?.studySource === 'application' || facts?.studySource === 'demo';
  const year = stage === 'gap_year' ? facts?.twelfthPassedYear ?? null : null;
  const years = twelfthYearOptions(now);
  const recent = years.slice(0, 3);
  const earlier = years.slice(3);

  function pickStage(next: StudyStage) {
    // Picking what is already confirmed does nothing; picking a form's answer confirms it.
    if (next === stage && !fromForm) return;
    onSave({ studyStage: next, twelfthPassedYear: next === 'gap_year' ? year : null });
  }

  function pickYear(next: number | null) {
    onSave({ studyStage: 'gap_year', twelfthPassedYear: next });
  }

  return (
    <Box>
      <SectionLabel id="person-class-label">Class</SectionLabel>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={stage}
        aria-labelledby="person-class-label"
        disabled={disabled}
        data-testid="person-class-toggle"
      >
        {STUDY_STAGES.map((s) => (
          <ToggleButton
            key={s}
            value={s}
            onClick={() => pickStage(s)}
            sx={{
              minHeight: 44,
              px: 0.5,
              fontWeight: 600,
              textTransform: 'none',
              lineHeight: 1.2,
              ...FOCUS_RING,
              ...(s === 'gap_year'
                ? { '&.Mui-selected, &.Mui-selected:hover': { bgcolor: BREAK_YEAR_COLOR, color: '#fff' } }
                : {}),
              // A form's answer is shown, not yet confirmed by staff.
              ...(fromForm && s === stage ? { '&.Mui-selected': { borderStyle: 'dashed' } } : {}),
            }}
          >
            {STAGE_BUTTON_LABEL[s]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {fromForm && stage && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {facts?.studySource === 'demo' ? 'From the demo booking.' : 'From their application.'} Click{' '}
          {STANDARD_LABEL[stage]} to confirm it.
        </Typography>
      )}

      {stage === 'gap_year' && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body2" id="person-twelfth-label" sx={{ fontWeight: 600, mb: 0.75 }}>
            Finished Class 12 in
          </Typography>
          <Box role="group" aria-labelledby="person-twelfth-label" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            {recent.map((y) => (
              <Chip
                key={y}
                label={y}
                clickable
                disabled={disabled}
                color={year === y ? 'primary' : 'default'}
                variant={year === y ? 'filled' : 'outlined'}
                aria-pressed={year === y}
                // A second click on the chosen year clears it.
                onClick={() => pickYear(year === y ? null : y)}
                sx={CHIP_HIT}
              />
            ))}
            <Select
              size="small"
              displayEmpty
              disabled={disabled}
              value={year != null && earlier.includes(year) ? String(year) : ''}
              onChange={(e) => pickYear(e.target.value ? Number(e.target.value) : null)}
              inputProps={{ 'aria-label': 'An earlier year' }}
              sx={{ minWidth: 104, height: 32, fontWeight: 600, fontSize: 14 }}
              MenuProps={{ slotProps: { paper: { sx: { maxHeight: 280 } } } }}
            >
              <MenuItem value="" sx={{ minHeight: 40 }}>
                <Typography variant="body2" color="text.secondary">
                  Earlier
                </Typography>
              </MenuItem>
              {earlier.map((y) => (
                <MenuItem key={y} value={String(y)} sx={{ minHeight: 40 }}>
                  {y}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </Box>
      )}

      {facts?.studySource === 'staff' && (
        <Button
          size="small"
          disabled={disabled}
          onClick={() => onSave({ studyStage: null })}
          sx={{ mt: 1, minHeight: 36, color: 'text.secondary', ...FOCUS_RING }}
        >
          Clear what was recorded
        </Button>
      )}
    </Box>
  );
}

export function LanguageSection({
  facts,
  disabled,
  onSave,
}: {
  facts: Partial<PersonFacts> | undefined;
  disabled?: boolean;
  onSave: (patch: LanguagePatch) => void;
}) {
  const recorded = isLanguageValue(facts?.homeLanguage) ? facts!.homeLanguage : null;
  const guess = !recorded ? facts?.guess ?? null : null;
  const limited = facts?.limitedEnglish === true;

  return (
    <Box>
      <SectionLabel id="person-language-label">Language</SectionLabel>
      {guess && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
            Likely {LANGUAGES[guess.key].label}
            {guess.from ? `, from ${guess.from}` : ''}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            disabled={disabled}
            onClick={() => onSave({ homeLanguage: guess.key })}
            sx={{ minHeight: 36, fontWeight: 700, flexShrink: 0, ...FOCUS_RING }}
          >
            Confirm {LANGUAGES[guess.key].label}
          </Button>
        </Box>
      )}
      <Box role="group" aria-labelledby="person-language-label" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {LANGUAGE_ORDER.map((key) => {
          const on = recorded === key;
          return (
            <Chip
              key={key}
              clickable
              disabled={disabled}
              aria-pressed={on}
              // A second click on the recorded language clears it, back to the guess.
              onClick={() => onSave({ homeLanguage: on ? null : key })}
              icon={key === 'english' ? undefined : <LanguageMark language={key} size={18} sx={{ ml: '6px !important' }} />}
              label={LANGUAGES[key].label}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              sx={CHIP_HIT}
            />
          );
        })}
      </Box>
      <FormControlLabel
        sx={{ mt: 0.5, mr: 0, minHeight: 44 }}
        control={
          <Checkbox
            size="small"
            checked={limited}
            disabled={disabled}
            onChange={() => onSave({ limitedEnglish: !limited })}
          />
        }
        label={<Typography variant="body2">{LIMITED_ENGLISH_LABEL}</Typography>}
      />
    </Box>
  );
}

export default function PersonQuickEditor({
  anchorEl,
  onClose,
  userId,
  name,
  ring,
  role,
  facts,
  saving,
  error,
  onClearError,
  onSaveStudies,
  onSaveLanguage,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  userId: string;
  name: string | null;
  ring: AvatarRingVariant;
  role?: string;
  facts: Partial<PersonFacts> | undefined;
  saving: boolean;
  error: string | null;
  onClearError: () => void;
  onSaveStudies: (patch: StudiesPatch) => void;
  onSaveLanguage: (patch: LanguagePatch) => void;
}) {
  const title = name?.trim() || 'Unnamed';
  return (
    <>
      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        // Clicks inside must not reach a clickable row underneath (React bubbles through portals).
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': `Edit ${title}`,
            'data-testid': 'person-quick-editor',
            sx: { width: 340, maxWidth: 'calc(100vw - 32px)', p: 2, borderRadius: 2, display: 'grid', gap: 1.5 },
          } as object,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap title={title}>
              {title}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
              <AvatarRing variant={ring} size={8}>
                <Box sx={{ width: 8, height: 8 }} />
              </AvatarRing>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {role || RING_LABEL[ring]}
              </Typography>
            </Box>
          </Box>
          <Button
            component={Link}
            href={`/crm/${userId}`}
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
            sx={{ minHeight: 36, flexShrink: 0, ...FOCUS_RING }}
          >
            Open
          </Button>
        </Box>

        <Divider />
        <StudiesSection facts={facts} disabled={saving || !facts} onSave={onSaveStudies} />
        <Divider />
        <LanguageSection facts={facts} disabled={saving || !facts} onSave={onSaveLanguage} />
      </Popover>

      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={onClearError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={onClearError}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
