'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Checkbox,
  TextField,
  LinearProgress,
  Chip,
  IconButton,
  Paper,
  alpha,
  useTheme,
} from '@neram/ui';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export interface ExtractedQuestion {
  id: string;
  text: string;
  type: string;
  confidence: number;
  selected: boolean;
}

interface OCRPreviewProps {
  onExtracted: (questions: ExtractedQuestion[]) => void;
  uploadType: string;
}

export default function OCRPreview({ onExtracted, uploadType }: OCRPreviewProps) {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [questions, setQuestions] = useState<ExtractedQuestion[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 1024 * 1024) return; // max 1MB
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setQuestions([]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleExtract = async () => {
    if (!imageFile || extracting) return;
    setExtracting(true);
    try {
      // TODO: Call OCR API endpoint
      // For now, simulate a delay
      await new Promise((r) => setTimeout(r, 1500));
      // The actual implementation will call the API and parse results
      // Placeholder: set empty results so the UI flow is testable
      setQuestions([]);
    } finally {
      setExtracting(false);
    }
  };

  const toggleQuestion = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, selected: !q.selected } : q))
    );
  };

  const updateText = (id: string, text: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, text } : q))
    );
  };

  const handleConfirmSelected = () => {
    const selected = questions.filter((q) => q.selected);
    if (selected.length > 0) {
      onExtracted(selected);
    }
  };

  const selectedCount = questions.filter((q) => q.selected).length;

  return (
    <Stack spacing={2}>
      {/* Dropzone / Preview */}
      {!imagePreview ? (
        <Box
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          sx={{
            height: 160,
            borderRadius: 2,
            border: `2px dashed ${dragOver ? theme.palette.primary.main : theme.palette.divider}`,
            bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            cursor: 'pointer',
            transition: 'all 150ms',
            '&:hover': {
              borderColor: theme.palette.primary.main,
              bgcolor: alpha(theme.palette.primary.main, 0.02),
            },
          }}
        >
          <CloudUploadIcon sx={{ fontSize: '2rem', color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Drag & drop or click to upload an image
          </Typography>
          <Typography variant="caption" color="text.disabled">
            Max 1MB, image files only
          </Typography>
        </Box>
      ) : (
        <Box sx={{ position: 'relative' }}>
          <Box
            component="img"
            src={imagePreview}
            alt="Uploaded photo"
            sx={{
              width: '100%',
              maxHeight: 300,
              objectFit: 'contain',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'grey.200',
            }}
          />
          <Button
            size="small"
            variant="text"
            onClick={() => {
              setImagePreview(null);
              setImageFile(null);
              setQuestions([]);
            }}
            sx={{ position: 'absolute', top: 4, right: 4, textTransform: 'none' }}
          >
            Remove
          </Button>
        </Box>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {/* Extract button */}
      {imagePreview && questions.length === 0 && (
        <Button
          variant="contained"
          onClick={handleExtract}
          disabled={extracting}
          startIcon={<AutoFixHighIcon />}
          sx={{ textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start' }}
        >
          {extracting ? 'Extracting...' : 'Extract Questions'}
        </Button>
      )}

      {extracting && <LinearProgress />}

      {/* Extracted questions list */}
      {questions.length > 0 && (
        <Stack spacing={1.5}>
          <Typography variant="subtitle2" fontWeight={600}>
            Extracted Questions ({questions.length})
          </Typography>

          {questions.map((q) => (
            <Paper
              key={q.id}
              variant="outlined"
              sx={{
                p: 1.5,
                borderColor: q.selected ? 'primary.main' : 'grey.200',
                bgcolor: q.selected ? alpha(theme.palette.primary.main, 0.02) : 'background.paper',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Checkbox
                  checked={q.selected}
                  onChange={() => toggleQuestion(q.id)}
                  size="small"
                  sx={{ mt: -0.5 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                    <Chip
                      label={q.type}
                      size="small"
                      sx={{ fontSize: '0.65rem', height: 18 }}
                    />
                    <Box sx={{ flex: 1 }} />
                    <Box sx={{ width: 60 }}>
                      <LinearProgress
                        variant="determinate"
                        value={q.confidence * 100}
                        sx={{
                          height: 4,
                          borderRadius: 2,
                          bgcolor: 'grey.200',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 2,
                            bgcolor:
                              q.confidence > 0.8
                                ? 'success.main'
                                : q.confidence > 0.5
                                ? 'warning.main'
                                : 'error.main',
                          },
                        }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {Math.round(q.confidence * 100)}%
                    </Typography>
                  </Stack>
                  <TextField
                    size="small"
                    value={q.text}
                    onChange={(e) => updateText(q.id, e.target.value)}
                    multiline
                    maxRows={4}
                    fullWidth
                    sx={{
                      '& .MuiInputBase-root': { fontSize: '0.875rem' },
                    }}
                  />
                </Box>
              </Stack>
            </Paper>
          ))}

          <Button
            variant="contained"
            onClick={handleConfirmSelected}
            disabled={selectedCount === 0}
            startIcon={<CheckCircleIcon />}
            sx={{ textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start' }}
          >
            Confirm Selected ({selectedCount})
          </Button>
        </Stack>
      )}

      {/* Empty state after extraction */}
      {!extracting && imagePreview && questions.length === 0 && extracting === false && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          Upload a photo and click "Extract Questions" to use OCR.
        </Typography>
      )}
    </Stack>
  );
}
