'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Chip,
  Select,
  MenuItem,
  CircularProgress,
} from '@neram/ui';
import type { NexusQBQuestion } from '@neram/database';
import { QB_QUESTION_STATUS_COLORS, QB_QUESTION_STATUS_LABELS } from '@neram/database';

interface AnswerKeyGridProps {
  questions: NexusQBQuestion[];
  onSave: (answers: { question_number: number; correct_answer: string }[]) => Promise<void>;
  saving?: boolean;
}

export default function AnswerKeyGrid({ questions, onSave, saving }: AnswerKeyGridProps) {
  // Initialize answers from existing data
  const [answers, setAnswers] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const q of questions) {
      if (q.correct_answer && q.display_order != null) {
        initial[q.display_order] = q.correct_answer;
      }
    }
    return initial;
  });

  const [dirty, setDirty] = useState(false);

  const handleChange = (questionNumber: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionNumber]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    const entries = Object.entries(answers)
      .filter(([, v]) => v.trim() !== '')
      .map(([qNum, answer]) => ({
        question_number: parseInt(qNum, 10),
        correct_answer: answer.trim(),
      }));

    if (entries.length === 0) return;
    await onSave(entries);
    setDirty(false);
  };

  // Group questions by section
  const sections = useMemo(() => {
    const groups: { title: string; questions: NexusQBQuestion[] }[] = [];
    const mathMcq: NexusQBQuestion[] = [];
    const mathNum: NexusQBQuestion[] = [];
    const aptitude: NexusQBQuestion[] = [];
    const drawing: NexusQBQuestion[] = [];

    for (const q of questions) {
      const num = q.display_order ?? 0;
      if (num <= 20) mathMcq.push(q);
      else if (num <= 25) mathNum.push(q);
      else if (num <= 75) aptitude.push(q);
      else drawing.push(q);
    }

    if (mathMcq.length) groups.push({ title: 'Mathematics - MCQ (Q1-Q20)', questions: mathMcq });
    if (mathNum.length) groups.push({ title: 'Mathematics - Numerical (Q21-Q25)', questions: mathNum });
    if (aptitude.length) groups.push({ title: 'Aptitude Test (Q26-Q75)', questions: aptitude });
    if (drawing.length) groups.push({ title: 'Drawing Test (Q76-Q77)', questions: drawing });

    return groups;
  }, [questions]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Answer Key
        </Typography>
        <Button
          variant="contained"
          size="small"
          onClick={handleSave}
          disabled={!dirty || saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {saving ? 'Saving...' : 'Save All'}
        </Button>
      </Box>

      {sections.map((section) => (
        <Box key={section.title} sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            {section.title}
          </Typography>
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box
              component="table"
              sx={{
                width: '100%',
                borderCollapse: 'collapse',
                '& th, & td': {
                  px: 1.5,
                  py: 0.75,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  fontSize: '0.875rem',
                },
                '& th': {
                  bgcolor: 'grey.50',
                  fontWeight: 600,
                  textAlign: 'left',
                },
              }}
            >
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Q#</th>
                  <th style={{ width: 70 }}>Type</th>
                  <th>Correct Answer</th>
                  <th style={{ width: 100 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {section.questions.map((q) => {
                  const qNum = q.display_order ?? 0;
                  const isMCQ = q.question_format === 'MCQ';
                  const isDrawing = q.question_format === 'DRAWING_PROMPT';
                  const currentAnswer = answers[qNum] || '';

                  return (
                    <tr key={q.id}>
                      <td>
                        <Typography variant="body2" fontWeight={500}>
                          {qNum}
                        </Typography>
                      </td>
                      <td>
                        <Typography variant="caption" color="text.secondary">
                          {q.question_format}
                        </Typography>
                      </td>
                      <td>
                        {isDrawing ? (
                          <Typography variant="caption" color="text.disabled">
                            N/A (self-assessed)
                          </Typography>
                        ) : isMCQ ? (
                          <Select
                            size="small"
                            value={currentAnswer}
                            onChange={(e) => handleChange(qNum, e.target.value)}
                            displayEmpty
                            sx={{ minWidth: 100, height: 32 }}
                          >
                            <MenuItem value="">
                              <em>Select</em>
                            </MenuItem>
                            {(q.options || []).map((opt) => (
                              <MenuItem key={opt.id} value={opt.id}>
                                Option {opt.id.toUpperCase()}
                                {opt.nta_id ? ` (${opt.nta_id})` : ''}
                              </MenuItem>
                            ))}
                          </Select>
                        ) : (
                          <TextField
                            size="small"
                            value={currentAnswer}
                            onChange={(e) => handleChange(qNum, e.target.value)}
                            placeholder="Enter answer"
                            sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: '0.875rem' } }}
                          />
                        )}
                      </td>
                      <td>
                        <Chip
                          label={QB_QUESTION_STATUS_LABELS[q.status] || q.status}
                          size="small"
                          sx={{
                            bgcolor: QB_QUESTION_STATUS_COLORS[q.status] + '20',
                            color: QB_QUESTION_STATUS_COLORS[q.status],
                            fontWeight: 600,
                            fontSize: '0.7rem',
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Box>
          </Paper>
        </Box>
      ))}
    </Box>
  );
}
