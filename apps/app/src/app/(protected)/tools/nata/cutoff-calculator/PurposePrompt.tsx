'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Collapse,
  Drawer,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import type { CalculationPurpose } from '@neram/database';

// ─── Purpose options ─────────────────────────────────────────────────────────

interface PurposeOption {
  value: CalculationPurpose;
  label: string;
  description: string;
  color: string;
  bg: string;
}

const PURPOSE_OPTIONS: PurposeOption[] = [
  {
    value: 'actual_score',
    label: 'This is my actual score',
    description: 'I filled in my real board marks and NATA scores',
    color: '#2E7D32',
    bg: '#F1F8E9',
  },
  {
    value: 'prediction',
    label: "I'm predicting / planning",
    description: 'Estimating what my score might be',
    color: '#1565C0',
    bg: '#E3F2FD',
  },
  {
    value: 'target',
    label: 'Testing a target I want to achieve',
    description: 'I entered a goal score I want to reach',
    color: '#E65100',
    bg: '#FFF3E0',
  },
  {
    value: 'exploring',
    label: 'Just exploring',
    description: 'Trying to understand how the cutoff works',
    color: '#616161',
    bg: '#F5F5F5',
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface PurposePromptProps {
  /** How many total calculations this user has made (from useScoreAutoSave) */
  calculationCount: number;
  /** The ID returned from the auto-save. Non-null when a calc was just saved. */
  savedCalcId: string | null;
  isLoggedIn: boolean;
  onPurposePicked: (purpose: CalculationPurpose, label?: string) => void;
  isUpdating: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PurposePrompt({
  calculationCount,
  savedCalcId,
  isLoggedIn,
  onPurposePicked,
  isUpdating,
}: PurposePromptProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [selected, setSelected] = useState<CalculationPurpose | null>(null);
  const [showLabel, setShowLabel] = useState(false);
  const [label, setLabel] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(true);

  // Only render when we have a saved calc and the user is logged in
  if (!isLoggedIn || !savedCalcId || dismissed) return null;

  const isRepeat = calculationCount >= 2;

  function handleSelect(value: CalculationPurpose) {
    setSelected(value);
    setShowLabel(true);
  }

  function handleSave() {
    if (!selected) return;
    onPurposePicked(selected, label.trim() || undefined);
    dismiss();
  }

  function dismiss() {
    setDismissed(true);
    if (isMobile) setMobileOpen(false);
  }

  // ─── Prompt body (shared between mobile sheet and desktop card) ───

  const body = (
    <Box sx={{ p: isMobile ? 2.5 : 0 }}>
      {/* Header */}
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
        {isRepeat
          ? `You've calculated ${calculationCount} times — what's this one for?`
          : 'What are you using this score for?'}
      </Typography>
      {isRepeat && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Help us understand your journey so we can give you better guidance.
        </Typography>
      )}

      {/* Purpose option buttons */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
        {PURPOSE_OPTIONS.map((opt) => {
          const isActive = selected === opt.value;
          return (
            <Box
              key={opt.value}
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(opt.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSelect(opt.value)}
              sx={{
                px: 2,
                py: 1.25,
                borderRadius: 1.5,
                border: '1.5px solid',
                borderColor: isActive ? opt.color : 'grey.200',
                bgcolor: isActive ? opt.bg : 'background.paper',
                cursor: 'pointer',
                minHeight: 48, // touch target
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                transition: 'border-color 0.15s, background-color 0.15s',
                '&:hover': {
                  borderColor: opt.color,
                  bgcolor: opt.bg,
                },
                outline: 'none',
                '&:focus-visible': {
                  boxShadow: `0 0 0 2px ${opt.color}40`,
                },
              }}
            >
              <Typography
                variant="body2"
                fontWeight={isActive ? 700 : 500}
                sx={{ color: isActive ? opt.color : 'text.primary', lineHeight: 1.3 }}
              >
                {opt.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                {opt.description}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Optional label input */}
      <Collapse in={showLabel}>
        <TextField
          size="small"
          fullWidth
          placeholder='Add a note (optional) — e.g. "My NATA 2025 attempt 1"'
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          inputProps={{ maxLength: 120 }}
          sx={{ mb: 1.5 }}
        />
      </Collapse>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}>
        <Button
          size="small"
          onClick={dismiss}
          sx={{ color: 'text.secondary', minHeight: 36 }}
        >
          Skip
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={!selected || isUpdating}
          onClick={handleSave}
          sx={{ minWidth: 88, minHeight: 36 }}
        >
          {isUpdating ? 'Saving…' : 'Save'}
        </Button>
      </Box>
    </Box>
  );

  // ─── Mobile: bottom sheet ─────────────────────────────────────────

  if (isMobile) {
    return (
      <Drawer
        anchor="bottom"
        open={mobileOpen}
        onClose={dismiss}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            pb: 'env(safe-area-inset-bottom)',
            maxHeight: '70vh',
            overflowY: 'auto',
          },
        }}
      >
        {/* Drag handle */}
        <Box
          sx={{
            width: 36,
            height: 4,
            bgcolor: 'grey.300',
            borderRadius: 2,
            mx: 'auto',
            mt: 1.5,
            mb: 0.5,
          }}
        />
        {body}
      </Drawer>
    );
  }

  // ─── Desktop: inline card below results ──────────────────────────

  return (
    <Paper
      elevation={0}
      sx={{
        mt: 2,
        p: 2.5,
        border: '1.5px solid',
        borderColor: 'primary.light',
        borderRadius: 2,
        bgcolor: 'action.hover',
      }}
    >
      {body}
    </Paper>
  );
}
