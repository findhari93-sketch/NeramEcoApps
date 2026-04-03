'use client';

import { useState, useCallback, useRef } from 'react';
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  alpha,
  useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import type { ExamRecallDrawingType } from '@neram/database';

interface ContributeDrawingProps {
  examDate: string;
  sessionNumber: number;
  classroomId: string;
  onSubmit: (drawings: any[]) => Promise<void>;
}

interface SimpleDrawingNote {
  notes: string;
  images: File[];
  drawingType: ExamRecallDrawingType;
  marks: number;
  materials: Array<{ name: string; count: number }>;
  materialInput: string;
  constraints: {
    colorRestriction: boolean;
    intersectionAllowed: boolean;
    bwOnly: boolean;
    themeRequired: boolean;
  };
  theme: string;
}

function createEmptyNote(): SimpleDrawingNote {
  return {
    notes: '',
    images: [],
    drawingType: 'composition_2d',
    marks: 25,
    materials: [],
    materialInput: '',
    constraints: {
      colorRestriction: false,
      intersectionAllowed: false,
      bwOnly: false,
      themeRequired: false,
    },
    theme: '',
  };
}

function NoteCard({
  index,
  state,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  state: SimpleDrawingNote;
  onChange: (state: SimpleDrawingNote) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addMaterial = () => {
    const input = state.materialInput.trim();
    if (!input) return;
    const match = input.match(/^(.+?)\s*x\s*(\d+)$/i);
    const name = match ? match[1].trim() : input;
    const count = match ? parseInt(match[2], 10) : 1;
    onChange({
      ...state,
      materials: [...state.materials, { name, count }],
      materialInput: '',
    });
  };

  const removeMaterial = (i: number) => {
    onChange({
      ...state,
      materials: state.materials.filter((_, idx) => idx !== i),
    });
  };

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    onChange({
      ...state,
      images: [...state.images, ...Array.from(files) as File[]],
    });
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const removeImage = (i: number) => {
    onChange({
      ...state,
      images: state.images.filter((_, idx) => idx !== i),
    });
  };

  return (
    <Box
      sx={{
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'grey.200',
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 2,
          py: 1,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          borderBottom: '1px solid',
          borderColor: 'grey.100',
        }}
      >
        <Typography variant="subtitle2" fontWeight={700} color="primary">
          Question {index + 1}
        </Typography>
        {canRemove && (
          <IconButton size="small" onClick={onRemove} sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        {/* Primary notepad input */}
        <TextField
          placeholder="What do you remember? e.g., Draw a 2D composition using triangles and circles with max 4 colors..."
          value={state.notes}
          onChange={(e) => onChange({ ...state, notes: e.target.value })}
          multiline
          minRows={3}
          maxRows={10}
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              fontSize: '0.95rem',
              lineHeight: 1.6,
            },
          }}
        />

        {/* Image attachments */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.5 }}>
          <Button
            size="small"
            variant="text"
            startIcon={<ImageOutlinedIcon />}
            onClick={() => fileInputRef.current?.click()}
            sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 500 }}
          >
            Add photo
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleImageAdd}
          />
        </Stack>

        {/* Image thumbnails */}
        {state.images.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
            {state.images.map((file, i) => (
              <Box
                key={i}
                sx={{
                  position: 'relative',
                  width: 72,
                  height: 72,
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'grey.200',
                }}
              >
                <Box
                  component="img"
                  src={URL.createObjectURL(file)}
                  alt={`Attachment ${i + 1}`}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <IconButton
                  size="small"
                  onClick={() => removeImage(i)}
                  sx={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    bgcolor: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    p: 0.25,
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                  }}
                >
                  <CloseIcon sx={{ fontSize: '0.75rem' }} />
                </IconButton>
              </Box>
            ))}
          </Stack>
        )}

        {/* Collapsible details */}
        <Accordion
          disableGutters
          elevation={0}
          sx={{
            mt: 2,
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: '8px !important',
            '&:before': { display: 'none' },
            '& .MuiAccordionSummary-root': {
              minHeight: 44,
              px: 1.5,
            },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <TuneIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                Add details (optional)
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 1.5, pb: 2 }}>
            <Stack spacing={2}>
              {/* Drawing type */}
              <FormControl>
                <FormLabel sx={{ fontSize: '0.8rem', mb: 0.5 }}>Drawing Type</FormLabel>
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

              {/* Marks */}
              <FormControl>
                <FormLabel sx={{ fontSize: '0.8rem', mb: 0.5 }}>Marks</FormLabel>
                <RadioGroup
                  row
                  value={String(state.marks)}
                  onChange={(e) => onChange({ ...state, marks: parseInt(e.target.value, 10) })}
                >
                  <FormControlLabel value="25" control={<Radio size="small" />} label="25" />
                  <FormControlLabel value="30" control={<Radio size="small" />} label="30" />
                </RadioGroup>
              </FormControl>

              {/* Objects/Materials */}
              <Box>
                <FormLabel sx={{ fontSize: '0.8rem', mb: 0.5, display: 'block' }}>Objects / Materials</FormLabel>
                <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
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
                {state.materials.length > 0 && (
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
                )}
              </Box>

              {/* Constraints */}
              <Box>
                <FormLabel sx={{ fontSize: '0.8rem', mb: 0.5, display: 'block' }}>Constraints</FormLabel>
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
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
}

export default function ContributeDrawing({
  examDate,
  sessionNumber,
  classroomId,
  onSubmit,
}: ContributeDrawingProps) {
  const [notes, setNotes] = useState<SimpleDrawingNote[]>([createEmptyNote()]);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback((index: number, state: SimpleDrawingNote) => {
    setNotes((prev) => {
      const next = [...prev];
      next[index] = state;
      return next;
    });
  }, []);

  const addQuestion = () => {
    if (notes.length >= 3) return;
    setNotes((prev) => [...prev, createEmptyNote()]);
  };

  const removeQuestion = (index: number) => {
    setNotes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Filter out empty notes
    const filled = notes.filter((n) => n.notes.trim());
    if (filled.length === 0 || submitting) return;

    setSubmitting(true);
    try {
      await onSubmit(
        filled.map((d, i) => ({
          question_number: i + 1,
          drawing_type: d.drawingType,
          prompt_text_en: d.notes.trim() || null,
          prompt_text_hi: null,
          objects_materials: d.materials.length > 0 ? d.materials : null,
          constraints: d.constraints,
          theme: d.constraints.themeRequired ? d.theme.trim() : null,
          marks: d.marks,
          paper_photo: d.images[0] || null,
          attempt_photo: null,
          exam_date: examDate,
          session_number: sessionNumber,
          classroom_id: classroomId,
        }))
      );
    } finally {
      setSubmitting(false);
    }
  };

  const hasContent = notes.some((n) => n.notes.trim());

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" fontWeight={600}>
        Part A - Drawing Questions
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
        Jot down what you remember about each drawing question. You can add details like type, marks, and materials later.
      </Typography>

      {notes.map((note, i) => (
        <NoteCard
          key={i}
          index={i}
          state={note}
          onChange={(s) => handleChange(i, s)}
          onRemove={() => removeQuestion(i)}
          canRemove={notes.length > 1}
        />
      ))}

      {notes.length < 3 && (
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={addQuestion}
          sx={{
            textTransform: 'none',
            fontWeight: 500,
            borderStyle: 'dashed',
            color: 'text.secondary',
            borderColor: 'grey.300',
            alignSelf: 'flex-start',
          }}
        >
          Add another question
        </Button>
      )}

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={submitting || !hasContent}
        startIcon={<SendIcon />}
        sx={{
          textTransform: 'none',
          fontWeight: 600,
          alignSelf: 'flex-start',
          mt: 1,
        }}
      >
        {submitting ? 'Submitting...' : `Submit ${notes.filter((n) => n.notes.trim()).length || ''} Drawing${notes.filter((n) => n.notes.trim()).length !== 1 ? 's' : ''}`}
      </Button>
    </Stack>
  );
}
