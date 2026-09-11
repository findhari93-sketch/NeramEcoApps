'use client';

/**
 * One question, folded to a line until it is opened.
 *
 * Folded, it shows its number, its text and which answer is correct, so a
 * teacher can read down ten questions without opening forty option boxes. Open,
 * the correct answer is chosen with a radio beside the option itself rather than
 * a separate row of A B C D buttons, so the choice and the words it refers to are
 * never apart.
 */

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@neram/ui';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import type { EditableQuestion } from '@/lib/recap-sections';

const OPTIONS = ['a', 'b', 'c', 'd'] as const;

export interface QuestionEditorProps {
  index: number;
  question: EditableQuestion;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<EditableQuestion>) => void;
  onRemove: () => void;
  hasError: boolean;
  disabled?: boolean;
}

export default function QuestionEditor({
  index,
  question,
  expanded,
  onToggle,
  onChange,
  onRemove,
  hasError,
  disabled = false,
}: QuestionEditorProps) {
  const number = index + 1;
  const hasText = !!question.question_text.trim();

  return (
    <Accordion
      expanded={expanded}
      onChange={onToggle}
      disableGutters
      variant="outlined"
      sx={{ borderRadius: 2, overflow: 'hidden', '&:before': { display: 'none' } }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRoundedIcon />}
        aria-controls={`question-${number}-content`}
        id={`question-${number}-header`}
        sx={{ minHeight: 56, '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1, minWidth: 0 } }}
      >
        <Typography sx={{ fontWeight: 700, flexShrink: 0 }}>Q{number}</Typography>
        <Typography noWrap sx={{ flex: 1, minWidth: 0, color: hasText ? 'text.primary' : 'text.disabled' }}>
          {hasText ? question.question_text : 'No question written yet'}
        </Typography>
        {hasError ? (
          <ErrorOutlineRoundedIcon titleAccess="Needs fixing" sx={{ color: 'error.main', flexShrink: 0 }} />
        ) : (
          <Chip size="small" label={`Answer ${question.correct_option.toUpperCase()}`} sx={{ flexShrink: 0, fontWeight: 600 }} />
        )}
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0 }}>
        <TextField
          label="Question"
          multiline
          minRows={2}
          fullWidth
          value={question.question_text}
          onChange={(e) => onChange({ question_text: e.target.value })}
          disabled={disabled}
          error={!hasText}
          helperText={!hasText ? 'Write the question, or delete it.' : undefined}
        />

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.5 }}>
          Options. Choose the correct one.
        </Typography>
        <RadioGroup
          value={question.correct_option}
          onChange={(e) => onChange({ correct_option: e.target.value as EditableQuestion['correct_option'] })}
          aria-label={`Correct answer for question ${number}`}
          sx={{ gap: 1 }}
        >
          {OPTIONS.map((option) => {
            const field = `option_${option}` as const;
            const empty = hasText && !question[field].trim();
            return (
              <Box key={option} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Radio
                  value={option}
                  disabled={disabled}
                  inputProps={{ 'aria-label': `Option ${option.toUpperCase()} is the correct answer` }}
                  sx={{ width: 44, height: 44, flexShrink: 0 }}
                />
                <TextField
                  fullWidth
                  size="small"
                  label={`Option ${option.toUpperCase()}`}
                  value={question[field]}
                  onChange={(e) => onChange({ [field]: e.target.value } as Partial<EditableQuestion>)}
                  disabled={disabled}
                  error={empty}
                  sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
                />
              </Box>
            );
          })}
        </RadioGroup>

        <TextField
          label="Explanation (optional)"
          helperText="Shown to the student after they answer."
          fullWidth
          multiline
          value={question.explanation}
          onChange={(e) => onChange({ explanation: e.target.value })}
          disabled={disabled}
          sx={{ mt: 1.5 }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Button
            color="error"
            startIcon={<DeleteOutlineRoundedIcon />}
            onClick={onRemove}
            disabled={disabled}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Delete question
          </Button>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
