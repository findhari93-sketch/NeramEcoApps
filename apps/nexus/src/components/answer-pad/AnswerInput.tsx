'use client';

/**
 * The student's answer controls. Tap = lock for choices: one tap sends the
 * answer, there is no separate confirm. Typed answers lock with one button.
 * Every target is at least 64px tall, well above the 44px minimum, because a
 * phone in a moving hand is the normal case here.
 */

import { useId, useState, type FormEvent } from 'react';
import { Box, Button, Stack, TextField } from '@neram/ui';
import LockRounded from '@mui/icons-material/LockRounded';
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
  onAnswer: (answer: string) => void;
}

export default function AnswerInput({ answerType, optionCount, disabled, error, initialValue = '', onAnswer }: AnswerInputProps) {
  if (answerType === 'mcq') {
    const letters = mcqLetters(optionCount);
    return <ChoiceGrid values={letters} answerType={answerType} columns={letters.length <= 4 ? 2 : 3} disabled={disabled} onAnswer={onAnswer} />;
  }
  if (answerType === 'yesno') {
    return <ChoiceGrid values={['yes', 'no']} answerType={answerType} columns={2} disabled={disabled} onAnswer={onAnswer} />;
  }
  return <TypedAnswer numeric={answerType === 'numeric'} disabled={disabled} error={error} initialValue={initialValue} onAnswer={onAnswer} />;
}

function ChoiceGrid({
  values,
  answerType,
  columns,
  disabled,
  onAnswer,
}: {
  values: string[];
  answerType: AnswerType;
  columns: number;
  disabled: boolean;
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
        return (
          <Button
            key={value}
            variant="outlined"
            disabled={disabled}
            onClick={() => onAnswer(value)}
            aria-label={`Answer ${label}`}
            sx={{
              minHeight: 64,
              fontSize: label.length > 1 ? '1.25rem' : '1.75rem',
              fontWeight: 700,
              borderWidth: 2,
              touchAction: 'manipulation',
              '&:hover': { borderWidth: 2 },
              '&.Mui-focusVisible': { outline: '3px solid', outlineOffset: 2 },
            }}
          >
            {label}
          </Button>
        );
      })}
    </Box>
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
        startIcon={<LockRounded />}
        sx={{ minHeight: 56, touchAction: 'manipulation' }}
      >
        Lock answer
      </Button>
    </Stack>
  );
}
