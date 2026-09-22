'use client';

/**
 * Choosing the correct answer for a closed question, then revealing it.
 *
 * Three places use it: the console for the question just closed, the console
 * for a question left for later (its chip in Questions so far), and the class
 * report after the class, when the teacher has checked the answer. The counts
 * sit beside every choice, so the class's answers can inform the key when the
 * teacher is not sure of it.
 */

import { useId, useState, type FormEvent } from 'react';
import { Box, Button, CircularProgress, Stack, TextField, ToggleButton, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import HowToVoteRounded from '@mui/icons-material/HowToVoteRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { displayAnswer } from '@/lib/pad/client/format';
import { keyChoices, toggleKey } from '@/lib/pad/client/teacher-view';
import type { TeacherPrompt } from '@/lib/pad/client/types';

export type KeyPickerPrompt = Pick<TeacherPrompt, 'answer_type' | 'option_count' | 'correct_keys' | 'ungraded'>;
export type AnswerGroups = ReadonlyArray<{ value: string; count: number }>;

/** A key, or Poll / Don't grade: either lets the question be revealed. */
export function hasDecision(prompt: Pick<KeyPickerPrompt, 'correct_keys' | 'ungraded'>): boolean {
  return prompt.ungraded || (prompt.correct_keys?.length ?? 0) > 0;
}

export function AnswerBars({ prompt, groups }: { prompt: KeyPickerPrompt; groups: AnswerGroups }) {
  const theme = useTheme();
  const rows =
    prompt.answer_type === 'mcq' || prompt.answer_type === 'yesno'
      ? keyChoices(prompt, groups).map(({ value, count }) => ({ value, count }))
      : [...groups];
  const max = Math.max(1, ...rows.map((row) => row.count));

  if (rows.every((row) => row.count === 0)) {
    return (
      <Typography variant="body2" color="text.secondary">
        Nobody answered this one.
      </Typography>
    );
  }

  return (
    <Stack spacing={0.75} role="list" aria-label="Answers given">
      {rows.map((row) => (
        <Stack key={row.value} direction="row" spacing={1} alignItems="center" role="listitem">
          <Typography sx={{ width: 56, flexShrink: 0, fontWeight: 700, overflowWrap: 'anywhere' }}>{displayAnswer(prompt.answer_type, row.value)}</Typography>
          <Box sx={{ flex: 1, height: 12, borderRadius: 6, bgcolor: alpha(theme.palette.text.primary, 0.08) }} aria-hidden>
            <Box sx={{ width: `${(row.count / max) * 100}%`, height: '100%', borderRadius: 6, bgcolor: theme.palette.primary.main }} />
          </Box>
          <Typography sx={{ width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.count}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export default function AnswerKeyPicker({
  prompt,
  groups,
  busy,
  onKeys,
  onPoll,
  onReveal,
}: {
  prompt: KeyPickerPrompt;
  groups: AnswerGroups;
  /** The action in flight ('key', 'reveal', ...), or null. Every control waits while one runs. */
  busy: string | null;
  onKeys: (keys: string[]) => void;
  onPoll: () => void;
  onReveal: () => void;
}) {
  const labelId = useId();
  const [extraKey, setExtraKey] = useState('');
  const choices = keyChoices(prompt, groups);
  const typed = prompt.answer_type === 'numeric' || prompt.answer_type === 'text';
  const decided = hasDecision(prompt);

  const addKey = (event: FormEvent) => {
    event.preventDefault();
    const value = extraKey.trim();
    if (!value) return;
    const next = toggleKey(prompt.ungraded ? null : prompt.correct_keys, value);
    if (next) onKeys(next);
    setExtraKey('');
  };

  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        <Typography variant="body2" fontWeight={700} id={labelId}>
          Correct answer
        </Typography>
        <Box role="group" aria-labelledby={labelId} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 1 }}>
          {choices.map((choice) => {
            // Tapping the only key does nothing: a graded question always keeps an answer.
            const next = toggleKey(prompt.ungraded ? null : prompt.correct_keys, choice.value);
            return (
              <ToggleButton
                key={choice.value}
                value={choice.value}
                selected={choice.selected}
                disabled={busy !== null}
                onChange={() => next && onKeys(next)}
                aria-label={`${displayAnswer(prompt.answer_type, choice.value)}, ${choice.count} answered${choice.selected ? ', marked correct' : ''}`}
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, overflowWrap: 'anywhere' }}
              >
                {choice.selected && <CheckCircleRounded fontSize="small" sx={{ mr: 0.5 }} aria-hidden />}
                {`${displayAnswer(prompt.answer_type, choice.value)} (${choice.count})`}
              </ToggleButton>
            );
          })}
        </Box>

        {typed && (
          <Stack component="form" direction="row" spacing={1} onSubmit={addKey}>
            <TextField
              size="small"
              label="Another correct answer"
              value={extraKey}
              onChange={(event) => setExtraKey(event.target.value)}
              inputProps={{ maxLength: 100, inputMode: prompt.answer_type === 'numeric' ? 'decimal' : 'text' }}
              sx={{ flex: 1 }}
            />
            <Button type="submit" variant="outlined" disabled={busy !== null || !extraKey.trim()} sx={{ minHeight: 44 }}>
              Add
            </Button>
          </Stack>
        )}

        <ToggleButton
          value="poll"
          selected={prompt.ungraded}
          disabled={busy !== null || prompt.ungraded}
          onChange={onPoll}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
        >
          <HowToVoteRounded fontSize="small" sx={{ mr: 0.75 }} aria-hidden />
          {"Poll, don't grade"}
        </ToggleButton>
      </Stack>

      <Button
        fullWidth
        variant="contained"
        size="large"
        onClick={onReveal}
        disabled={!decided || busy !== null}
        startIcon={busy === 'reveal' ? <CircularProgress size={22} color="inherit" aria-hidden /> : <VisibilityRounded />}
        sx={{ minHeight: 56, fontWeight: 800 }}
      >
        Reveal answer
      </Button>
      {!decided && (
        <Typography variant="caption" color="text.secondary">
          Choose the correct answer, or mark it as a poll, to reveal.
        </Typography>
      )}
    </Stack>
  );
}
