'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  InputLabel,
  Collapse,
  alpha,
  useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import SendIcon from '@mui/icons-material/Send';
import type {
  ExamRecallQuestionType,
  ExamRecallSection,
  ExamRecallClarity,
  ExamRecallTopicCategory,
} from '@neram/database';

interface ContributeTypeItProps {
  examDate: string;
  sessionNumber: number;
  classroomId: string;
  onSubmit: (data: any) => Promise<void>;
  onSimilarFound?: (matches: any[]) => void;
}

const TOPIC_OPTIONS: Array<{ value: ExamRecallTopicCategory; label: string }> = [
  { value: 'visual_reasoning', label: 'Visual Reasoning' },
  { value: 'logical_derivation', label: 'Logical Derivation' },
  { value: 'gk_architecture', label: 'GK / Architecture' },
  { value: 'language', label: 'Language' },
  { value: 'design_sensitivity', label: 'Design Sensitivity' },
  { value: 'numerical_ability', label: 'Numerical Ability' },
  { value: 'drawing', label: 'Drawing' },
];

const CLARITY_OPTIONS: Array<{ value: ExamRecallClarity; label: string; icon: string }> = [
  { value: 'clear', label: 'Clear', icon: '\u{1F7E2}' },
  { value: 'partial', label: 'Partial', icon: '\u{1F7E1}' },
  { value: 'vague', label: 'Vague', icon: '\u{1F534}' },
];

export default function ContributeTypeIt({
  examDate,
  sessionNumber,
  classroomId,
  onSubmit,
  onSimilarFound,
}: ContributeTypeItProps) {
  const theme = useTheme();

  // Form state
  const [section, setSection] = useState<ExamRecallSection>('part_b');
  const [questionType, setQuestionType] = useState<ExamRecallQuestionType>('mcq');
  const [questionText, setQuestionText] = useState('');
  const [hasImage, setHasImage] = useState<'yes' | 'no' | 'not_sure'>('no');
  const [imageDescription, setImageDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [myAnswer, setMyAnswer] = useState('');
  const [myWorking, setMyWorking] = useState('');
  const [showWorking, setShowWorking] = useState(false);
  const [clarity, setClarity] = useState<ExamRecallClarity>('partial');
  const [topicCategory, setTopicCategory] = useState<ExamRecallTopicCategory | ''>('');
  const [subTopicHint, setSubTopicHint] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOptionChange = useCallback((index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleSubmit = async () => {
    if (!questionText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        exam_date: examDate,
        session_number: sessionNumber,
        classroom_id: classroomId,
        section,
        question_type: questionType,
        recall_text: questionText.trim(),
        has_image: hasImage === 'yes',
        image_description: hasImage === 'yes' ? imageDescription.trim() : null,
        image_file: imageFile,
        options: questionType === 'mcq' ? options.filter((o) => o.trim()).map((text, i) => ({ id: String.fromCharCode(65 + i), text: text.trim() })) : null,
        my_answer: myAnswer.trim() || null,
        my_working: myWorking.trim() || null,
        clarity,
        topic_category: topicCategory || null,
        sub_topic_hint: subTopicHint.trim() || null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setQuestionText('');
    setHasImage('no');
    setImageDescription('');
    setImageFile(null);
    setOptions(['', '', '', '']);
    setMyAnswer('');
    setMyWorking('');
    setShowWorking(false);
    setClarity('partial');
    setTopicCategory('');
    setSubTopicHint('');
  };

  const isPartB = section === 'part_b';

  return (
    <Stack spacing={2.5}>
      {/* Section toggle */}
      <Box>
        <FormLabel sx={{ mb: 1, display: 'block' }}>Section</FormLabel>
        <ToggleButtonGroup
          value={section}
          exclusive
          onChange={(_, val) => val && setSection(val)}
          size="small"
          fullWidth
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontWeight: 600,
              py: 1,
            },
          }}
        >
          <ToggleButton value="part_a">Part A (Drawing)</ToggleButton>
          <ToggleButton value="part_b">Part B (MCQ/NCQ)</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {isPartB && (
        <>
          {/* Question type */}
          <FormControl>
            <FormLabel>Question Type</FormLabel>
            <RadioGroup
              row
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value as ExamRecallQuestionType)}
            >
              <FormControlLabel value="mcq" control={<Radio size="small" />} label="MCQ" />
              <FormControlLabel value="numerical" control={<Radio size="small" />} label="Numerical" />
              <FormControlLabel value="fill_blank" control={<Radio size="small" />} label="Fill-in-blank" />
            </RadioGroup>
          </FormControl>

          {/* Question text */}
          <TextField
            label="Question Text"
            placeholder="Type what you remember about this question..."
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            multiline
            minRows={3}
            maxRows={8}
            fullWidth
            required
          />

          {/* Has image? */}
          <FormControl>
            <FormLabel>Had an image in the original?</FormLabel>
            <RadioGroup
              row
              value={hasImage}
              onChange={(e) => setHasImage(e.target.value as 'yes' | 'no' | 'not_sure')}
            >
              <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
              <FormControlLabel value="no" control={<Radio size="small" />} label="No" />
              <FormControlLabel value="not_sure" control={<Radio size="small" />} label="Not sure" />
            </RadioGroup>
          </FormControl>

          {/* Conditional: image description + upload */}
          <Collapse in={hasImage === 'yes'}>
            <Stack spacing={2}>
              <TextField
                label="Image Description"
                placeholder="Describe the image you saw..."
                value={imageDescription}
                onChange={(e) => setImageDescription(e.target.value)}
                multiline
                minRows={2}
                fullWidth
              />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Upload reference image (max 1MB)
                </Typography>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && file.size <= 1024 * 1024) {
                      setImageFile(file);
                    }
                  }}
                />
              </Box>
            </Stack>
          </Collapse>

          {/* MCQ Options */}
          <Collapse in={questionType === 'mcq'}>
            <Stack spacing={1}>
              <FormLabel>Options</FormLabel>
              {options.map((opt, i) => (
                <TextField
                  key={i}
                  size="small"
                  label={`Option ${String.fromCharCode(65 + i)}`}
                  value={opt}
                  onChange={(e) => handleOptionChange(i, e.target.value)}
                  fullWidth
                />
              ))}
            </Stack>
          </Collapse>

          {/* My answer */}
          <TextField
            label="My Answer"
            placeholder="What did you answer?"
            value={myAnswer}
            onChange={(e) => setMyAnswer(e.target.value)}
            size="small"
            fullWidth
          />

          {/* My working (collapsible) */}
          <Box>
            <Button
              variant="text"
              size="small"
              onClick={() => setShowWorking(!showWorking)}
              sx={{ textTransform: 'none', mb: 0.5 }}
            >
              {showWorking ? 'Hide' : 'Show'} Working (optional)
            </Button>
            <Collapse in={showWorking}>
              <TextField
                label="My Working"
                placeholder="How did you approach this question?"
                value={myWorking}
                onChange={(e) => setMyWorking(e.target.value)}
                multiline
                minRows={2}
                maxRows={6}
                fullWidth
              />
            </Collapse>
          </Box>

          {/* Clarity */}
          <Box>
            <FormLabel sx={{ mb: 1, display: 'block' }}>Clarity</FormLabel>
            <ToggleButtonGroup
              value={clarity}
              exclusive
              onChange={(_, val) => val && setClarity(val)}
              size="small"
              fullWidth
              sx={{
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontWeight: 600,
                  py: 0.75,
                },
              }}
            >
              {CLARITY_OPTIONS.map((opt) => (
                <ToggleButton key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* Topic */}
          <FormControl fullWidth size="small">
            <InputLabel>Topic</InputLabel>
            <Select
              value={topicCategory}
              onChange={(e) => setTopicCategory(e.target.value as ExamRecallTopicCategory)}
              label="Topic"
            >
              <MenuItem value="">
                <em>Select topic</em>
              </MenuItem>
              {TOPIC_OPTIONS.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Sub-topic hint */}
          <TextField
            label="Sub-topic hint"
            placeholder="e.g. Mensuration - Cone/Sphere"
            value={subTopicHint}
            onChange={(e) => setSubTopicHint(e.target.value)}
            size="small"
            fullWidth
          />
        </>
      )}

      {/* Submit buttons */}
      <Stack direction="row" spacing={1.5}>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={(!questionText.trim() && isPartB) || submitting}
          startIcon={<SendIcon />}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            handleSubmit().then(resetForm);
          }}
          disabled={(!questionText.trim() && isPartB) || submitting}
          startIcon={<AddIcon />}
          sx={{ textTransform: 'none' }}
        >
          Submit & Add Another
        </Button>
      </Stack>
    </Stack>
  );
}
