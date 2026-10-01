'use client';

/**
 * The student's answer controls. One tap on a choice saves it, there is no
 * separate confirm, and tapping another choice changes it until the teacher
 * closes answers. The chosen one shows as selected (aria-pressed). Typed
 * answers save with one button. Every target is at least 64px tall, well above
 * the 44px minimum, because a phone in a moving hand is the normal case here.
 */

import { useId, useState, type FormEvent } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@neram/ui';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import { displayAnswer } from '@/lib/pad/client/format';
import { mcqLetters } from '@/lib/pad/client/teacher-view';
import type { AnswerType } from '@/lib/pad/client/types';

interface AnswerInputProps {
  answerType: AnswerType;
  optionCount: number | null;
  disabled: boolean;
  error: string | null;
  /** A typed answer to start from, such as one the server refused and the student should fix. */
  initialValue?: string;
  /** Multiple choice only: the teacher's text for each option, null where left blank. */
  optionTexts?: Array<string | null> | null;
  /** The answer shown as chosen: the one being saved, or the one the server holds. */
  selected?: string | null;
  onAnswer: (answer: string) => void;
}

export default function AnswerInput({
  answerType,
  optionCount,
  disabled,
  error,
  initialValue = '',
  optionTexts,
  selected = null,
  onAnswer,
}: AnswerInputProps) {
  if (answerType === 'mcq') {
    const letters = mcqLetters(optionCount);
    if (optionTexts?.some((text) => text)) {
      return <ChoiceList values={letters} texts={optionTexts} disabled={disabled} selected={selected} onAnswer={onAnswer} />;
    }
    return (
      <ChoiceGrid
        values={letters}
        answerType={answerType}
        columns={letters.length <= 4 ? 2 : 3}
        disabled={disabled}
        selected={selected}
        onAnswer={onAnswer}
      />
    );
  }
  if (answerType === 'yesno') {
    return <ChoiceGrid values={['yes', 'no']} answerType={answerType} columns={2} disabled={disabled} selected={selected} onAnswer={onAnswer} />;
  }
  return <TypedAnswer numeric={answerType === 'numeric'} disabled={disabled} error={error} initialValue={initialValue} onAnswer={onAnswer} />;
}

/** Shared by both choice layouts. A chosen option is filled; the rest stay outlined. */
const choiceSx = {
  minHeight: 64,
  borderWidth: 2,
  borderStyle: 'solid',
  borderColor: 'primary.main',
  touchAction: 'manipulation',
  transition: 'background-color 150ms ease, color 150ms ease',
  '&:hover': { borderWidth: 2 },
  '&.Mui-focusVisible': { outline: '3px solid', outlineOffset: 2 },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
} as const;

function ChoiceGrid({
  values,
  answerType,
  columns,
  disabled,
  selected,
  onAnswer,
}: {
  values: string[];
  answerType: AnswerType;
  columns: number;
  disabled: boolean;
  selected: string | null;
  onAnswer: (answer: string) => void;
}) {
  return (
    <Box
      role="group"
      aria-label="Choose your answer"
      sx={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 1.5 }}
    >
      {values.map((value) => {
        const label = displayAnswer(answerType, value);
        const chosen = selected === value;
        return (
          <Button
            key={value}
            variant={chosen ? 'contained' : 'outlined'}
            disabled={disabled}
            onClick={() => onAnswer(value)}
            aria-label={`Answer ${label}`}
            aria-pressed={chosen}
            startIcon={chosen ? <CheckCircleRounded aria-hidden /> : undefined}
            sx={{ ...choiceSx, fontSize: label.length > 1 ? '1.25rem' : '1.75rem', fontWeight: 700 }}
          >
            {label}
          </Button>
        );
      })}
    </Box>
  );
}

/**
 * Options with the teacher's text: one full-width row each, the letter first,
 * so a long option wraps instead of squeezing into a grid cell.
 */
function ChoiceList({
  values,
  texts,
  disabled,
  selected,
  onAnswer,
}: {
  values: string[];
  texts: Array<string | null>;
  disabled: boolean;
  selected: string | null;
  onAnswer: (answer: string) => void;
}) {
  return (
    <Stack role="group" aria-label="Choose your answer" spacing={1}>
      {values.map((value, index) => {
        const text = texts[index] ?? null;
        const chosen = selected === value;
        return (
          <Button
            key={value}
            variant={chosen ? 'contained' : 'outlined'}
            disabled={disabled}
            onClick={() => onAnswer(value)}
            aria-label={text ? `Answer ${value}, ${text}` : `Answer ${value}`}
            aria-pressed={chosen}
            endIcon={chosen ? <CheckCircleRounded aria-hidden /> : undefined}
            sx={{ ...choiceSx, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', gap: 1.5, '& .MuiButton-endIcon': { ml: 'auto' } }}
          >
            <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 800, minWidth: 28, flexShrink: 0 }}>
              {value}
            </Typography>
            {text && (
              <Typography component="span" sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                {text}
              </Typography>
            )}
          </Button>
        );
      })}
    </Stack>
  );
}

function TypedAnswer({
  numeric,
  disabled,
  error,
  initialValue,
  onAnswer,
}: {
  numeric: boolean;
  disabled: boolean;
  error: string | null;
  initialValue: string;
  onAnswer: (answer: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const helperId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onAnswer(value);
  };

  return (
    <Stack component="form" spacing={1.5} onSubmit={submit} noValidate>
      <TextField
        label={numeric ? 'Your number' : 'Your answer'}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        autoComplete="off"
        error={Boolean(error)}
        helperText={error ?? (numeric ? 'Digits, a decimal point and a minus sign.' : 'Up to 100 characters.')}
        FormHelperTextProps={{ id: helperId, role: error ? 'alert' : undefined }}
        inputProps={{
          inputMode: numeric ? 'decimal' : 'text',
          maxLength: numeric ? 30 : 100,
          'aria-describedby': helperId,
          style: { fontSize: '1.25rem' },
        }}
        fullWidth
      />
      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={disabled || !value.trim()}
        startIcon={<SaveRounded />}
        sx={{ minHeight: 56, touchAction: 'manipulation' }}
      >
        Save answer
      </Button>
    </Stack>
  );
}
