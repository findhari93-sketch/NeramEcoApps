'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  Slider,
} from '@neram/ui';
import SendIcon from '@mui/icons-material/Send';
import type { ExamRecallDifficulty, ExamRecallTimePressure, ExamRecallTopicCategory } from '@neram/database';

interface ContributeTipsProps {
  examDate: string;
  sessionNumber: number;
  classroomId: string;
  onSubmit: (tip: any) => Promise<void>;
}

const TOPICS: Array<{ key: ExamRecallTopicCategory; label: string }> = [
  { key: 'visual_reasoning', label: 'Visual Reasoning' },
  { key: 'logical_derivation', label: 'Logical Derivation' },
  { key: 'gk_architecture', label: 'GK / Architecture' },
  { key: 'language', label: 'Language' },
  { key: 'design_sensitivity', label: 'Design Sensitivity' },
  { key: 'numerical_ability', label: 'Numerical Ability' },
  { key: 'drawing', label: 'Drawing' },
];

function buildInitialDist(): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const t of TOPICS) {
    dist[t.key] = Math.round(100 / TOPICS.length);
  }
  return dist;
}

export default function ContributeTips({
  examDate,
  sessionNumber,
  classroomId,
  onSubmit,
}: ContributeTipsProps) {
  const [insightsText, setInsightsText] = useState('');
  const [topicDist, setTopicDist] = useState<Record<string, number>>(buildInitialDist);
  const [difficulty, setDifficulty] = useState<ExamRecallDifficulty>('moderate');
  const [timePressure, setTimePressure] = useState<ExamRecallTimePressure>('just_enough');
  const [submitting, setSubmitting] = useState(false);

  const total = Object.values(topicDist).reduce((s, v) => s + v, 0);

  const handleDistChange = (key: string, value: number) => {
    setTopicDist((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!insightsText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        exam_date: examDate,
        session_number: sessionNumber,
        classroom_id: classroomId,
        insights_text: insightsText.trim(),
        topic_distribution: topicDist,
        difficulty,
        time_pressure: timePressure,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Typography variant="subtitle1" fontWeight={600}>
        Exam Tips & Insights
      </Typography>

      {/* Insights text */}
      <TextField
        label="Your Insights"
        placeholder="Share your exam experience, tips, strategies, surprising topics..."
        value={insightsText}
        onChange={(e) => setInsightsText(e.target.value)}
        multiline
        minRows={4}
        maxRows={10}
        fullWidth
        required
      />

      {/* Topic distribution */}
      <Box>
        <FormLabel sx={{ mb: 1, display: 'block' }}>
          Topic Distribution (approx %)
        </FormLabel>
        <Typography
          variant="caption"
          color={Math.abs(total - 100) <= 5 ? 'text.secondary' : 'error'}
          sx={{ mb: 1, display: 'block' }}
        >
          Total: {total}% {Math.abs(total - 100) > 5 ? '(should be ~100%)' : ''}
        </Typography>
        <Stack spacing={1.5}>
          {TOPICS.map((t) => (
            <Stack key={t.key} direction="row" spacing={2} alignItems="center">
              <Typography variant="caption" sx={{ width: { xs: 100, md: 140 }, flexShrink: 0 }}>
                {t.label}
              </Typography>
              <Slider
                value={topicDist[t.key] || 0}
                onChange={(_, val) => handleDistChange(t.key, val as number)}
                min={0}
                max={50}
                step={5}
                valueLabelDisplay="auto"
                sx={{ flex: 1 }}
              />
              <Typography variant="caption" fontWeight={600} sx={{ width: 32, textAlign: 'right' }}>
                {topicDist[t.key] || 0}%
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      {/* Difficulty */}
      <FormControl>
        <FormLabel>Difficulty</FormLabel>
        <RadioGroup
          row
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as ExamRecallDifficulty)}
        >
          <FormControlLabel value="easy" control={<Radio size="small" />} label="Easy" />
          <FormControlLabel value="moderate" control={<Radio size="small" />} label="Moderate" />
          <FormControlLabel value="hard" control={<Radio size="small" />} label="Hard" />
        </RadioGroup>
      </FormControl>

      {/* Time pressure */}
      <FormControl>
        <FormLabel>Time Pressure</FormLabel>
        <RadioGroup
          row
          value={timePressure}
          onChange={(e) => setTimePressure(e.target.value as ExamRecallTimePressure)}
        >
          <FormControlLabel value="plenty" control={<Radio size="small" />} label="Plenty" />
          <FormControlLabel value="just_enough" control={<Radio size="small" />} label="Just Enough" />
          <FormControlLabel value="rushed" control={<Radio size="small" />} label="Rushed" />
        </RadioGroup>
      </FormControl>

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={!insightsText.trim() || submitting}
        startIcon={<SendIcon />}
        sx={{ textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start' }}
      >
        {submitting ? 'Submitting...' : 'Submit Tips'}
      </Button>
    </Stack>
  );
}
