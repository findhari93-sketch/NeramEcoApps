'use client';

import { useState, useCallback } from 'react';
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
  ImageUploadField,
} from '@neram/ui';
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [questions, setQuestions] = useState<ExtractedQuestion[]>([]);

  // Local "upload": keep the File for OCR and return a data URL for the preview.
  // No server round-trip; the extract step below is where the File is consumed.
  const stageFile = useCallback(
    (file: File): Promise<{ url: string }> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          setImageFile(file);
          setQuestions([]);
          resolve({ url: reader.result as string });
        };
        reader.onerror = () => reject(new Error('Could not read image'));
        reader.readAsDataURL(file);
      }),
    [],
  );

  const handleImageChange = useCallback((url: string | null) => {
    setImageUrl(url);
    if (!url) {
      setImageFile(null);
      setQuestions([]);
    }
  }, []);

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
      {/* Image picker (shared component: click / drop / paste, max 1MB) */}
      <ImageUploadField
        value={imageUrl}
        onChange={handleImageChange}
        upload={stageFile}
        maxSizeMB={1}
        height={160}
        helperText="Paste, drop, or choose"
      />

      {/* Extract button */}
      {imageUrl && questions.length === 0 && (
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
      {!extracting && imageUrl && questions.length === 0 && extracting === false && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          Upload a photo and click "Extract Questions" to use OCR.
        </Typography>
      )}
    </Stack>
  );
}
