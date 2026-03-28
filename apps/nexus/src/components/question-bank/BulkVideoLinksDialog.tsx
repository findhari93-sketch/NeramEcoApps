'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  Chip,
  LinearProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  IconButton,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import type { NexusQBQuestion } from '@neram/database';

interface Props {
  open: boolean;
  onClose: () => void;
  questions: NexusQBQuestion[];
  paperId: string;
  getToken: () => Promise<string | null>;
  onSuccess: (message: string) => void;
}

type Step = 'paste' | 'preview' | 'saving' | 'done';

export default function BulkVideoLinksDialog({
  open,
  onClose,
  questions,
  paperId,
  getToken,
  onSuccess,
}: Props) {
  const [step, setStep] = useState<Step>('paste');
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ updated: number; errors: string[] } | null>(null);

  // Sort questions by display_order for consistent mapping
  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [questions]
  );

  // Parse pasted text into URL lines
  const parsedLines = useMemo(() => {
    if (!rawText.trim()) return [];
    return rawText
      .split('\n')
      .map((line) => line.trim());
  }, [rawText]);

  // Build the mapping: question -> URL (skip empty lines)
  const mapping = useMemo(() => {
    const result: { question: NexusQBQuestion; url: string; lineNum: number }[] = [];
    for (let i = 0; i < parsedLines.length && i < sortedQuestions.length; i++) {
      const url = parsedLines[i];
      if (url) {
        result.push({
          question: sortedQuestions[i],
          url,
          lineNum: i + 1,
        });
      }
    }
    return result;
  }, [parsedLines, sortedQuestions]);

  const handleReset = useCallback(() => {
    setStep('paste');
    setRawText('');
    setError('');
    setResult(null);
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  const handlePreview = useCallback(() => {
    if (mapping.length === 0) {
      setError('No valid URLs found. Paste one URL per line.');
      return;
    }
    setError('');
    setStep('preview');
  }, [mapping]);

  const handleSave = useCallback(async () => {
    setStep('saving');
    setError('');

    try {
      const token = await getToken();
      if (!token) {
        setError('Authentication failed');
        setStep('preview');
        return;
      }

      const links = mapping.map((m) => ({
        question_id: m.question.id,
        solution_video_url: m.url,
      }));

      const res = await fetch(`/api/question-bank/papers/${paperId}/video-links`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ links }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to save');
        setStep('preview');
        return;
      }

      setResult(json.data);
      setStep('done');
      onSuccess(json.message || `${json.data.updated} video links saved`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setStep('preview');
    }
  }, [getToken, mapping, paperId, onSuccess]);

  const extraLines = parsedLines.length > sortedQuestions.length
    ? parsedLines.length - sortedQuestions.length
    : 0;

  return (
    <Dialog
      open={open}
      onClose={step === 'saving' ? undefined : handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ContentPasteIcon sx={{ color: 'primary.main' }} />
        <Box sx={{ flex: 1 }}>
          Paste Video Links
        </Box>
        {step !== 'saving' && (
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Step 1: Paste */}
        {step === 'paste' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Paste one video URL per line. Line 1 = Q1, Line 2 = Q2, etc.
              Leave a line empty to skip that question. ({sortedQuestions.length} questions in this paper)
            </Typography>
            <TextField
              multiline
              minRows={8}
              maxRows={16}
              fullWidth
              placeholder={`https://youtube.com/watch?v=abc123\nhttps://youtube.com/watch?v=def456\n\nhttps://youtube.com/watch?v=ghi789`}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              sx={{
                '& .MuiInputBase-input': {
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                },
              }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              {parsedLines.length > 0 && (
                <>
                  <Chip
                    label={`${mapping.length} links`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    label={`${parsedLines.filter((l) => !l).length} skipped`}
                    size="small"
                    variant="outlined"
                  />
                  {extraLines > 0 && (
                    <Chip
                      label={`${extraLines} extra (ignored)`}
                      size="small"
                      color="warning"
                      variant="outlined"
                    />
                  )}
                </>
              )}
            </Box>
          </Box>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Review the mapping below. {mapping.length} question{mapping.length !== 1 ? 's' : ''} will be updated.
            </Typography>
            <Paper variant="outlined" sx={{ borderRadius: 1.5, overflow: 'auto', maxHeight: 400 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, width: 50 }}>Q#</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Video URL</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mapping.map((m) => (
                    <TableRow key={m.question.id}>
                      <TableCell>
                        <Chip label={m.lineNum} size="small" />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{ color: 'primary.main', wordBreak: 'break-all' }}
                        >
                          {m.url}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Box>
        )}

        {/* Step 3: Saving */}
        {step === 'saving' && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography variant="body1" fontWeight={600} sx={{ mb: 1.5 }}>
              Saving {mapping.length} video links...
            </Typography>
            <LinearProgress sx={{ height: 6, borderRadius: 3, maxWidth: 300, mx: 'auto' }} />
          </Box>
        )}

        {/* Step 4: Done */}
        {step === 'done' && result && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircleOutlinedIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
            <Typography variant="h6" fontWeight={700}>
              {result.updated} video link{result.updated !== 1 ? 's' : ''} saved
            </Typography>
            {result.errors.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
                {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}:
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {result.errors.map((e, i) => (
                    <li key={i}><Typography variant="caption">{e}</Typography></li>
                  ))}
                </ul>
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {step === 'paste' && (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handlePreview}
              disabled={!rawText.trim()}
            >
              Preview ({mapping.length})
            </Button>
          </>
        )}
        {step === 'preview' && (
          <>
            <Button onClick={() => setStep('paste')}>Back</Button>
            <Button variant="contained" onClick={handleSave}>
              Save {mapping.length} Link{mapping.length !== 1 ? 's' : ''}
            </Button>
          </>
        )}
        {step === 'done' && (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
