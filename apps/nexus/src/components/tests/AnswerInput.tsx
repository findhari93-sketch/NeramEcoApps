'use client';

import { Box, TextField, Typography, alpha, useTheme } from '@neram/ui';
import MathText from '@/components/common/MathText';

export interface AnswerInputQuestion {
  question_id: string;
  /** Normalised uppercase, from getComposedTestQuestions. */
  question_format?: string | null;
  options?: unknown;
}

interface AnswerInputProps {
  question: AnswerInputQuestion;
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface OptionShape {
  key: string;
  text: string;
}

/**
 * How a student answers one question.
 *
 * This exists because before it, they could not. Both test players rendered
 * `(question.options || []).map(...)` unconditionally and neither passed
 * question_format into its own Question type, so a NUMERICAL question showed its
 * text and offered zero ways to respond. Fixing the grader without this would
 * have turned "tolerance silently ignored" into "guaranteed zero".
 */
export default function AnswerInput({ question, value, onChange, disabled }: AnswerInputProps) {
  const theme = useTheme();
  const format = String(question.question_format || 'MCQ').toUpperCase();

  if (format === 'NUMERICAL') {
    return (
      <Box>
        <TextField
          fullWidth
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Type your answer"
          autoComplete="off"
          // type="text" with inputMode="decimal", NOT type="number".
          // type="number" strips leading zeros, silently discards input some
          // Android keyboards produce, and on iOS shows a spinner nobody wants on
          // a maths answer. inputMode gets the numeric keypad without any of that.
          type="text"
          inputMode="decimal"
          inputProps={{
            // 16px or iOS zooms the whole page on focus and the student loses
            // sight of the question they are answering.
            style: { fontSize: 18, fontWeight: 600, textAlign: 'center' },
            'aria-label': 'Your numerical answer',
          }}
          sx={{
            '& .MuiInputBase-root': { minHeight: 56, borderRadius: 2 },
          }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.75, textAlign: 'center' }}
        >
          Numbers only. Decimals are fine.
        </Typography>
      </Box>
    );
  }

  // MCQ, and the fallback for anything else: an unknown format with options is
  // still best served by showing them.
  const options = normaliseOptions(question.options);

  if (options.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        This question has no options to choose from. Tell your teacher.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {options.map((opt) => {
        const isSelected = value === opt.key;
        return (
          <Box
            key={opt.key}
            onClick={() => !disabled && onChange(opt.key)}
            role="radio"
            aria-checked={isSelected}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onChange(opt.key);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
              // 56px, comfortably past the 48px floor: this is the primary tap
              // target on the screen and it is tapped under time pressure.
              minHeight: 56,
              p: 1.5,
              cursor: disabled ? 'default' : 'pointer',
              borderRadius: 2,
              border: `2px solid ${isSelected ? theme.palette.primary.main : theme.palette.divider}`,
              bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
              transition: 'border-color .12s, background-color .12s',
            }}
          >
            <Box
              sx={{
                width: 28,
                height: 28,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.8125rem',
                bgcolor: isSelected ? 'primary.main' : alpha(theme.palette.text.primary, 0.06),
                color: isSelected ? 'primary.contrastText' : 'text.secondary',
              }}
            >
              {opt.key.toUpperCase()}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, pt: 0.25, fontSize: '0.9375rem', lineHeight: 1.5 }}>
              <MathText text={opt.text} />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Options arrive in more than one shape across the bank's history: an array of
 * {key,text}, an array of plain strings, or an object keyed a..d. Normalised here
 * rather than in each player.
 */
function normaliseOptions(raw: unknown): OptionShape[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((o, i) => {
        if (typeof o === 'string') return { key: String.fromCharCode(97 + i), text: o };
        if (o && typeof o === 'object') {
          const rec = o as Record<string, unknown>;
          const key = String(rec.key ?? rec.option ?? rec.id ?? String.fromCharCode(97 + i));
          const text = String(rec.text ?? rec.label ?? rec.value ?? '');
          return { key, text };
        }
        return null;
      })
      .filter((o): o is OptionShape => !!o && o.text.length > 0);
  }

  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => v != null && String(v).length > 0)
      .map(([k, v]) => ({ key: k.replace(/^option_/, ''), text: String(v) }));
  }

  return [];
}
