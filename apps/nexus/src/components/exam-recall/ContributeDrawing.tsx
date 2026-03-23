'use client';

import { useState, useCallback } from 'react';
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
  Checkbox,
  Chip,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  alpha,
  useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import type { ExamRecallDrawingType, ExamRecallClarity } from '@neram/database';

interface ContributeDrawingProps {
  examDate: string;
  sessionNumber: number;
  classroomId: string;
  onSubmit: (drawings: any[]) => Promise<void>;
}

interface DrawingFormState {
  drawingType: ExamRecallDrawingType;
  promptEn: string;
  promptHi: string;
  materials: Array<{ name: string; count: number }>;
  materialInput: string;
  constraints: {
    colorRestriction: boolean;
    intersectionAllowed: boolean;
    bwOnly: boolean;
    themeRequired: boolean;
  };
  theme: string;
  marks: number;
  paperPhoto: File | null;
  attemptPhoto: File | null;
  clarity: ExamRecallClarity;
}

const QUESTION_LABELS = ['A1', 'A2', 'A3'];

const CLARITY_OPTIONS: Array<{ value: ExamRecallClarity; label: string; icon: string }> = [
  { value: 'clear', label: 'Clear', icon: '\u{1F7E2}' },
  { value: 'partial', label: 'Partial', icon: '\u{1F7E1}' },
  { value: 'vague', label: 'Vague', icon: '\u{1F534}' },
];

function createEmptyDrawing(): DrawingFormState {
  return {
    drawingType: 'composition_2d',
    promptEn: '',
    promptHi: '',
    materials: [],
    materialInput: '',
    constraints: {
      colorRestriction: false,
      intersectionAllowed: false,
      bwOnly: false,
      themeRequired: false,
    },
    theme: '',
    marks: 25,
    paperPhoto: null,
    attemptPhoto: null,
    clarity: 'partial',
  };
}

function DrawingQuestionForm({
  label,
  state,
  onChange,
}: {
  label: string;
  state: DrawingFormState;
  onChange: (state: DrawingFormState) => void;
}) {
  const theme = useTheme();

  const addMaterial = () => {
    const input = state.materialInput.trim();
    if (!input) return;

    // Parse "name x count" or just "name"
    const match = input.match(/^(.+?)\s*x\s*(\d+)$/i);
    const name = match ? match[1].trim() : input;
    const count = match ? parseInt(match[2], 10) : 1;

    onChange({
      ...state,
      materials: [...state.materials, { name, count }],
      materialInput: '',
    });
  };

  const removeMaterial = (index: number) => {
    onChange({
      ...state,
      materials: state.materials.filter((_, i) => i !== index),
    });
  };

  return (
    <Box
      sx={{
        p: { xs: 1.5, md: 2 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'grey.200',
      }}
    >
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
        Question {label}
      </Typography>

      <Stack spacing={2}>
        {/* Drawing type */}
        <FormControl>
          <FormLabel>Drawing Type</FormLabel>
          <RadioGroup
            row
            value={state.drawingType}
            onChange={(e) => onChange({ ...state, drawingType: e.target.value as ExamRecallDrawingType })}
          >
            <FormControlLabel value="composition_2d" control={<Radio size="small" />} label="2D Composition" />
            <FormControlLabel value="object_sketching" control={<Radio size="small" />} label="Object Sketching" />
            <FormControlLabel value="3d_model" control={<Radio size="small" />} label="3D Model" />
          </RadioGroup>
        </FormControl>

        {/* Prompt (English) */}
        <TextField
          label="Prompt (English)"
          placeholder="What was the drawing prompt?"
          value={state.promptEn}
          onChange={(e) => onChange({ ...state, promptEn: e.target.value })}
          multiline
          minRows={2}
          fullWidth
          required
        />

        {/* Prompt (Hindi) */}
        <TextField
          label="Prompt (Hindi)"
          placeholder="Hindi version if available"
          value={state.promptHi}
          onChange={(e) => onChange({ ...state, promptHi: e.target.value })}
          multiline
          minRows={2}
          fullWidth
        />

        {/* Objects/Materials */}
        <Box>
          <FormLabel sx={{ mb: 0.5, display: 'block' }}>Objects / Materials</FormLabel>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <TextField
              size="small"
              placeholder='e.g. "triangle x4" or "circle"'
              value={state.materialInput}
              onChange={(e) => onChange({ ...state, materialInput: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addMaterial();
                }
              }}
              fullWidth
            />
            <Button size="small" variant="outlined" onClick={addMaterial} sx={{ minWidth: 'auto', px: 1 }}>
              <AddIcon fontSize="small" />
            </Button>
          </Stack>
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {state.materials.map((m, i) => (
              <Chip
                key={i}
                label={m.count > 1 ? `${m.name} x${m.count}` : m.name}
                size="small"
                onDelete={() => removeMaterial(i)}
                deleteIcon={<CloseIcon sx={{ fontSize: '0.85rem' }} />}
              />
            ))}
          </Stack>
        </Box>

        {/* Constraints */}
        <Box>
          <FormLabel sx={{ mb: 0.5, display: 'block' }}>Constraints</FormLabel>
          <Stack>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={state.constraints.colorRestriction}
                  onChange={(e) => onChange({ ...state, constraints: { ...state.constraints, colorRestriction: e.target.checked } })}
                />
              }
              label={<Typography variant="body2">Color restriction</Typography>}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={state.constraints.intersectionAllowed}
                  onChange={(e) => onChange({ ...state, constraints: { ...state.constraints, intersectionAllowed: e.target.checked } })}
                />
              }
              label={<Typography variant="body2">Intersection allowed</Typography>}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={state.constraints.bwOnly}
                  onChange={(e) => onChange({ ...state, constraints: { ...state.constraints, bwOnly: e.target.checked } })}
                />
              }
              label={<Typography variant="body2">B&W only</Typography>}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={state.constraints.themeRequired}
                  onChange={(e) => onChange({ ...state, constraints: { ...state.constraints, themeRequired: e.target.checked } })}
                />
              }
              label={<Typography variant="body2">Theme required</Typography>}
            />
          </Stack>
        </Box>

        {/* Theme (conditional) */}
        {state.constraints.themeRequired && (
          <TextField
            label="Theme"
            placeholder="What was the theme?"
            value={state.theme}
            onChange={(e) => onChange({ ...state, theme: e.target.value })}
            size="small"
            fullWidth
          />
        )}

        {/* Marks */}
        <FormControl>
          <FormLabel>Marks</FormLabel>
          <RadioGroup
            row
            value={String(state.marks)}
            onChange={(e) => onChange({ ...state, marks: parseInt(e.target.value, 10) })}
          >
            <FormControlLabel value="25" control={<Radio size="small" />} label="25" />
            <FormControlLabel value="30" control={<Radio size="small" />} label="30" />
          </RadioGroup>
        </FormControl>

        {/* Upload */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Question paper photo
            </Typography>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onChange({ ...state, paperPhoto: e.target.files?.[0] || null })}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Attempt photo
            </Typography>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onChange({ ...state, attemptPhoto: e.target.files?.[0] || null })}
            />
          </Box>
        </Stack>

        {/* Clarity */}
        <Box>
          <FormLabel sx={{ mb: 0.5, display: 'block' }}>Clarity</FormLabel>
          <ToggleButtonGroup
            value={state.clarity}
            exclusive
            onChange={(_, val) => val && onChange({ ...state, clarity: val })}
            size="small"
            fullWidth
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 600,
                py: 0.5,
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
      </Stack>
    </Box>
  );
}

export default function ContributeDrawing({
  examDate,
  sessionNumber,
  classroomId,
  onSubmit,
}: ContributeDrawingProps) {
  const [drawings, setDrawings] = useState<DrawingFormState[]>([
    createEmptyDrawing(),
    createEmptyDrawing(),
    createEmptyDrawing(),
  ]);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback((index: number, state: DrawingFormState) => {
    setDrawings((prev) => {
      const next = [...prev];
      next[index] = state;
      return next;
    });
  }, []);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(
        drawings.map((d, i) => ({
          question_number: i + 1,
          drawing_type: d.drawingType,
          prompt_text_en: d.promptEn.trim() || null,
          prompt_text_hi: d.promptHi.trim() || null,
          objects_materials: d.materials.length > 0 ? d.materials : null,
          constraints: d.constraints,
          theme: d.constraints.themeRequired ? d.theme.trim() : null,
          marks: d.marks,
          paper_photo: d.paperPhoto,
          attempt_photo: d.attemptPhoto,
          clarity: d.clarity,
          exam_date: examDate,
          session_number: sessionNumber,
          classroom_id: classroomId,
        }))
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Typography variant="subtitle1" fontWeight={600}>
        Part A - Drawing Questions
      </Typography>

      {drawings.map((d, i) => (
        <DrawingQuestionForm
          key={i}
          label={QUESTION_LABELS[i]}
          state={d}
          onChange={(s) => handleChange(i, s)}
        />
      ))}

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={submitting}
        startIcon={<SendIcon />}
        sx={{ textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start' }}
      >
        {submitting ? 'Submitting...' : 'Submit All Drawings'}
      </Button>
    </Stack>
  );
}
