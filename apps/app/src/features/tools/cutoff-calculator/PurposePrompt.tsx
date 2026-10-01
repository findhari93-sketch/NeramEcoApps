'use client';

import { useState, useId } from 'react';
import ButtonBase from '@mui/material/ButtonBase';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Collapse,
  Alert,
  alpha,
} from '@neram/ui';
import type { CalculationPurpose } from '@neram/database';

// ─── Purpose options ─────────────────────────────────────────────────────────

type ToneKey = 'success' | 'primary' | 'warning' | 'neutral';

interface PurposeOption {
  value: CalculationPurpose;
  label: string;
  description: string;
  tone: ToneKey;
}

const PURPOSE_OPTIONS: PurposeOption[] = [
  {
    value: 'actual_score',
    label: 'This is my actual score',
    description: 'I filled in my real board marks and NATA scores',
    tone: 'success',
  },
  {
    value: 'prediction',
    label: "I'm predicting or planning",
    description: 'Estimating what my score might be',
    tone: 'primary',
  },
  {
    value: 'target',
    label: 'Testing a target I want to achieve',
    description: 'I entered a goal score I want to reach',
    tone: 'warning',
  },
  {
    value: 'exploring',
    label: 'Just exploring',
    description: 'Trying to understand how the cutoff works',
    tone: 'neutral',
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface PurposePromptProps {
  /** How many total calculations this user has made (from useScoreAutoSave) */
  calculationCount: number;
  /** The ID returned from the auto-save. Non-null when a calc was just saved. */
  savedCalcId: string | null;
  isLoggedIn: boolean;
  /** Resolve false when saving failed so the prompt can stay open with an error. */
  onPurposePicked: (purpose: CalculationPurpose, label?: string) => Promise<boolean> | void;
  isUpdating: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Asks what a saved calculation is for. Always an inline card below the
 * results (phone and laptop), never a modal sheet over them.
 */
export function PurposePrompt({
  calculationCount,
  savedCalcId,
  isLoggedIn,
  onPurposePicked,
  isUpdating,
}: PurposePromptProps) {
  const [selected, setSelected] = useState<CalculationPurpose | null>(null);
  const [showLabel, setShowLabel] = useState(false);
  const [label, setLabel] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [failed, setFailed] = useState(false);
  const headingId = useId();

  // Only render when we have a saved calc and the user is logged in
  if (!isLoggedIn || !savedCalcId || dismissed) return null;

  const isRepeat = calculationCount >= 2;

  function handleSelect(value: CalculationPurpose) {
    setSelected(value);
    setShowLabel(true);
    setFailed(false);
  }

  async function handleSave() {
    if (!selected) return;
    const result = await onPurposePicked(selected, label.trim() || undefined);
    if (result === false) {
      setFailed(true);
      return;
    }
    setDismissed(true);
  }

  return (
    <Paper
      component="section"
      aria-labelledby={headingId}
      sx={{
        mt: 2,
        p: { xs: 2, md: 2.5 },
        borderColor: 'primary.light',
        bgcolor: 'action.hover',
      }}
    >
      {/* Header */}
      <Typography id={headingId} variant="subtitle1" component="h2" fontWeight={700} sx={{ mb: 0.5 }}>
        {isRepeat
          ? `You've calculated ${calculationCount} times. What's this one for?`
          : 'What are you using this score for?'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {isRepeat
          ? 'Help us understand your journey so we can give you better guidance.'
          : 'Optional. It helps us tailor your guidance.'}
      </Typography>

      {/* Purpose options */}
      <Box
        role="radiogroup"
        aria-labelledby={headingId}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}
      >
        {PURPOSE_OPTIONS.map((opt) => {
          const isActive = selected === opt.value;
          return (
            <ButtonBase
              key={opt.value}
              role="radio"
              aria-checked={isActive}
              onClick={() => handleSelect(opt.value)}
              sx={(theme) => {
                const main =
                  opt.tone === 'neutral' ? theme.palette.text.secondary : theme.palette[opt.tone].main;
                return {
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  gap: 1.5,
                  px: 2,
                  py: 1.25,
                  minHeight: 56,
                  borderRadius: 1.5,
                  border: '1.5px solid',
                  borderColor: isActive ? main : 'divider',
                  bgcolor: isActive ? alpha(main, 0.1) : 'background.paper',
                  transition: 'border-color 0.15s, background-color 0.15s',
                  '&:hover': { borderColor: main },
                };
              }}
            >
              {isActive ? (
                <CheckCircleRoundedIcon
                  sx={{ color: opt.tone === 'neutral' ? 'text.secondary' : `${opt.tone}.main`, flexShrink: 0 }}
                />
              ) : (
                <RadioButtonUncheckedRoundedIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  component="span"
                  variant="body2"
                  fontWeight={isActive ? 700 : 600}
                  sx={{ display: 'block', color: 'text.primary', lineHeight: 1.35 }}
                >
                  {opt.label}
                </Typography>
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', lineHeight: 1.35 }}
                >
                  {opt.description}
                </Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>

      {/* Optional label input */}
      <Collapse in={showLabel}>
        <TextField
          fullWidth
          label="Note (optional)"
          placeholder='For example "My first attempt"'
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          inputProps={{ maxLength: 120 }}
          sx={{ mb: 1.5 }}
        />
      </Collapse>

      {failed && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          Could not save your answer. Check your connection and try again.
        </Alert>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={() => setDismissed(true)} sx={{ color: 'text.secondary' }}>
          Skip
        </Button>
        <Button
          variant="contained"
          disabled={!selected || isUpdating}
          onClick={handleSave}
          sx={{ minWidth: 96 }}
        >
          {isUpdating ? 'Saving…' : failed ? 'Try again' : 'Save'}
        </Button>
      </Box>
    </Paper>
  );
}
