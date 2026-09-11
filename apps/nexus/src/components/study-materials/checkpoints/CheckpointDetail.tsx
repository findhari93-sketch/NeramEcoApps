'use client';

/**
 * The open checkpoint: its title, when it runs, what it takes to pass, and its
 * questions.
 *
 * Times are typed the way the player shows them, or taken from the player with
 * "Now". The pass mark says the real number the server will grade by, where the
 * old editor claimed a blank meant "all".
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@neram/ui';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import type { DraftSection } from '@/lib/checkpoint-draft';
import type { CheckpointIssue } from '@/lib/checkpoint-validation';
import type { EditableQuestion, EditableSection } from '@/lib/recap-sections';
import { describePassMark, passMarkChoices, type GateInfo } from '@/lib/pass-mark';
import TimecodeField from './TimecodeField';
import QuestionEditor from './QuestionEditor';

export interface CheckpointDetailProps {
  section: DraftSection;
  index: number;
  total: number;
  gate: GateInfo;
  /** The issues on this checkpoint only. */
  issues: CheckpointIssue[];
  nowSeconds: number | null;
  onPatch: (patch: Partial<EditableSection>) => void;
  onPatchQuestion: (index: number, patch: Partial<EditableQuestion>) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (index: number) => void;
  onRemove: () => void;
  onPlayFrom: (seconds: number) => void;
  disabled?: boolean;
}

export default function CheckpointDetail({
  section,
  index,
  total,
  gate,
  issues,
  nowSeconds,
  onPatch,
  onPatchQuestion,
  onAddQuestion,
  onRemoveQuestion,
  onRemove,
  onPlayFrom,
  disabled = false,
}: CheckpointDetailProps) {
  const number = index + 1;
  const firstBroken = issues.find((i) => i.questionIndex !== undefined)?.questionIndex;
  const [expanded, setExpanded] = useState<number | null>(firstBroken ?? (section.questions.length ? 0 : null));

  // A question added at the end opens, so the teacher can type straight into it.
  const [count, setCount] = useState(section.questions.length);
  useEffect(() => {
    if (section.questions.length > count) setExpanded(section.questions.length - 1);
    setCount(section.questions.length);
  }, [section.questions.length, count]);

  const pass = describePassMark(section, gate);
  const choices = passMarkChoices(section.questions.length, gate);
  const brokenQuestions = new Set(issues.filter((i) => i.severity === 'error' && i.questionIndex !== undefined).map((i) => i.questionIndex));
  const sectionIssues = issues.filter((i) => i.questionIndex === undefined);

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2, sm: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography component="h2" sx={{ flex: 1, fontWeight: 700, fontSize: '1.0625rem' }}>
          Checkpoint {number} of {total}
        </Typography>
        <IconButton
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Delete checkpoint ${number}`}
          sx={{ width: 48, height: 48, color: 'error.main' }}
        >
          <DeleteOutlineRoundedIcon />
        </IconButton>
      </Box>

      {sectionIssues.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
          {sectionIssues.map((issue, i) => (
            <Alert key={`${issue.code}-${i}`} severity={issue.severity === 'error' ? 'error' : 'warning'} sx={{ py: 0.25 }}>
              {issue.message}
            </Alert>
          ))}
        </Box>
      )}

      <TextField
        label="Checkpoint title"
        fullWidth
        value={section.title}
        onChange={(e) => onPatch({ title: e.target.value })}
        disabled={disabled}
        sx={{ mb: 2 }}
      />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mb: 2 }}>
        <TimecodeField
          label="Start"
          seconds={section.start_timestamp_seconds}
          onChange={(seconds) => onPatch({ start_timestamp_seconds: seconds })}
          nowSeconds={nowSeconds}
          onPlayFrom={onPlayFrom}
          disabled={disabled}
        />
        <TimecodeField
          label="End"
          seconds={section.end_timestamp_seconds}
          onChange={(seconds) => onPatch({ end_timestamp_seconds: seconds })}
          nowSeconds={nowSeconds}
          onPlayFrom={onPlayFrom}
          disabled={disabled}
          helperText="The video stops here and asks the questions."
        />
      </Box>

      <TextField
        select
        label="To pass"
        fullWidth
        value={section.min_questions_to_pass === null ? '' : String(section.min_questions_to_pass)}
        onChange={(e) => onPatch({ min_questions_to_pass: e.target.value === '' ? null : Number(e.target.value) })}
        disabled={disabled}
        helperText={`Students need ${pass.label.replace(' to pass', '')} right to move on.`}
        SelectProps={{ displayEmpty: true }}
        InputLabelProps={{ shrink: true }}
      >
        {choices.map((choice) => (
          <MenuItem key={choice.value ?? 'default'} value={choice.value === null ? '' : String(choice.value)} sx={{ minHeight: 44 }}>
            {choice.label}
          </MenuItem>
        ))}
      </TextField>

      <Divider sx={{ my: 2.5 }} />

      <Typography component="h3" sx={{ fontWeight: 700, mb: 1.25 }}>
        Questions ({section.questions.length})
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {section.questions.map((question, qi) => (
          <QuestionEditor
            key={qi}
            index={qi}
            question={question}
            expanded={expanded === qi}
            onToggle={() => setExpanded((open) => (open === qi ? null : qi))}
            onChange={(patch) => onPatchQuestion(qi, patch)}
            onRemove={() => onRemoveQuestion(qi)}
            hasError={brokenQuestions.has(qi)}
            disabled={disabled}
          />
        ))}
      </Box>

      <Button
        startIcon={<AddRoundedIcon />}
        onClick={onAddQuestion}
        disabled={disabled}
        sx={{ mt: 1.5, minHeight: 44, textTransform: 'none' }}
      >
        Add question
      </Button>
    </Paper>
  );
}
